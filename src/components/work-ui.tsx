import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";
import { errMsg } from "@/lib/market";
import { workRpc } from "@/lib/work-db";
import { CONTRACT_STATUS_LABEL, MILESTONE_STATUS_LABEL, type ContractStatus, type MilestoneStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TONE = {
  neutral: "bg-secondary text-foreground",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-red-500/15 text-red-700 dark:text-red-300",
  brand: "bg-primary/15 text-primary",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone])}>{children}</span>;
}

const CONTRACT_TONE: Record<ContractStatus, keyof typeof TONE> = {
  draft: "neutral", waiting_approval: "warn", active: "ok", completed: "brand", cancelled: "bad", disputed: "bad",
};
export const ContractPill = ({ status }: { status: ContractStatus }) => <Pill tone={CONTRACT_TONE[status]}>{CONTRACT_STATUS_LABEL[status]}</Pill>;

const MILESTONE_TONE: Record<MilestoneStatus, keyof typeof TONE> = {
  pending: "neutral", awaiting_payment: "warn", funded: "info", in_progress: "info", submitted: "brand",
  revision_requested: "warn", approved: "ok", released: "ok", cancelled: "bad", disputed: "bad",
};
export const MilestonePill = ({ status }: { status: MilestoneStatus }) => <Pill tone={MILESTONE_TONE[status]}>{MILESTONE_STATUS_LABEL[status]}</Pill>;

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl bg-card p-5 text-sm shadow-sm ring-1 ring-destructive/40">
      <p className="font-semibold text-destructive">Gagal memuat data</p>
      <p className="mt-1 text-muted-foreground">{errMsg(error)}</p>
      <p className="mt-2 text-xs text-muted-foreground">Jika pesan menyebut tabel atau fungsi tidak ditemukan, jalankan SQL di docs/sql/gobi-work/ (001 sampai 007) di SQL editor database.</p>
      {onRetry && <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={onRetry}>Coba lagi</Button>}
    </div>
  );
}

/** Menjalankan aksi dengan status sibuk, toast sukses/gagal, lalu menyegarkan data. */
export function useRun(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

export type Ask = { title: string; description?: string; label: string; min: number; confirm: string; onSubmit: (text: string) => Promise<void> };

/** Dialog alasan/catatan wajib (tolak, revisi, sengketa, pembatalan). Validasi panjang di klien; database tetap penentu akhir. */
export function ReasonDialog({ ask, onClose }: { ask: Ask | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = text.trim().length >= (ask?.min ?? 1);
  function close() { if (!busy) { setText(""); onClose(); } }
  async function go() {
    if (!ask || !ok) return;
    setBusy(true);
    try { await ask.onSubmit(text.trim()); setText(""); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!ask} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ask?.title}</DialogTitle>
          {ask?.description && <DialogDescription>{ask.description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason-text">{ask?.label}</Label>
          <Textarea id="reason-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <p className="text-xs text-muted-foreground">Minimal {ask?.min} karakter ({text.trim().length} sekarang).</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>Batal</Button>
          <Button onClick={go} disabled={!ok || busy}>{busy && <Loader2 className="animate-spin" />}{ask?.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ReportTarget = "profile" | "job" | "application" | "contract" | "conversation" | "project";

/** Alasan laporan + penjelasan singkat. Tiga alasan pertama butuh SQL 007; sebelum itu dikirim sebagai "Lainnya" dengan label di keterangan. */
export const REPORT_REASONS: { value: string; label: string; hint: string; needsDetail?: boolean }[] = [
  { value: "not_completed", label: "Pekerjaan tidak diselesaikan", hint: "Tugas atau hasil tidak diselesaikan sesuai kesepakatan.", needsDetail: true },
  { value: "funds_held", label: "Dana tertahan", hint: "Dana belum diteruskan, atau pihak lain menahan persetujuan tanpa alasan jelas.", needsDetail: true },
  { value: "non_response", label: "Tidak merespons", hint: "Pihak lain tidak membalas pesan atau tidak menanggapi sampai lewat batas waktu.", needsDetail: true },
  { value: "fraud", label: "Penipuan", hint: "Dugaan penipuan atau identitas palsu." },
  { value: "abuse", label: "Pelecehan / kasar", hint: "Bahasa kasar, ancaman, atau pelecehan." },
  { value: "spam", label: "Spam", hint: "Promosi atau pesan berulang yang tidak relevan." },
  { value: "policy", label: "Melanggar kebijakan", hint: "Konten atau perilaku yang melanggar aturan GOBI." },
  { value: "other", label: "Lainnya", hint: "Masalah lain yang tidak ada di daftar." },
];
export const reportReasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

/** Tombol laporan ke admin (work_file_report: dibatasi 10 laporan per hari di database). */
export function ReportButton({ targetType, targetId, label = "Laporkan", className, defaultReason = "policy" }: {
  targetType: ReportTarget; targetId: string; label?: string; className?: string; defaultReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const info = REPORT_REASONS.find((r) => r.value === reason);
  async function send() {
    if (info?.needsDetail && detail.trim().length < 10) { toast.error("Ceritakan kejadiannya (minimal 10 karakter) agar admin bisa menindaklanjuti."); return; }
    setBusy(true);
    try {
      try {
        await workRpc("work_file_report", { _target_type: targetType, _target_id: targetId, _reason: reason, _detail: detail.trim() });
      } catch (e) {
        // SQL 007 belum dijalankan: alasan baru ditolak database, kirim sebagai "Lainnya" dengan label di keterangan.
        if (!/check constraint|reason_check|violates/i.test(errMsg(e))) throw e;
        await workRpc("work_file_report", { _target_type: targetType, _target_id: targetId, _reason: "other", _detail: `[${info?.label ?? reason}] ${detail.trim()}` });
      }
      toast.success("Laporan terkirim ke admin");
      setOpen(false); setDetail("");
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={className} onClick={() => { setReason(defaultReason); setOpen(true); }}><Flag /> {label}</Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kirim laporan</DialogTitle>
            <DialogDescription>Admin memeriksa laporanmu bersama riwayat kontrak, pembayaran, dan obrolan. Laporan palsu berulang bisa membatasi akunmu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Alasan</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {info && <p className="text-xs text-muted-foreground">{info.hint}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-detail">Keterangan{info?.needsDetail ? " (wajib)" : ""}</Label>
              <Textarea id="report-detail" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={2000} placeholder="Ceritakan apa yang terjadi, kapan, dan apa yang sudah disepakati." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Batal</Button>
            <Button onClick={send} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Kirim laporan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
