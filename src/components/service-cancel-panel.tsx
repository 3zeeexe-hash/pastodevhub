import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import type { ServiceOrderStage } from "@/lib/services";
import { cancelReasonErrors, cancelUi, type CancelRole } from "@/lib/services-buyer";
import { serviceRpc } from "@/lib/services-db";
import { Button } from "@/components/ui/button";
import { ReasonDialog, type Ask } from "@/components/work-ui";

type CancelOrder = { stage: ServiceOrderStage; cancel_requested_by: string | null; cancel_reason: string | null };

/**
 * Pembatalan pesanan paket. Sebelum penjual menerima, pembeli membatalkan langsung (dana dikembalikan lewat admin).
 * Saat dikerjakan, pembatalan diajukan salah satu pihak dan dijawab pihak lawan. Aturan sebenarnya ditegakkan fungsi database
 * (service_cancel_order, service_respond_cancel, service_withdraw_cancel); tombol di sini hanya mengikuti hasilnya.
 */
export function ServiceCancelPanel({ orderId, buyerId, sellerId, onChanged }: {
  orderId: string; buyerId: string; sellerId: string; onChanged?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["service-cancel", orderId],
    queryFn: async () => {
      const { data, error } = await looseDb.from("service_orders").select("stage,cancel_requested_by,cancel_reason").eq("order_id", orderId).limit(1);
      if (error) return null;
      return (((data ?? []) as CancelOrder[])[0]) ?? null;
    },
  });

  const so = q.data;
  if (!so || !user) return null;
  const role: CancelRole = user.id === buyerId ? "buyer" : user.id === sellerId ? "seller" : null;
  const ui = cancelUi(so.stage, role, so.cancel_requested_by, user.id);
  if (ui === "none") return null;
  const direct = so.stage === "pending_seller_acceptance";

  async function call<T>(fn: string, args: Record<string, unknown>, ok: (res: T | null) => string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await serviceRpc<T>(fn, args);
      toast.success(ok(res ?? null));
      await qc.invalidateQueries({ queryKey: ["service-cancel", orderId] });
      await qc.invalidateQueries({ queryKey: ["service-buyer-orders"] });
      await qc.invalidateQueries({ queryKey: ["service-seller-orders"] });
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function askCancel() {
    setAsk({
      title: direct ? "Batalkan pesanan" : "Ajukan pembatalan",
      label: direct ? "Alasan pembatalan" : "Alasan pembatalan (dikirim ke pihak lawan)",
      min: 10,
      confirm: direct ? "Batalkan pesanan" : "Kirim permintaan",
      onSubmit: async (t) => {
        const errs = cancelReasonErrors(t);
        if (errs.length) { toast.error(errs[0]); return; }
        await call<string>("service_cancel_order", { _order_id: orderId, _reason: t.trim() },
          (res) => (res === "cancelled" ? "Pesanan dibatalkan. Dana akan dikembalikan melalui admin." : "Permintaan pembatalan dikirim"));
      },
    });
  }

  function askReject() {
    setAsk({
      title: "Tolak pembatalan", label: "Alasan menolak (dikirim ke pihak lawan)", min: 10, confirm: "Tolak pembatalan",
      onSubmit: async (t) => {
        const errs = cancelReasonErrors(t);
        if (errs.length) { toast.error(errs[0]); return; }
        await call("service_respond_cancel", { _order_id: orderId, _accept: false, _note: t.trim() }, () => "Permintaan pembatalan ditolak, pesanan dilanjutkan");
      },
    });
  }

  function accept() {
    if (!confirm("Setujui pembatalan? Pesanan dibatalkan dan dana dikembalikan ke pembeli melalui admin.")) return;
    void call("service_respond_cancel", { _order_id: orderId, _accept: true, _note: null }, () => "Pembatalan disetujui. Dana akan dikembalikan melalui admin.");
  }

  function withdraw() {
    void call("service_withdraw_cancel", { _order_id: orderId }, () => "Permintaan pembatalan ditarik");
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Pembatalan pesanan">
      <h2 className="font-semibold">Pembatalan pesanan</h2>

      {ui === "request" && (
        <>
          <p className="text-sm text-muted-foreground">
            {direct
              ? "Penjual belum menerima pesanan ini, jadi kamu bisa membatalkannya sekarang. Dana dibekukan dan dikembalikan melalui admin."
              : "Pembatalan saat pesanan dikerjakan perlu persetujuan pihak lawan. Bicarakan dulu lewat chat; kalau tidak ada kesepakatan, hubungi admin."}
          </p>
          <Button variant="outline" disabled={busy} onClick={askCancel}><Ban /> {direct ? "Batalkan pesanan" : "Ajukan pembatalan"}</Button>
        </>
      )}

      {ui === "respond" && (
        <div className="space-y-3">
          <p className="rounded-md bg-muted p-3 text-sm">
            <b>{so.cancel_requested_by === buyerId ? "Pembeli" : "Penjual"} mengajukan pembatalan:</b>{" "}
            <span className="whitespace-pre-wrap break-words">{so.cancel_reason}</span>
          </p>
          <p className="text-sm text-muted-foreground">Jika disetujui, pesanan dibatalkan dan dana dikembalikan ke pembeli melalui admin. Jika ditolak, pesanan dilanjutkan.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={accept}><Check /> Setujui pembatalan</Button>
            <Button variant="outline" disabled={busy} onClick={askReject}><X /> Tolak</Button>
          </div>
        </div>
      )}

      {ui === "waiting" && (
        <div className="space-y-3">
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Permintaan pembatalanmu menunggu jawaban pihak lawan.{so.cancel_reason ? <> Alasanmu: <span className="whitespace-pre-wrap break-words">{so.cancel_reason}</span></> : null}
          </p>
          <Button variant="outline" disabled={busy} onClick={withdraw}>Tarik permintaan</Button>
        </div>
      )}

      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
