import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Landmark, Loader2, Lock, QrCode, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { MIDTRANS_METHODS, computeFee, methodLabel } from "@/lib/midtrans-shared";
import { createMidtransCharge, getMidtransPublicInfo, syncMidtransPayment } from "@/lib/midtrans.functions";
import { cn } from "@/lib/utils";

type Pay = {
  id: string; method: string; va_number: string | null; bank: string | null; qr_url: string | null;
  expires_at: string | null; gross_amount: number; created_at: string | null;
};

function countdown(ms: number) {
  if (ms <= 0) return "kedaluwarsa";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Nomor VA dipecah per 4 digit supaya mudah dibaca dan dicocokkan. */
const groupVa = (n: string) => n.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

const HOWTO_VA = [
  "Buka aplikasi m-banking atau datangi ATM bank yang kamu pilih.",
  "Pilih menu Transfer, lalu Virtual Account.",
  "Masukkan nomor Virtual Account di atas.",
  "Pastikan nominal sama persis dengan total bayar, lalu konfirmasi.",
  "Selesai. Status pesanan berubah otomatis dalam beberapa detik.",
];
const HOWTO_QR = [
  "Buka aplikasi e-wallet atau m-banking yang mendukung QRIS.",
  "Pilih menu Scan atau Bayar, lalu arahkan kamera ke kode QR.",
  "Periksa nominal di layar, lalu konfirmasi pembayaran.",
  "Selesai. Status pesanan berubah otomatis dalam beberapa detik.",
];

/** Rincian: nominal pesanan, biaya admin (jika ada), total. */
function Breakdown({ amount, fee }: { amount: number; fee: number }) {
  return (
    <dl className="space-y-1.5 rounded-xl border border-border bg-muted/50 p-3.5 text-sm">
      <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Pesanan</dt><dd className="tabular-nums">{formatRupiah(amount)}</dd></div>
      {fee > 0 && <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">Biaya admin pembayaran</dt><dd className="tabular-nums">{formatRupiah(fee)}</dd></div>}
      <div className="flex items-center justify-between gap-3 border-t border-dashed border-border pt-2 font-semibold"><dt>Total bayar</dt><dd className="text-base tabular-nums">{formatRupiah(amount + fee)}</dd></div>
    </dl>
  );
}

/** Indikator langkah: pilih metode, bayar, selesai (pop-up menutup sendiri saat lunas). */
function PayStepper({ step }: { step: 0 | 1 }) {
  const steps = ["Pilih metode", "Bayar", "Selesai"];
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Langkah pembayaran">
      {steps.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className={cn("flex items-center gap-2", i < steps.length - 1 && "flex-1")} aria-current={current ? "step" : undefined}>
            <span className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
              done ? "bg-primary text-primary-foreground" : current ? "bg-background text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground",
            )}>
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  async function go() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success("Disalin");
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error("Tidak bisa menyalin otomatis. Salin secara manual.");
    }
  }
  return (
    <Button type="button" variant={done ? "default" : "outline"} size="sm" className={cn("h-9 shrink-0", className)} aria-label={label} onClick={go}>
      {done ? <Check /> : <Copy />}{done ? "Tersalin" : "Salin"}
    </Button>
  );
}

function MethodOption({ kind, title, sub, selected, onSelect }: {
  kind: "va" | "qris"; title: string; sub: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]",
        selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/60",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {kind === "qris" ? <QrCode className="size-5" /> : <Landmark className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")} aria-hidden>
        {selected && <Check className="size-3" strokeWidth={3.5} />}
      </span>
    </button>
  );
}

