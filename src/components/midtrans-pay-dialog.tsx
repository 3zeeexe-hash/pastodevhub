import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { MIDTRANS_METHODS, methodLabel } from "@/lib/midtrans-shared";
import { createMidtransCharge, getMidtransPublicInfo, syncMidtransPayment } from "@/lib/midtrans.functions";
import { cn } from "@/lib/utils";

type Pay = { id: string; method: string; va_number: string | null; bank: string | null; qr_url: string | null; expires_at: string | null; gross_amount: number };

function countdown(ms: number) {
  if (ms <= 0) return "kedaluwarsa";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Pop-up pembayaran Midtrans Core API: pilih metode -> kode VA / QRIS -> status otomatis. */
export function MidtransPayDialog({ orderId, amount, open, onOpenChange, onPaid }: {
  orderId: string; amount: number; open: boolean; onOpenChange: (open: boolean) => void; onPaid: () => void;
}) {
  const qc = useQueryClient();
  const loadInfo = useServerFn(getMidtransPublicInfo);
  const charge = useServerFn(createMidtransCharge);
  const sync = useServerFn(syncMidtransPayment);
  const [method, setMethod] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const info = useQuery({ queryKey: ["midtrans-public"], queryFn: () => loadInfo(), enabled: open, staleTime: 60_000 });
  const active = useQuery({
    queryKey: ["pay-active", orderId],
    enabled: open,
    queryFn: async (): Promise<Pay | null> => {
      const { data } = await looseDb.from("payments")
        .select("id,method,va_number,bank,qr_url,expires_at,gross_amount")
        .eq("order_id", orderId).eq("status", "pending").order("created_at", { ascending: false }).limit(1);
      const p = ((data as Pay[] | null)?.[0] ?? null);
      return p && (!p.expires_at || new Date(p.expires_at).getTime() > Date.now()) ? p : null;
    },
  });
  const pay = active.data ?? null;

  useEffect(() => {
    if (!open || !pay) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, pay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask Midtrans for the real status every few seconds (the callback also does this server-side).
  useEffect(() => {
    if (!open || !pay) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await sync({ data: { orderId } });
        if (!stop && r.orderStatus && r.orderStatus !== "awaiting_payment" && r.orderStatus !== "payment_review") {
          toast.success("Pembayaran diterima. Dana disimpan di escrow.");
          onPaid();
          onOpenChange(false);
        }
      } catch { /* retry on the next tick */ }
    };
    const t = setInterval(tick, 6000);
    return () => { stop = true; clearInterval(t); };
  }, [open, pay?.id, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!method) { toast.error("Pilih metode pembayaran dulu."); return; }
    setBusy(true);
    try {
      await charge({ data: { orderId, method } });
      setChanging(false);
      await qc.invalidateQueries({ queryKey: ["pay-active", orderId] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    setChecking(true);
    try {
      const r = await sync({ data: { orderId } });
      if (r.orderStatus && r.orderStatus !== "awaiting_payment" && r.orderStatus !== "payment_review") {
        toast.success("Pembayaran diterima.");
        onPaid();
        onOpenChange(false);
      } else toast.info("Belum ada pembayaran masuk. Coba lagi setelah membayar.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setChecking(false);
    }
  }

  const methods = MIDTRANS_METHODS.filter((m) => info.data?.methods.includes(m.id));
  const showPicker = !pay || changing;
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Disalin"); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bayar {formatRupiah(amount)}</DialogTitle>
          <DialogDescription>Dana disimpan di escrow dan langsung diteruskan ke developer begitu kamu menerima hasil pekerjaan.</DialogDescription>
        </DialogHeader>

        {info.data?.mode === "sandbox" && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">Mode uji coba (sandbox): tidak memakai uang asli. Bayar lewat simulator Midtrans.</p>
        )}
        {info.isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {info.data && !info.data.enabled && <p className="rounded-md bg-muted p-3 text-sm">Pembayaran online belum diaktifkan admin.</p>}

        {info.data?.enabled && showPicker && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Pilih metode pembayaran</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => setMethod(m.id)}
                  className={cn("rounded-lg border px-3 py-2 text-left text-sm hover:border-primary/60", method === m.id ? "border-primary bg-primary/10 font-medium" : "border-border")}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={create} disabled={busy || !method}>{busy && <Loader2 className="animate-spin" />} Buat pembayaran</Button>
              {pay && <Button variant="ghost" onClick={() => setChanging(false)}>Kembali</Button>}
            </div>
            {pay && <p className="text-xs text-muted-foreground">Membuat pembayaran baru membatalkan kode yang lama.</p>}
          </div>
        )}

        {info.data?.enabled && pay && !changing && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{methodLabel(pay.method)}</span>
              <span className="text-muted-foreground">Sisa waktu {pay.expires_at ? countdown(new Date(pay.expires_at).getTime() - now) : "—"}</span>
            </div>
            {pay.va_number && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Nomor Virtual Account {pay.bank ? pay.bank.toUpperCase() : ""}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="break-all font-mono text-xl font-bold">{pay.va_number}</p>
                  <Button type="button" variant="outline" size="icon" aria-label="Salin nomor VA" onClick={() => copy(pay.va_number!)}><Copy /></Button>
                </div>
              </div>
            )}
            {pay.qr_url && (
              <div className="flex justify-center rounded-lg border border-border bg-white p-3">
                <img src={pay.qr_url} alt="Kode QRIS" className="size-56 object-contain" />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3 text-sm">
              <span>Total bayar</span>
              <b>{formatRupiah(pay.gross_amount)}</b>
            </div>
            <p className="text-xs text-muted-foreground">Setelah membayar, halaman ini menutup otomatis saat pembayaran terdeteksi.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={checkNow} disabled={checking}>{checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Cek status</Button>
              <Button variant="ghost" onClick={() => { setMethod(""); setChanging(true); }}>Ganti metode</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
