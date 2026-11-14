import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import {
  EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_TYPES, WORK_MODES,
  budgetLabel, canPostJob, experienceLabel, jobCategoryLabel, jobTypeLabel, parseSkills, paymentTypeLabel,
  todayISO, validateJobForm, workModeLabel, type JobFormInput,
} from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RupiahInput } from "@/components/rupiah-input";
import { parseRupiah } from "@/lib/rupiah";
import { MAX_REVISION_LIMIT } from "@/lib/jobs";
import { LEGAL_TERMS_MAX, LEGAL_TERMS_MIN, validateLegalTerms } from "@/lib/job-legal-terms";
import { isMissingColumn } from "@/lib/job-terms";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";

export const Route = createFileRoute("/lowongan/baru")({
  head: () => ({
    meta: [
      { title: "Pasang lowongan — Pastodev" },
      { name: "description", content: "Pasang kebutuhan proyek freelance dan terima lamaran dari developer Pastodev." },
      { property: "og:title", content: "Pasang lowongan — Pastodev" },
      { property: "og:description", content: "Cari developer freelance untuk proyek kamu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewJob,
});

type FormState = {
  title: string; description: string; category: string; skills: string; jobType: string; workMode: string;
  location: string; experience: string; min: string; max: string; deadline: string;
  positions: string; requirements: string;
  /** Wajib: siapa pemilik hasil pekerjaan dan batas pemakaiannya. */
  usageRights: string;
  /** Wajib: aturan jika client atau freelancer membatalkan pekerjaan. */
  cancellationTerms: string;
  /** Tombol "Bayar per jam"; mati = kerja langsung (bawaan). */
  hourly: boolean;
  /** Tombol "Batasi revisi"; angkanya di revisionLimit. */
  limitRevisions: boolean; revisionLimit: string;
};
const INITIAL: FormState = {
  title: "", description: "", category: "web-development", skills: "", jobType: "freelance", workMode: "remote",
  location: "", experience: "mid", min: "", max: "", deadline: "", positions: "1", requirements: "",
  usageRights: "", cancellationTerms: "",
  hourly: false, limitRevisions: false, revisionLimit: "2",
};
const SELECT_CLS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function toInput(f: FormState): JobFormInput {
  return {
    title: f.title, description: f.description, category: f.category, skills: parseSkills(f.skills), jobType: f.jobType,
    workMode: f.workMode, location: f.location, experience: f.experience, paymentType: f.hourly ? "hourly" : "fixed",
    min: parseRupiah(f.min), max: parseRupiah(f.max), deadline: f.deadline, positions: Number(f.positions || 0), requirements: f.requirements,
    revisionLimit: !f.hourly && f.limitRevisions ? Number(f.revisionLimit || 0) : null,
  };
}

/** Semua pemeriksaan form: isian lowongan ditambah hak penggunaan hasil dan ketentuan pembatalan (keduanya wajib). */
function validateAll(f: FormState) {
  return { ...validateJobForm(toInput(f)), ...validateLegalTerms(f) };
}

function Err({ m }: { m?: string }) {
  return m ? <p className="mt-1 text-xs text-destructive" role="alert">{m}</p> : null;
}

function NewJob() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState<FormState>(INITIAL);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const up = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }));
  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk sebagai client untuk memasang lowongan." /></main>;
  if (!canPostJob({ id: user.id, accountType: profile?.account_type ?? null })) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Briefcase className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Pasang lowongan khusus akun client</h1>
        <p className="mt-2 text-sm text-muted-foreground">Akun developer bisa melamar lowongan. Ganti jenis akun di Pengaturan jika kamu ingin mencari developer.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild><Link to="/lowongan">Lihat lowongan</Link></Button>
          <Button asChild variant="outline"><Link to="/settings">Pengaturan</Link></Button>
        </div>
      </main>
    );
  }

  function toPreview(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAll(f);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast.error("Periksa kembali isian yang ditandai."); return; }
    setStep("preview");
    window.scrollTo({ top: 0 });
  }

  async function publish() {
    // Validasi diulang tepat sebelum kirim; RLS dan constraint database tetap menjadi penentu akhir.
    const v = toInput(f);
    const errs = validateAll(f);
    if (Object.keys(errs).length > 0) { setErrors(errs); setStep("edit"); return; }
    setBusy(true);
    // Lowongan baru selalu ditinjau admin dulu. Database (SQL 005) memaksa 'pending' untuk akun biasa, jadi nilai ini bukan penentu.
    const { data, error } = await looseDb.from("jobs").insert({
      client_id: user!.id, moderation_status: "pending", title: v.title.trim(), description: v.description.trim(), category: v.category, skills: v.skills,
      budget_min: v.min, budget_max: v.max, deadline: v.deadline || null,
      job_type: v.jobType, work_mode: v.workMode, location: v.location.trim() || null, experience_level: v.experience,
      payment_type: v.paymentType, positions: v.positions, requirements: v.requirements.trim() || null,
      // Wajib diisi pembuat lowongan; SQL 008 menolak lowongan baru yang keduanya kosong.
      usage_rights: f.usageRights.trim(), cancellation_terms: f.cancellationTerms.trim(),
      // Hanya dikirim jika client mengaktifkannya, supaya lowongan biasa tetap jalan sebelum SQL 006 dijalankan.
      ...(v.revisionLimit ? { revision_limit: v.revisionLimit } : {}),
    }).select("id").single();
    setBusy(false);
    if (error || !data) {
      if (isMissingColumn(error) && /usage_rights|cancellation_terms/i.test(error?.message ?? "")) toast.error("Kolom hak penggunaan dan ketentuan pembatalan belum ada di database. Jalankan docs/sql/gobi-work/008_hak_hasil_dan_pembatalan.sql di SQL editor.");
      else if (error?.code === "42703" && v.revisionLimit) toast.error("Batas revisi belum aktif di database. Jalankan docs/sql/gobi-work/006_kerja_langsung_tenggat_revisi.sql, atau matikan batas revisi.");
      else if (error?.code === "42703") toast.error("Skema GOBI WORK belum aktif di database. Jalankan docs/sql/gobi-work/001_gobi_work_core.sql lewat Lovable.");
      else toast.error(error ? errMsg(error) : "Gagal mengirim lowongan.");
      return;
    }
    toast.success("Lowongan dikirim dan menunggu peninjauan admin. Setelah disetujui, lowongan tampil dan developer bisa melamar.", { duration: 8000 });
    navigate({ to: "/lowongan/$id", params: { id: String(data.id) } });
  }

  if (step === "preview") {
    const v = toInput(f);
    const facts: [string, string][] = [
      ["Kategori", jobCategoryLabel(v.category)], ["Jenis", jobTypeLabel(v.jobType)], ["Metode kerja", workModeLabel(v.workMode)],
      ["Lokasi", v.location.trim() || (v.workMode === "remote" ? "Remote" : "—")], ["Pengalaman", experienceLabel(v.experience)],
      ["Pembayaran", paymentTypeLabel(v.paymentType)], ["Budget", `${budgetLabel(v.min, v.max)}${v.paymentType === "hourly" ? " /jam" : ""}`],
      ["Selesai paling lambat", v.deadline ? new Date(v.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "Fleksibel"],
      ...(v.paymentType === "fixed" ? [["Batas revisi", v.revisionLimit ? `${v.revisionLimit} kali` : "Tanpa batas"] as [string, string]] : []),
      ["Kebutuhan", `${v.positions} freelancer`],
    ];
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Pratinjau — belum dikirim</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{v.title.trim()}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {facts.map(([k, val]) => <div key={k} className="rounded-lg bg-secondary/60 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{val}</dd></div>)}
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">{v.skills.map((s) => <span key={s} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{s}</span>)}</div>
        <section className="mt-4 rounded-xl border border-border bg-card p-5"><Markdown>{v.description.trim()}</Markdown></section>
        {v.requirements.trim() && <section className="mt-3 rounded-xl border border-border bg-card p-5"><h2 className="mb-2 text-sm font-semibold">Persyaratan tambahan</h2><Markdown>{v.requirements.trim()}</Markdown></section>}
        <section className="mt-3 rounded-xl border border-border bg-card p-5"><h2 className="mb-2 text-sm font-semibold">Hak penggunaan hasil pekerjaan</h2><p className="whitespace-pre-wrap break-words text-sm">{f.usageRights.trim()}</p></section>
        <section className="mt-3 rounded-xl border border-border bg-card p-5"><h2 className="mb-2 text-sm font-semibold">Ketentuan pembatalan</h2><p className="whitespace-pre-wrap break-words text-sm">{f.cancellationTerms.trim()}</p></section>
        {v.jobType === "internship" && <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">Lowongan magang: pastikan pelamar memenuhi batas usia dan ketentuan hukum setempat. Pastodev tidak memfasilitasi pekerjaan yang melanggar kebijakan platform.</p>}
        <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">Setelah dikirim, admin meninjau lowongan ini dulu. Lowongan baru tampil di daftar dan bisa dilamar setelah disetujui; kamu bisa melihat statusnya di dashboard.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setStep("edit")}><ArrowLeft /> Ubah</Button>
          <Button disabled={busy} onClick={publish}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Kirim untuk ditinjau</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Pasang lowongan</h1>
      <p className="text-sm text-muted-foreground">Jelaskan kebutuhanmu sejelas mungkin supaya developer bisa memberi penawaran yang pas. Lowongan ditinjau admin dulu sebelum tampil.</p>
      <form onSubmit={toPreview} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5" noValidate>
        <div><Label htmlFor="t">Judul pekerjaan</Label><Input id="t" maxLength={120} value={f.title} onChange={(e) => up({ title: e.target.value })} placeholder="Contoh: Website toko online untuk UMKM batik" /><Err m={errors.title} /></div>
        <div><Label htmlFor="d">Deskripsi lengkap</Label><Textarea id="d" rows={8} maxLength={8000} value={f.description} onChange={(e) => up({ description: e.target.value })} placeholder="Fitur yang dibutuhkan, contoh referensi, teknologi yang diinginkan… (mendukung Markdown)" /><Err m={errors.description} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="c">Kategori</Label>
            <select id="c" value={f.category} onChange={(e) => up({ category: e.target.value })} className={SELECT_CLS}>{JOB_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err m={errors.category} /></div>
          <div><Label htmlFor="ex">Tingkat pengalaman</Label>
            <select id="ex" value={f.experience} onChange={(e) => up({ experience: e.target.value })} className={SELECT_CLS}>{EXPERIENCE_LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err m={errors.experience} /></div>
          <div><Label htmlFor="jt">Jenis pekerjaan</Label>
            <select id="jt" value={f.jobType} onChange={(e) => up({ jobType: e.target.value })} className={SELECT_CLS}>{JOB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err m={errors.jobType} /></div>
          <div><Label htmlFor="wm">Metode kerja</Label>
            <select id="wm" value={f.workMode} onChange={(e) => up({ workMode: e.target.value })} className={SELECT_CLS}>{WORK_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err m={errors.workMode} /></div>
          <div className="sm:col-span-2"><Label htmlFor="lc">Lokasi{f.workMode === "remote" ? " (opsional)" : ""}</Label><Input id="lc" maxLength={100} value={f.location} onChange={(e) => up({ location: e.target.value })} placeholder="Kota atau provinsi" /><Err m={errors.location} /></div>
          <div className="sm:col-span-2 rounded-xl border border-border bg-secondary/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="hr" className="text-sm font-semibold">Bayar per jam</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {f.hourly
                    ? "Aktif: freelancer melaporkan jam mulai dan jam selesai, client menyetujui, lalu menagih jam yang disetujui."
                    : "Mati (bawaan): kerja langsung dengan harga tetap. Client membayar, freelancer mengerjakan sampai tanggal selesai."}
                </p>
              </div>
              <Switch id="hr" checked={f.hourly} onCheckedChange={(v) => up({ hourly: v, limitRevisions: v ? false : f.limitRevisions })} aria-label="Bayar per jam" />
            </div>
            <p className="mt-2 text-xs font-medium text-primary">{f.hourly ? "Sistem pembayaran: Per jam" : "Sistem pembayaran: Kerja langsung"}</p>
          </div>
          <div><Label htmlFor="ps">Jumlah freelancer</Label><Input id="ps" type="number" min={1} max={100} value={f.positions} onChange={(e) => up({ positions: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Lowongan tetap dibuka sampai semua posisi terisi.</p><Err m={errors.positions} /></div>
          <div><Label htmlFor="mn">{f.hourly ? "Tarif minimum per jam" : "Budget minimum"}</Label><RupiahInput id="mn" value={f.min} onValueChange={(v) => up({ min: v })} placeholder="Rp 500.000" /></div>
          <div><Label htmlFor="mx">{f.hourly ? "Tarif maksimum per jam" : "Budget maksimum"}</Label><RupiahInput id="mx" value={f.max} onValueChange={(v) => up({ max: v })} placeholder="Rp 2.000.000" /></div>
          <div className="sm:col-span-2"><Err m={errors.budget} /></div>
          <div><Label htmlFor="dl">Pekerjaan harus selesai sampai (opsional)</Label><Input id="dl" type="date" min={todayISO()} value={f.deadline} onChange={(e) => up({ deadline: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Pelamar memilih tanggal selesai sendiri, tidak boleh melewati tanggal ini. Jika setelah freelancer mengirim hasil client tidak menyetujui atau meminta revisi sampai 1 hari setelah tanggal selesai, dana otomatis diteruskan ke freelancer.</p><Err m={errors.deadline} /></div>
          {!f.hourly && (
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div><Label htmlFor="lr" className="text-sm font-semibold">Batasi jumlah revisi</Label><p className="text-xs text-muted-foreground">{f.limitRevisions ? "Revisi di atas batas ditolak sistem." : "Mati: revisi tidak dibatasi."}</p></div>
                <Switch id="lr" checked={f.limitRevisions} onCheckedChange={(v) => up({ limitRevisions: v })} aria-label="Batasi jumlah revisi" />
              </div>
              {f.limitRevisions && (
                <div className="mt-3 max-w-[10rem]"><Label htmlFor="rl">Maksimal revisi</Label>
                  <select id="rl" value={f.revisionLimit} onChange={(e) => up({ revisionLimit: e.target.value })} className={SELECT_CLS}>
                    {Array.from({ length: MAX_REVISION_LIMIT }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} kali</option>)}
                  </select><Err m={errors["revisionLimit"]} /></div>
              )}
            </div>
          )}
        </div>
        <div><Label htmlFor="s">Keahlian yang dibutuhkan</Label><Input id="s" value={f.skills} onChange={(e) => up({ skills: e.target.value })} placeholder="React, Laravel, Figma" /><p className="mt-1 text-xs text-muted-foreground">Pisahkan dengan koma, maksimal 12.</p><Err m={errors.skills} /></div>
        <div>
          <Label htmlFor="ur">Hak penggunaan hasil pekerjaan <span className="text-destructive" aria-hidden>*</span></Label>
          <Textarea id="ur" rows={4} maxLength={LEGAL_TERMS_MAX} value={f.usageRights} onChange={(e) => up({ usageRights: e.target.value })} aria-invalid={!!errors.usageRights} placeholder="Contoh: Seluruh hak cipta dan kode sumber menjadi milik client setelah pembayaran lunas. Freelancer boleh menampilkan hasilnya di portofolio setelah mendapat izin client." />
          <p className="mt-1 text-xs text-muted-foreground">Wajib diisi (minimal {LEGAL_TERMS_MIN} karakter). Jelaskan siapa pemilik hasil pekerjaan, apakah freelancer boleh memakainya di portofolio, dan batas pemakaian lainnya.</p>
          <Err m={errors.usageRights} />
        </div>
        <div>
          <Label htmlFor="ct">Ketentuan pembatalan <span className="text-destructive" aria-hidden>*</span></Label>
          <Textarea id="ct" rows={4} maxLength={LEGAL_TERMS_MAX} value={f.cancellationTerms} onChange={(e) => up({ cancellationTerms: e.target.value })} aria-invalid={!!errors.cancellationTerms} placeholder="Contoh: Client boleh membatalkan sebelum pekerjaan dimulai dan dana dikembalikan penuh. Setelah pekerjaan dimulai, pembayaran dihitung sesuai bagian yang sudah dikerjakan dan disepakati kedua pihak." />
          <p className="mt-1 text-xs text-muted-foreground">Wajib diisi (minimal {LEGAL_TERMS_MIN} karakter). Jelaskan kapan pekerjaan boleh dibatalkan, oleh siapa, dan bagaimana dana atau pembayarannya diatur.</p>
          <Err m={errors.cancellationTerms} />
        </div>
        <div><Label htmlFor="rq">Persyaratan tambahan (opsional)</Label><Textarea id="rq" rows={4} maxLength={4000} value={f.requirements} onChange={(e) => up({ requirements: e.target.value })} placeholder="Contoh: bersedia meeting mingguan, sudah pernah membuat toko online…" /><Err m={errors.requirements} /></div>
        <Button className="w-full sm:w-auto">Lihat pratinjau</Button>
      </form>
    </main>
  );
}
