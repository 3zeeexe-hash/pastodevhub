import { useState } from "react";
import { toast } from "sonner";
import { Check, Save } from "lucide-react";
import { workRpc, personName, type ContractRow } from "@/lib/work-db";
import { CONTRACT_MIN, CONTRACT_TEXT_MAX, contractMissing } from "@/lib/contract-completeness";
import { todayWIB } from "@/lib/work-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

const CARD = "rounded-2xl bg-card shadow-sm ring-1 ring-border";

/**
 * Langkah "Siapkan kontrak": tampil untuk client sesaat setelah menerima freelancer (kontrak masih draft).
 * Client melengkapi semua ketentuan, menyimpannya, mengatur nilai dan milestone/jadwal, lalu mengirim ke freelancer.
 */
export function ContractTermsEditor({ c, busy, run }: { c: ContractRow; busy: boolean; run: Run }) {
  const sched = !!c.schedule_mode;
  const [f, setF] = useState({
    scope: c.scope ?? "", revision: c.revision_terms ?? "", usage: c.usage_rights ?? "", cancel: c.cancellation_terms ?? "",
    payment: c.payment_terms ?? "", deadline: c.deadline ? c.deadline.slice(0, 10) : "",
  });
  const today = todayWIB();
  const missing = contractMissing({
    scope: f.scope, revision_terms: f.revision, usage_rights: f.usage, cancellation_terms: f.cancel, payment_terms: f.payment,
    deadline: sched ? c.deadline : f.deadline || null, payment_type: c.payment_type, schedule_mode: c.schedule_mode,
  }, today);
  const dirty = f.scope !== (c.scope ?? "") || f.revision !== (c.revision_terms ?? "") || f.usage !== (c.usage_rights ?? "")
    || f.cancel !== (c.cancellation_terms ?? "") || f.payment !== (c.payment_terms ?? "") || (!sched && f.deadline !== (c.deadline ? c.deadline.slice(0, 10) : ""));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!sched && f.deadline && f.deadline < today) { toast.error("Tanggal selesai tidak boleh di masa lalu."); return; }
    run(() => workRpc("work_update_contract_terms", {
      _contract_id: c.id, _scope: f.scope, _revision_terms: f.revision, _usage_rights: f.usage,
      _cancellation_terms: f.cancel, _payment_terms: f.payment, _deadline: sched ? null : f.deadline || null,
    }), "Ketentuan kontrak disimpan");
  }
  const count = (t: string, min: number) => <span className={t.trim().length >= min ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{t.trim().length}/{min} karakter minimal</span>;

  return (
    <section aria-labelledby="prep" className={cn(CARD, "space-y-4 p-5 ring-primary/40")}>
      <div>
        <h2 id="prep" className="font-extrabold">Siapkan kontrak untuk {personName(c.freelancer)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lengkapi semua ketentuan di bawah dan simpan, atur nilai dan {sched ? "jadwal jam kerja" : "milestone"}, lalu kirim ke freelancer.
          Kontrak mulai berjalan setelah freelancer menyetujuinya; jika ia meminta perubahan, kontrak kembali ke sini.
        </p>
      </div>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="k-scope">Ruang lingkup pekerjaan *</Label>
          <Textarea id="k-scope" rows={5} value={f.scope} maxLength={CONTRACT_TEXT_MAX} onChange={(e) => setF({ ...f, scope: e.target.value })} placeholder="Apa saja yang dikerjakan dan hasil akhirnya." />
          <p className="text-xs">{count(f.scope, CONTRACT_MIN.scope)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="k-rev">Ketentuan revisi *</Label>
          <Textarea id="k-rev" rows={3} value={f.revision} maxLength={CONTRACT_TEXT_MAX} onChange={(e) => setF({ ...f, revision: e.target.value })} placeholder="Contoh: maksimal 2 kali revisi per milestone." />
          <p className="text-xs">{count(f.revision, CONTRACT_MIN.revision)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="k-use">Hak penggunaan hasil pekerjaan *</Label>
          <Textarea id="k-use" rows={3} value={f.usage} maxLength={CONTRACT_TEXT_MAX} onChange={(e) => setF({ ...f, usage: e.target.value })} placeholder="Contoh: hak cipta dan kode sumber pindah ke client setelah dana diteruskan." />
          <p className="text-xs">{count(f.usage, CONTRACT_MIN.usage)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="k-can">Ketentuan pembatalan *</Label>
          <Textarea id="k-can" rows={3} value={f.cancel} maxLength={CONTRACT_TEXT_MAX} onChange={(e) => setF({ ...f, cancel: e.target.value })} placeholder="Kapan boleh dibatalkan, oleh siapa, dan bagaimana dana diatur." />
          <p className="text-xs">{count(f.cancel, CONTRACT_MIN.cancellation)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="k-pay">Ketentuan pembayaran *</Label>
          <Textarea id="k-pay" rows={3} value={f.payment} maxLength={CONTRACT_TEXT_MAX} onChange={(e) => setF({ ...f, payment: e.target.value })} placeholder="Pembayaran lewat Midtrans; dana ditahan escrow sampai hasil disetujui." />
          <p className="text-xs">{count(f.payment, CONTRACT_MIN.payment)}</p>
        </div>
        {!sched && (
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="k-dl">Tanggal selesai{c.payment_type === "fixed" ? " *" : ""}</Label>
            <Input id="k-dl" type="date" min={today} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </div>
        )}
        <Button type="submit" variant="outline" className="rounded-full" disabled={busy || !dirty}><Save /> Simpan ketentuan</Button>
      </form>
      <div className="rounded-xl bg-secondary/60 p-3" role="status">
        {missing.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><Check className="size-4" /> Semua ketentuan sudah lengkap.</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Belum lengkap, kontrak belum bisa dikirim:</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </>
        )}
        {dirty && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Ada perubahan yang belum disimpan. Simpan dulu sebelum mengirim kontrak.</p>}
      </div>
    </section>
  );
}