/** Pop-up di layar lebar, bottom sheet di HP. Isi dan footer dipisah supaya tombol utama selalu terlihat. */
function PaySheet({ mobile, open, onOpenChange, title, description, footer, children }: {
  mobile: boolean; open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; footer: ReactNode; children: ReactNode;
}) {
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {footer && <div className="border-t border-border bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-6 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-border bg-background px-6 py-4">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

/** Pop-up pembayaran Midtrans Core API: pilih metode -> kode VA / QRIS -> status otomatis. */
export function MidtransPayDialog({ orderId, amount, open, onOpenChange, onPaid }: {
  orderId: string; amount: number; open: boolean; onOpenChange: (open: boolean) => void; onPaid: () => void;
}) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
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
        .select("id,method,va_number,bank,qr_url,expires_at,gross_amount,created_at")
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
  const vaMethods = methods.filter((m) => m.kind === "va");
  const qrMethods = methods.filter((m) => m.kind === "qris");
  const fees = info.data?.fees;
  const feeFor = (id: string) => (fees ? computeFee(fees[id as keyof typeof fees], amount) : 0);
  const feeText = (id: string) => { const f = feeFor(id); return f > 0 ? `Biaya admin ${formatRupiah(f)}` : "Tanpa biaya admin"; };
  const showPicker = !pay || changing;
  // Biaya pada pembayaran yang sudah dibuat = total dikurangi nominal pesanan (tanpa perlu kolom baru).
  const payFee = pay ? Math.max(0, Math.round(Number(pay.gross_amount) - amount)) : 0;
  const total = pay && !changing ? Number(pay.gross_amount) : amount + (method ? feeFor(method) : 0);

  const remainingMs = pay?.expires_at ? new Date(pay.expires_at).getTime() - now : null;
  const totalMs = pay?.expires_at && pay.created_at ? new Date(pay.expires_at).getTime() - new Date(pay.created_at).getTime() : null;
  const pct = remainingMs !== null && totalMs && totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const urgent = remainingMs !== null && remainingMs < 5 * 60_000;
  const enabled = !!info.data?.enabled;

  const body = (
    <div className="space-y-4">
      {enabled && <PayStepper step={showPicker ? 0 : 1} />}

      {/* Nominal besar: yang paling penting dilihat sebelum membayar. */}
      <div className="relative overflow-hidden rounded-2xl bg-header-gradient p-4 text-header-foreground shadow-sm">
        <div className="bg-hero absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-header-foreground/70">Total pembayaran</p>
            <p className="mt-0.5 truncate text-3xl font-bold tracking-tight tabular-nums">{formatRupiah(total)}</p>
          </div>
          {pay && !changing && (
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">{methodLabel(pay.method)}</span>
          )}
        </div>
        <p className="relative mt-2 flex items-center gap-1.5 text-xs text-header-foreground/75"><Lock className="size-3.5" /> Dana ditahan di escrow sampai kamu menerima hasil.</p>
      </div>

      {info.data?.mode === "sandbox" && (
        <p className="rounded-lg border border-star/40 bg-star/10 p-2.5 text-xs">Mode uji coba (sandbox): tidak memakai uang asli. Bayar lewat simulator Midtrans.</p>
      )}

      {info.isLoading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}
      {info.data && !info.data.enabled && <p className="rounded-xl border border-border bg-muted p-3 text-sm">Pembayaran online belum diaktifkan admin.</p>}
      {enabled && showPicker && methods.length === 0 && <p className="rounded-xl border border-border bg-muted p-3 text-sm">Belum ada metode pembayaran yang aktif. Coba lagi nanti.</p>}

      {/* Langkah 1: pilih metode */}
      {enabled && showPicker && methods.length > 0 && (
        <div className="space-y-4">
          {vaMethods.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Virtual Account</p>
              <div role="radiogroup" aria-label="Virtual Account" className="grid gap-2 sm:grid-cols-2">
                {vaMethods.map((m) => (
                  <MethodOption key={m.id} kind="va" title={m.label.replace("Virtual Account ", "")} sub={feeText(m.id)} selected={method === m.id} onSelect={() => setMethod(m.id)} />
                ))}
              </div>
            </div>
          )}
          {qrMethods.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">QRIS</p>
              <div role="radiogroup" aria-label="QRIS" className="grid gap-2">
                {qrMethods.map((m) => (
                  <MethodOption key={m.id} kind="qris" title="QRIS" sub={`${feeText(m.id)} · e-wallet dan m-banking`} selected={method === m.id} onSelect={() => setMethod(m.id)} />
                ))}
              </div>
            </div>
          )}
          {method && <Breakdown amount={amount} fee={feeFor(method)} />}
          {pay && <p className="text-xs text-muted-foreground">Membuat pembayaran baru membatalkan kode yang lama.</p>}
        </div>
      )}

      {/* Langkah 2: bayar */}
      {enabled && pay && !changing && (
        <div className="space-y-4">
          <div className={cn("rounded-xl border p-3", urgent ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40")} aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {!expired && (
                  <span className="relative flex size-2.5" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                  </span>
                )}
                {expired ? "Kode kedaluwarsa" : "Menunggu pembayaran"}
              </span>
              <span className={cn("font-mono text-sm font-semibold tabular-nums", urgent && "text-destructive")}>
                {remainingMs !== null ? countdown(remainingMs) : "—"}
              </span>
            </div>
            {pct !== null && (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Sisa waktu pembayaran" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <div className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", urgent ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
              </div>
            )}
            {expired && <p className="mt-2 text-xs text-muted-foreground">Tekan Ganti metode untuk membuat kode pembayaran baru.</p>}
          </div>

          {pay.va_number && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Nomor Virtual Account{pay.bank ? ` ${pay.bank.toUpperCase()}` : ""}</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="min-w-0 break-all font-mono text-xl font-bold tracking-wide sm:text-2xl">{groupVa(pay.va_number)}</p>
                <CopyButton text={pay.va_number} label="Salin nomor Virtual Account" />
              </div>
            </div>
          )}

          {pay.qr_url && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4">
              <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                <img src={pay.qr_url} alt="Kode QRIS" className="size-52 object-contain sm:size-56" />
              </div>
              <p className="text-center text-xs text-muted-foreground">Scan dengan e-wallet atau m-banking apa pun yang mendukung QRIS.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Nominal transfer (harus tepat)</p>
              <p className="text-lg font-bold tabular-nums">{formatRupiah(Number(pay.gross_amount))}</p>
            </div>
            <CopyButton text={String(Math.round(Number(pay.gross_amount)))} label="Salin nominal transfer" />
          </div>

          <Breakdown amount={Number(pay.gross_amount) - payFee} fee={payFee} />

          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Cara membayar
              <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <ol className="list-decimal space-y-1.5 pb-3.5 pl-8 pr-3.5 text-sm text-muted-foreground">
              {(pay.qr_url ? HOWTO_QR : HOWTO_VA).map((s) => <li key={s}>{s}</li>)}
            </ol>
          </details>

          <p className="text-xs text-muted-foreground">Bayar tepat sesuai total{payFee > 0 ? " (sudah termasuk biaya admin)" : ""}. Pop-up ini menutup otomatis saat pembayaran terdeteksi.</p>
        </div>
      )}
    </div>
  );

  const footer = !enabled ? null : showPicker ? (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <Button className="h-12 flex-1 text-base sm:h-11 sm:flex-none sm:px-8" onClick={create} disabled={busy || !method}>
        {busy ? <Loader2 className="animate-spin" /> : <Lock />} {method ? "Lanjut ke pembayaran" : "Pilih metode dulu"}
      </Button>
      {pay && <Button variant="ghost" className="h-11" onClick={() => setChanging(false)}>Kembali</Button>}
    </div>
  ) : (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <Button className="h-12 flex-1 text-base sm:h-11 sm:flex-none sm:px-6" onClick={checkNow} disabled={checking}>
        {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Cek status pembayaran
      </Button>
      <Button variant="outline" className="h-11" onClick={() => { setMethod(""); setChanging(true); }}>Ganti metode</Button>
    </div>
  );

  return (
    <PaySheet
      mobile={isMobile}
      open={open}
      onOpenChange={onOpenChange}
      title={showPicker ? "Pilih metode pembayaran" : "Selesaikan pembayaran"}
      description="Dana disimpan di escrow dan baru diteruskan ke developer setelah kamu menerima hasil pekerjaan."
      footer={footer}
    >
      {body}
    </PaySheet>
  );
}
