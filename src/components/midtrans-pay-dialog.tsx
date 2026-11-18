import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Landmark, Loader2, QrCode, RefreshCw, ShieldCheck, Timer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { MIDTRANS_METHODS, computeFee, methodLabel } from "@/lib/midtrans-shared";
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

/** Ikon metode: QR / dompet digital memakai ikon QR, sisanya (Virtual Account bank) memakai ikon bank. */
function MethodIcon({ id, className }: { id: string; className?: string }) {
  return /qris|gopay|shopee|dana|ovo|qr/i.test(id) ? <QrCode className={className} /> : <Landmark className={className} />;
}

/** Baris rincian: nominal pesanan, biaya admin (jika ada), total. */
function Breakdown({ amount, fee }: { amount: number; fee: number }) {
  return (
    <dl className="space-y-1.5 rounded-xl bg-muted p-3.5 text-sm">
      <div className="flex items-center justify-between"><dt className="text-muted-foreground">Pesanan</dt><dd>{formatRupiah(amount)}</dd></div>
      {fee > 0 && <div className="flex items-center justify-between"><dt className="text-muted-foreground">Biaya admin pembayaran</dt><dd>{formatRupiah(fee)}</dd></div>}
      <div className="flex items-center justify-between border-t border-border pt-2"><dt className="font-medium">Total bayar</dt><dd className="text-base font-bold text-primary">{formatRupiah(amount + fee)}</dd></div>
    </dl>
  );
}

/** Dua langkah: pilih metode, lalu bayar. */
function Stepper({ step }: { step: 1 | 2 }) {
  const items = ["Pilih metode", "Bayar"];
  return (
    <ol className="mt-3 flex items-center gap-2 text-xs" aria-label="Langkah pembayaran">
      {items.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold", done || current ? "bg-primary text-primary-foreground" : "bg-white/15 text-white/70")}>
              {done ? <Check className="size-3" /> : n}
            </span>
            <span className={cn(current ? "font-semibold text-white" : "text-white/70")} aria-current={current ? "step" : undefined}>{label}</span>
            {i < items.length - 1 && <span className="mx-1 h-px w-6 bg-white/25" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Pop-up pembayaran Midtrans Core API: pilih metode -> kode VA / QRIS -> status otomatis. Di HP tampil sebagai panel dari bawah layar. */
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
  const fees = info.data?.fees;
  const feeFor = (id: string) => (fees ? computeFee(fees[id as keyof typeof fees], amount) : 0);
  const showPicker = !pay || changing;
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Disalin"); };
  // Biaya pada pembayaran yang sudah dibuat = total dikurangi nominal pesanan (tanpa perlu kolom baru).
  const payFee = pay ? Math.max(0, Math.round(Number(pay.gross_amount) - amount)) : 0;
  const total = pay && !changing ? Number(pay.gross_amount) : amount + (method ? feeFor(method) : 0);
  const remaining = pay?.expires_at ? new Date(pay.expires_at).getTime() - now : null;
  const urgent = remaining !== null && remaining < 5 * 60 * 1000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92dvh] gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-w-md sm:rounded-2xl",
          // Di HP: panel menempel di bawah layar, sudut atas membulat.
          "max-sm:bottom-0! max-sm:left-0! max-sm:top-auto! max-sm:w-full! max-sm:max-w-full! max-sm:translate-x-0! max-sm:translate-y-0! max-sm:rounded-b-none! max-sm:rounded-t-3xl!",
          "[&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100",
        )}
      >
        <DialogHeader className="space-y-1 bg-header-gradient px-5 pb-5 pt-6 text-left text-header-foreground">
          <p className="text-xs font-medium uppercase tracking-wider text-header-foreground/70">Total pembayaran</p>
          <DialogTitle className="text-3xl font-bold tracking-tight text-white"><span className="sr-only">Bayar </span>{formatRupiah(total)}</DialogTitle>
          <DialogDescription className="flex items-start gap-1.5 text-xs text-header-foreground/75">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary-glow" />
            Dana disimpan di escrow dan baru diteruskan ke developer setelah kamu menerima hasil pekerjaan.
          </DialogDescription>
          {info.data?.enabled && <Stepper step={showPicker ? 1 : 2} />}
        </DialogHeader>

        <div className="space-y-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {info.data?.mode === "sandbox" && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">Mode uji coba (sandbox): tidak memakai uang asli. Bayar lewat simulator Midtrans.</p>
          )}
          {info.isLoading && (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}
            </div>
          )}
          {info.data && !info.data.enabled && <p className="rounded-xl bg-muted p-4 text-sm">Pembayaran online belum diaktifkan admin.</p>}

          {info.data?.enabled && showPicker && (
            <div className="space-y-4">
              <div role="radiogroup" aria-label="Metode pembayaran" className="grid gap-2">
                {methods.map((m) => {
                  const fee = feeFor(m.id);
                  const selected = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left text-sm transition active:scale-[0.99]",
                        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/50 hover:bg-accent/40",
                      )}
                    >
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <MethodIcon id={m.id} className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{fee > 0 ? `Biaya admin ${formatRupiah(fee)}` : "Tanpa biaya admin"}</span>
                      </span>
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-input")} aria-hidden>
                        {selected && <Check className="size-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {method && <Breakdown amount={amount} fee={feeFor(method)} />}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {pay && <Button variant="ghost" className="h-11 sm:h-10" onClick={() => setChanging(false)}>Kembali</Button>}
                <Button className="h-11 flex-1 sm:h-10" onClick={create} disabled={busy || !method}>
                  {busy && <Loader2 className="animate-spin" />} Buat pembayaran
                </Button>
              </div>
              {pay && <p className="text-xs text-muted-foreground">Membuat pembayaran baru membatalkan kode yang lama.</p>}
            </div>
          )}

          {info.data?.enabled && pay && !changing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-medium">
                  <MethodIcon id={pay.method} className="size-4 text-primary" /> {methodLabel(pay.method)}
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums", urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                  <Timer className="size-3.5" /> {remaining !== null ? countdown(remaining) : "—"}
                </span>
              </div>

              {pay.va_number && (
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">Nomor Virtual Account {pay.bank ? pay.bank.toUpperCase() : ""}</p>
                  <p className="mt-1 break-all font-mono text-2xl font-bold tracking-wide">{pay.va_number}</p>
                  <Button type="button" variant="outline" className="mt-3 h-11 w-full sm:h-10" onClick={() => copy(pay.va_number!)}><Copy /> Salin nomor VA</Button>
                </div>
              )}
              {pay.qr_url && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-4">
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-border">
                    <img src={pay.qr_url} alt="Kode QRIS" className="size-52 object-contain sm:size-56" />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">Scan dengan aplikasi bank atau e-wallet apa pun yang mendukung QRIS.</p>
                </div>
              )}

              <Breakdown amount={Number(pay.gross_amount) - payFee} fee={payFee} />

              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
                Menunggu pembayaran. Pop-up menutup otomatis saat pembayaran terdeteksi{payFee > 0 ? "; bayar tepat sesuai total, sudah termasuk biaya admin" : ""}.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="h-11 flex-1 sm:h-10" onClick={checkNow} disabled={checking}>
                  {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Cek status
                </Button>
                <Button variant="ghost" className="h-11 sm:h-10" onClick={() => { setMethod(""); setChanging(true); }}>Ganti metode</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
