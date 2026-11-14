import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import {
  EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_TYPES, PAYMENT_TYPES, WORK_MODES,
  budgetLabel, canPostJob, experienceLabel, jobCategoryLabel, jobTypeLabel, parseSkills, paymentTypeLabel,
  todayISO, validateJobForm, workModeLabel, type JobFormInput,
} from "@/lib/jobs";
import { formatRupiahInput, parseRupiah } from "@/lib/rupiah";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  location: string; experience: string; paymentType: string; min: string; max: string; deadline: string;
  positions: string; requirements: string;
};
const INITIAL: FormState = {
  title: "", description: "", category: "web-development", skills: "", jobType: "freelance", workMode: "remote",
  location: "", experience: "mid", paymentType: "fixed", min: "", max: "", deadline: "", positions: "1", requirements: "",
};
const SELECT_CLS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

// Budget tampil berformat rupiah (5.000.000) di kolom teks, lalu dibaca kembali menjadi bilangan bulat.
function toInput(f: FormState): JobFormInput {
  return {
    title: f.title, description: f.description, category: f.category, skills: parseSkills(f.skills), jobType: f.jobType,
    workMode: f.workMode, location: f.location, experience: f.experience, paymentType: f.paymentType,
    min: parseRupiah(f.min), max: parseRupiah(f.max), deadline: f.deadline, positions: Number(f.positions || 0), requirements: f.requirements,
  };
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
    const errs = validateJobForm(toInput(f));
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast.error("Periksa kembali isian yang ditandai."); return; }
    setStep("preview");
    window.scrollTo({ top: 0 });
  }

  async function publish() {
    // Validasi diulang tepat sebelum kirim; RLS dan constraint database tetap menjadi penentu akhir.
    const v = toInput(f);
    const errs = validateJobForm(v);
    if (Object.keys(errs).length > 0) { setErrors(errs); setStep("edit"); return; }
    setBusy(true);
    const { data, error } = await looseDb.from("jobs").insert({
      client_id: user!.id, title: v.title.trim(), description: v.description.trim(), category: v.category, skills: v.skills,
      budget_min: v.min, budget_max: v.max, deadline: v.deadline || null,
      job_type: v.jobType, work_mode: v.workMode, location: v.location.trim() || null, experience_level: v.experience,
      payment_type: v.paymentType, positions: v.positions, requirements: v.requirements.trim() || null,
    }).select("id").single();
    setBusy(false);
    if (error || !data) {
      if (error?.code === "42703") toast.error("Skema GOBI WORK belum aktif di database. Jalankan docs/sql/gobi-work/001_gobi_work_core.sql lewat Lovable.");
      else toast.error(error ? errMsg(error) : "Gagal memasang lowongan.");
      return;
    }
    toast.success("Lowongan dipasang. Developer sudah bisa melamar.");
    navigate({ to: "/lowongan/$id", params: { id: String(data.id) } });
  }

  if (step === "preview") {
    const v = toInput(f);
    const facts: [string, string][] = [
      ["Kategori", jobCategoryLabel(v.category)], ["Jenis", jobTypeLabel(v.jobType)], ["Metode kerja", workModeLabel(v.workMode)],
      ["Lokasi", v.location.trim() || (v.workMode === "remote" ? "Remote" : "—")], ["Pengalaman", experienceLabel(v.experience)],
      ["Pembayaran", paymentTypeLabel(v.paymentType)], ["Budget", `${budgetLabel(v.min, v.max)}${v.paymentType === "hourly" ? " /jam" : ""}`],
      ["Deadline", v.deadline ? new Date(v.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "Fleksibel"],
      ["Kebutuhan", `${v.positions} freelancer`],
    ];
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Pratinjau — belum dipublikasikan</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{v.title.trim()}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {facts.map(([k, val]) => <div key={k} className="rounded-lg bg-secondary/60 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{val}</dd></div>)}
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">{v.skills.map((s) => <span key={s} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{s}</span>)}</div>
        <section className="mt-4 rounded-xl border border-border bg-card p-5"><Markdown>{v.description.trim()}</Markdown></section>
        {v.requirements.trim() && <section className="mt-3 rounded-xl border border-border bg-card p-5"><h2 className="mb-2 text-sm font-semibold">Persyaratan tambahan</h2><Markdown>{v.requirements.trim()}</Markdown></section>}
        {v.jobType === "internship" && <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">Lowongan magang: pastikan pelamar memenuhi batas usia dan ketentuan hukum setempat. Pastodev tidak memfasilitasi pekerjaan yang melanggar kebijakan platform.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setStep("edit")}><ArrowLeft /> Ubah</Button>
          <Button disabled={busy} onClick={publish}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Publikasikan</Button>
        </div>
      </main>
    );
  }

  const budgetErr = errors.budget;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Pasang lowongan</h1>
      <p className="text-sm text-muted-foreground">Jelaskan kebutuhanmu sejelas mungkin supaya developer bisa memberi penawaran yang pas.</p>
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
          <div><Label htmlFor="pt">Sistem pembayaran</Label>
            <select id="pt" value={f.paymentType} onChange={(e) => up({ paymentType: e.target.value })} className={SELECT_CLS}>{PAYMENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><Err m={errors.paymentType} /></div>
          <div><Label htmlFor="ps">Jumlah freelancer</Label><Input id="ps" type="number" min={1} max={100} value={f.positions} onChange={(e) => up({ positions: e.target.value })} /><Err m={errors.positions} /></div>
          <div>
            <Label htmlFor="mn">{f.paymentType === "hourly" ? "Tarif minimum per jam (Rp)" : "Budget minimum (Rp)"}</Label>
            <Input id="mn" type="text" inputMode="numeric" autoComplete="off" aria-invalid={!!budgetErr} value={f.min} onChange={(e) => up({ min: formatRupiahInput(e.target.value) })} placeholder="500.000" />
          </div>
          <div>
            <Label htmlFor="mx">{f.paymentType === "hourly" ? "Tarif maksimum per jam (Rp)" : "Budget maksimum (Rp)"}</Label>
            <Input id="mx" type="text" inputMode="numeric" autoComplete="off" aria-invalid={!!budgetErr} value={f.max} onChange={(e) => up({ max: formatRupiahInput(e.target.value) })} placeholder="2.000.000" />
          </div>
          <div className="sm:col-span-2"><Err m={budgetErr} /></div>
          <div><Label htmlFor="dl">Deadline (opsional)</Label><Input id="dl" type="date" min={todayISO()} value={f.deadline} onChange={(e) => up({ deadline: e.target.value })} /><Err m={errors.deadline} /></div>
        </div>
        <div><Label htmlFor="s">Keahlian yang dibutuhkan</Label><Input id="s" value={f.skills} onChange={(e) => up({ skills: e.target.value })} placeholder="React, Laravel, Figma" /><p className="mt-1 text-xs text-muted-foreground">Pisahkan dengan koma, maksimal 12.</p><Err m={errors.skills} /></div>
        <div><Label htmlFor="rq">Persyaratan tambahan (opsional)</Label><Textarea id="rq" rows={4} maxLength={4000} value={f.requirements} onChange={(e) => up({ requirements: e.target.value })} placeholder="Contoh: bersedia meeting mingguan, sudah pernah membuat toko online…" /><Err m={errors.requirements} /></div>
        <Button className="w-full sm:w-auto">Lihat pratinjau</Button>
      </form>
    </main>
  );
}
