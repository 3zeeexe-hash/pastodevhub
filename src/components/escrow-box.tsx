import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { ESCROW_STATUS_LABEL, PAYMENT_STATUS_LABEL, escrowStage, methodLabel } from "@/lib/midtrans-shared";
import { Button } from "@/components/ui/button";

type Ledger = { status: string; net: number; fee: number; gross: number; released_at: string | null; note: string | null };
type PayRow = { id: string; method: string; status: string; gross_amount: number; paid_at: string | null; created_at: string; needs_refund: boolean };

/** Escrow + Midtrans payment summary on the order page. Admin gets the manual release controls. */
export function EscrowBox({ order, isAdmin, isSeller, onChanged }: {
  order: { id: string; kind: string; status: string }; isAdmin: boolean; isSeller: boolean; onChanged: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["escrow", order.id, order.status],
    queryFn: async () => {
      const [l, p] = await Promise.all([
        looseDb.from("escrow_ledger").select("status,net,fee,gross,released_at,note").eq("order_id", order.id).maybeSingle(),
        looseDb.from("payments").select("id,method,status,gross_amount,paid_at,created_at,needs_refund").eq("order_id", order.id).order("created_at", { ascending: false }).limit(10),
      ]);
      return { ledger: (l.data ?? null) as Ledger | null, payments: ((p.data ?? []) as PayRow[]) };
    },
  });
  if (!data || (!data.ledger && data.payments.length === 0)) return null;
  const { ledger, payments } = data;

  async function act(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await looseDb.rpc(fn, args);
    if (error) toast.error(errMsg(error)); else { toast.success(ok); onChanged(); }
  }

  const stage = ledger ? escrowStage(ledger, order.kind, order.status) : null;
  const canRelease = stage === "ready_for_admin" || stage === "auto_available";
  let hint = "";
  if (stage === "waiting_delivery") hint = "Dana disimpan di escrow sampai client menerima hasil, lalu langsung diteruskan ke developer.";
  else if (stage === "ready_for_admin") hint = "Client sudah menerima hasil tetapi dana belum diteruskan: admin bisa meneruskannya sekarang.";
  else if (stage === "auto_available") hint = "Karya: bagian developer langsung tersedia, tanpa masa tahan.";

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Pembayaran & escrow</h2>
      {ledger && (
        <div className="mt-2 space-y-1 text-sm">
          <p><b>{ESCROW_STATUS_LABEL[ledger.status] ?? ledger.status}</b>{ledger.released_at && <span className="text-muted-foreground"> · {timeAgo(ledger.released_at)}</span>}</p>
          {(isSeller || isAdmin) && <p className="text-muted-foreground">Bagian developer {formatRupiah(ledger.net)} (biaya platform {formatRupiah(ledger.fee, "Rp0")}).</p>}
          {hint && <p className="text-muted-foreground">{hint}</p>}
          {ledger.note && <p className="text-muted-foreground">Catatan: {ledger.note}</p>}
        </div>
      )}
      {isAdmin && ledger && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ledger.status === "held" && (
            <Button size="sm" disabled={!canRelease} onClick={() => {
              if (confirm("Teruskan saldo pesanan ini ke developer? Tindakan ini manual dan tercatat.")) act("admin_release_escrow", { _order_id: order.id, _note: "" }, "Saldo diteruskan ke developer");
            }}>Teruskan saldo ke developer</Button>
          )}
          {ledger.status === "held" && (
            <Button size="sm" variant="outline" onClick={() => { const n = prompt("Alasan membekukan dana?"); if (n) act("admin_set_escrow", { _order_id: order.id, _action: "freeze", _note: n }, "Dana dibekukan"); }}>Bekukan</Button>
          )}
          {ledger.status === "frozen" && (
            <Button size="sm" variant="outline" onClick={() => act("admin_set_escrow", { _order_id: order.id, _action: "unfreeze", _note: "" }, "Pembekuan dicabut")}>Cabut pembekuan</Button>
          )}
          {(ledger.status === "held" || ledger.status === "frozen") && (
            <Button size="sm" variant="ghost" onClick={() => { const n = prompt("Alasan refund? Dana masuk ke saldo client di platform dan pesanan dibatalkan."); if (n) act("admin_set_escrow", { _order_id: order.id, _action: "refund", _note: n }, "Dana dikembalikan ke saldo client"); }}>Refund ke saldo client</Button>
          )}
        </div>
      )}
      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border text-xs">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>{methodLabel(p.method)} · {formatRupiah(p.gross_amount)}</span>
              <span className="text-muted-foreground">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}{p.needs_refund ? " · perlu refund" : ""} · {timeAgo(p.paid_at ?? p.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
