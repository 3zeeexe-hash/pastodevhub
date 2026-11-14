import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Check, CreditCard, FileSignature, Loader2, MessageSquare, Send, Share2, Users, Wallet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { JOB_SELECT, budgetLabel, canApply, canRespond, jobCategoryLabel, type ApplicationStatus, type JobCardData } from "@/lib/jobs";
import { acceptedMessage, normalizeModeration, slotsLeft, type ModerationStatus, type RespondSummary } from "@/lib/job-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RupiahInput } from "@/components/rupiah-input";
import { JobTermsCard } from "@/components/job-terms";
import { bidText, isMissingColumn, isMissingFunction, useJobTerms, type JobTerms } from "@/lib/job-terms";
import { parseRupiah } from "@/lib/rupiah";
import { addDaysISO, finishDateError, todayWIB } from "@/lib/work-deadline";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";
import { ApplicationStatusBadge, JobStatusBadge } from "@/components/job-card";
import { JobExtras } from "@/components/job-extras";
import { JobReviewBanner } from "@/components/job-review-banner";
import { ApplicationThread } from "@/components/application-thread";
import { GobiLoader } from "@/components/gobi-loader";
import { Pill, ReportButton } from "@/components/work-ui";
import jobImage from "@/assets/lowongan-job.jpg";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lowongan/$id")({
  // Real title, description and structured data come from the database; the text below is the fallback.
  loader: ({ params }) => getSeoInfo({ data: { kind: "job", id: params.id } }),
  staleTime: 300_000,
  head: ({ loaderData }) => seoHead(loaderData, { title: "Detail lowongan — Pastodev", description: "Detail proyek freelance dari client. Lamar dengan penawaran harga dan waktu kerja." }),
  component: JobDetail,
});

type App = {
  id: string; job_id: string; developer_id: string; cover_letter: string; bid_amount: number; est_days: number; status: ApplicationStatus; created_at: string;
  developer: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] } | null;
};
const APP_SELECT = "id,job_id,developer_id,cover_letter,bid_amount,est_days,status,created_at, developer:profiles!job_applications_developer_id_fkey(username,display_name,avatar_url,headline,skills)";

const STAGE_LABEL: Record<string, string> = { viewed: "Dilihat", shortlisted: "Shortlist", interview: "Interview" };

// Lebar dan gaya kartu yang sama dengan beranda dan daftar lowongan.
const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6 xl:max-w-7xl";
const CARD = "rounded-2xl bg-card shadow-sm ring-1 ring-border";

/**
 * Menjawab lamaran lewat work_respond_application (SQL 005): menerima satu pelamar tidak menutup lowongan selama posisi masih ada.
 * Jika SQL 005 belum dijalankan, dipakai fungsi lama respond_job_application (yang menutup lowongan saat satu pelamar diterima).
 */
async function respondToApplication(applicationId: string, accept: boolean) {
  const r = await looseDb.rpc("work_respond_application", { _application_id: applicationId, _accept: accept });
  if (r.error && isMissingFunction(r.error)) {
    const old = await supabase.rpc("respond_job_application", { _application_id: applicationId, _accept: accept });
    return { error: old.error, summary: null as RespondSummary | null, contractId: null as string | null };
  }
  return { error: r.error, summary: (r.data ?? null) as RespondSummary | null, contractId: null as string | null };
}

/**
 * Menerima lamaran + membuat kesepakatan kerja (kontrak) otomatis lewat work_accept_application (SQL 006, diperbarui SQL 007).
 * Kerja langsung: persetujuan client tercatat saat menerima; kontrak aktif setelah freelancer setuju, baru client membayar.
 * Per jam (SQL 007): kontrak berstatus draft; client menentukan hari dan jam kerja di halaman kontrak, freelancer boleh mengajukan
 * pergantian jam, setelah sepakat client membayar total semua jam di muka.
 * Jika SQL 006 belum dijalankan, dipakai alur lama (terima saja, kontrak dibuat manual).
 */
async function acceptApplication(applicationId: string) {
  const r = await looseDb.rpc("work_accept_application", { _application_id: applicationId });
  if (r.error && isMissingFunction(r.error)) return respondToApplication(applicationId, true);
  const d = (r.data ?? null) as (RespondSummary & { contract_id?: string }) | null;
  return { error: r.error, summary: d, contractId: d?.contract_id ?? null };
}

function JobDetail() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const job = useQuery({
    queryKey: ["job", id],
    queryFn: async () => ((await supabase.from("jobs").select(JOB_SELECT).eq("id", id).maybeSingle()).data ?? null) as unknown as JobCardData | null,
  });
  const apps = useQuery({
    queryKey: ["job-apps", id, user?.id],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("job_applications").select(APP_SELECT).eq("job_id", id).order("created_at")).data ?? []) as unknown as App[],
  });
  // Jumlah posisi dan status peninjauan admin (GOBI WORK, SQL 001/005). Diambil terpisah supaya halaman tetap jalan sebelum SQL itu dijalankan.
  const review = useQuery({
    queryKey: ["job-review", id],
    queryFn: async () => {
      const { data, error } = await looseDb.from("jobs").select("positions,moderation_status,moderation_note").eq("id", id).maybeSingle();
      const r = (data ?? null) as { positions: number | null; moderation_status: string | null; moderation_note: string | null } | null;
      if (error || !r) return { positions: 1, moderation: "approved" as ModerationStatus, note: null as string | null };
      return { positions: r.positions ?? 1, moderation: normalizeModeration(r.moderation_status), note: r.moderation_note };
    },
  });
  const termsQ = useJobTerms(id);
  const ownerId = job.data?.client_id;
  const viewerIsOwner = !!user && !!ownerId && user.id === ownerId;
  // Tahap lamaran (GOBI WORK, SQL 002). Diambil terpisah supaya halaman tetap jalan sebelum SQL itu dijalankan.
  const stages = useQuery({
    queryKey: ["job-app-stages", id, user?.id],
    enabled: viewerIsOwner,
    queryFn: async () => {
      const { data, error } = await looseDb.from("job_applications").select("id,work_stage").eq("job_id", id);
      if (error) return {} as Record<string, string | null>;
      return Object.fromEntries(((data ?? []) as { id: string; work_stage: string | null }[]).map((r) => [r.id, r.work_stage])) as Record<string, string | null>;
    },
  });
  // Tanggal selesai yang diusulkan pelamar (SQL 006). Pemilik melihat semua; pelamar hanya miliknya.
  const finishDates = useQuery({
    queryKey: ["job-app-finish", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await looseDb.from("job_applications").select("id,finish_date").eq("job_id", id);
      if (error) return {} as Record<string, string | null>;
      return Object.fromEntries(((data ?? []) as { id: string; finish_date: string | null }[]).map((r) => [r.id, r.finish_date])) as Record<string, string | null>;
    },
  });
  // Saat pemilik membuka daftar pelamar, lamaran yang masih menunggu ditandai "dilihat" (sekali; diabaikan jika SQL 002 belum ada).
  const hasPending = !!apps.data?.some((a) => a.status === "pending");
  useEffect(() => {
    if (viewerIsOwner && hasPending) {
      looseDb.rpc("work_mark_applications_viewed", { _job_id: id }).then(() => qc.invalidateQueries({ queryKey: ["job-app-stages", id] }), () => undefined);
    }
  }, [viewerIsOwner, hasPending, id, qc]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["job", id] }); qc.invalidateQueries({ queryKey: ["job-apps", id] }); qc.invalidateQueries({ queryKey: ["job-app-stages", id] }); qc.invalidateQueries({ queryKey: ["job-app-finish", id] });
    qc.invalidateQueries({ queryKey: ["job-review", id] }); qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  if (job.isLoading) return <main className="min-h-screen bg-background"><GobiLoader page /></main>;
  const j = job.data;
  if (!j) return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">Lowongan tidak ditemukan</h1><Button asChild className="mt-4 rounded-full"><Link to="/lowongan">Lihat lowongan lain</Link></Button></main>;

  const isOwner = user?.id === j.client_id;
  const mine = apps.data?.find((a) => a.developer_id === user?.id) ?? null;
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const moderation = review.data?.moderation ?? "approved";
  const positions = review.data?.positions ?? 1;
  // Hanya pemilik yang melihat semua lamaran, jadi hitungan ini dipakai di tampilan pemilik.
  const acceptedCount = apps.data?.filter((a) => a.status === "accepted").length ?? 0;
  const left = slotsLeft(positions, acceptedCount);
  const terms = termsQ.data ?? { paymentType: "fixed", deadline: j.deadline ? String(j.deadline).slice(0, 10) : null, revisionLimit: null } satisfies JobTerms;

  async function setStatus(status: "open" | "closed") {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
    if (error) toast.error(errMsg(error)); else { toast.success(status === "closed" ? "Lowongan ditutup" : "Lowongan dibuka lagi"); refresh(); }
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ title: j!.title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Link lowongan disalin");
    } catch {
      // Pengguna membatalkan dialog bagikan atau izin clipboard ditolak; tidak perlu pesan error.
    }
  }

  return (
    <main className="min-h-screen bg-background pb-10 text-foreground">
      <section className="relative overflow-hidden rounded-b-[2rem] bg-header-gradient pb-16 pt-5 text-white sm:pb-20">
        <div className="pointer-events-none absolute -left-16 bottom-0 size-48 rounded-full bg-primary/30 blur-2xl" />
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className={cn("relative", WRAP)}>
          <Link to="/lowongan" className="inline-flex items-center gap-1 text-sm font-semibold text-white/80 hover:text-white"><ArrowLeft className="size-4" /> Semua lowongan</Link>
          <div className="mt-4 flex items-start gap-4">
            <img src={jobImage} alt="" width={112} height={112} draggable={false} className="size-20 shrink-0 select-none rounded-2xl bg-navy object-cover ring-2 ring-white/30 sm:size-28" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold uppercase tracking-wide text-primary">{jobCategoryLabel(j.category)}</span>
                <JobStatusBadge status={j.status} />
              </div>
              <h1 className="mt-1.5 break-words text-2xl font-extrabold leading-tight md:text-3xl">{j.title}</h1>
              {j.client && (
                <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-white/80">
                  <AvatarMini name={j.client.username} url={j.client.avatar_url} size={20} />
                  <span className="truncate">{j.client.display_name || j.client.username}</span>
                  <span className="shrink-0">· {timeAgo(j.created_at)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className={cn("relative z-10 -mt-8 grid gap-6 lg:grid-cols-[1fr_320px]", WRAP)}>
        <article className="min-w-0 space-y-4">
          {isOwner && <JobReviewBanner status={moderation} note={review.data?.note} />}
          <header className={cn(CARD, "p-4 sm:p-5")}>
            <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-3">
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Anggaran</p><p className="flex items-start gap-1 font-bold"><Wallet className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{budgetLabel(j.budget_min, j.budget_max)}</span></p></div>
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Pelamar</p><p className="flex items-center gap-1 font-bold"><Users className="size-4" />{j.applications_count}</p></div>
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Selesai paling lambat</p><p className="flex items-center gap-1 font-bold"><CalendarClock className="size-4 shrink-0" />{j.deadline ? new Date(j.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Fleksibel"}</p></div>
            </div>
            {j.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{j.skills.map((s) => <span key={s} className="rounded-md bg-navy/10 px-2 py-0.5 font-mono text-xs text-navy">{s}</span>)}</div>}
          </header>
          <section className={cn(CARD, "p-4 sm:p-5")}>
            <h2 className="mb-3 font-extrabold">Deskripsi proyek</h2>
            {j.description ? <Markdown>{j.description}</Markdown> : <p className="text-sm text-muted-foreground">Tidak ada deskripsi.</p>}
          </section>
          <JobTermsCard terms={terms} className={cn(CARD, "p-4 sm:p-5")} />
          <JobExtras jobId={j.id} />

          {isOwner && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold"><Users className="size-5 text-primary" /> Pelamar ({apps.data?.length ?? 0})</h2>
              <p className="text-sm text-muted-foreground">
                Posisi terisi <b className="text-foreground">{acceptedCount}</b> dari <b className="text-foreground">{positions}</b>
                {j.status === "open" && left > 0 && acceptedCount > 0 ? <> · sisa {left} posisi, lowongan tetap dibuka</> : null}
                {left === 0 ? <> · semua posisi sudah terisi</> : null}
              </p>
              {apps.isLoading && <div className={CARD}><GobiLoader compact /></div>}
              {apps.data?.length === 0 && <p className={cn(CARD, "p-8 text-center text-sm text-muted-foreground")}>{moderation === "approved" ? "Belum ada pelamar. Bagikan link lowongan ini ke komunitas." : "Belum ada pelamar. Lowongan baru bisa dilamar setelah disetujui admin."}</p>}
              {apps.data?.map((a) => <ApplicantCard key={a.id} a={a} finishDate={finishDates.data?.[a.id] ?? null} hourly={terms.paymentType === "hourly"} stage={stages.data?.[a.id] ?? null} canAnswer={canRespond(j, a, user?.id ?? null) && moderation === "approved"} slots={left} onDone={refresh} />)}
            </section>
          )}

          {!isOwner && mine && (
            <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-2 ring-primary/40 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-extrabold">Lamaran kamu</h2>
                <ApplicationStatusBadge status={mine.status} />
              </div>
              <p className="text-sm">Penawaran <b>{formatRupiah(mine.bid_amount, "Nego")}{terms.paymentType === "hourly" ? " /jam" : ""}</b> · {finishDates.data?.[mine.id] ? `selesai ${fmtDay(finishDates.data[mine.id]!)}` : `${mine.est_days} hari`} · dikirim {timeAgo(mine.created_at)}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{mine.cover_letter}</p>
              {mine.status === "pending" && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={async () => {
                  const { error } = await supabase.rpc("withdraw_job_application", { _application_id: mine.id });
                  if (error) toast.error(errMsg(error)); else { toast.success("Lamaran ditarik"); refresh(); }
                }}>Tarik lamaran</Button>
              )}
              {mine.status === "accepted" && <MyAcceptedOrder applicationId={mine.id} />}
              {mine.status !== "withdrawn" && (<><h3 className="flex items-center gap-2 pt-2 text-sm font-semibold"><MessageSquare className="size-4" /> Obrolan dengan client</h3><ApplicationThread applicationId={mine.id} /></>)}
              {mine.status === "accepted" && j.client?.username && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">Pekerjaan tidak dibayar atau dana tertahan?</p>
                  <ReportButton targetType="profile" targetId={j.client.username} label="Laporkan pembuat lowongan" defaultReason="funds_held" className="rounded-full" />
                </div>
              )}
            </section>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {j.client && (
            <div className={cn(CARD, "p-4")}>
              <p className="text-xs text-muted-foreground">Diposting oleh</p>
              <Link to="/$username" params={{ username: j.client.username }} className="mt-2 flex items-center gap-3 hover:text-primary">
                <AvatarMini name={j.client.username} url={j.client.avatar_url} size={40} />
                <span className="min-w-0"><span className="block truncate font-bold">{j.client.display_name || j.client.username}</span><span className="block text-xs text-muted-foreground">{timeAgo(j.created_at)}</span></span>
              </Link>
            </div>
          )}
          {isOwner ? (
            <div className={cn(CARD, "space-y-2 p-4")}>
              <p className="text-sm font-bold">Kelola lowongan</p>
              {j.status !== "closed" ? <Button variant="outline" className="w-full rounded-full" onClick={() => setStatus("closed")}>Tutup lowongan</Button>
                : <Button className="w-full rounded-full" onClick={() => setStatus("open")}>Buka lagi</Button>}
              <Button asChild variant="ghost" className="w-full rounded-full"><Link to="/dashboard">Ke dashboard</Link></Button>
              <Button asChild variant="ghost" className="w-full rounded-full"><Link to="/kerja/kontrak"><FileSignature /> Kontrak GOBI WORK</Link></Button>
            </div>
          ) : !user ? (
            <SignInCta text="Masuk sebagai developer untuk melamar." />
          ) : canApply(j, viewer, !!mine) ? (
            <ApplyForm jobId={j.id} userId={user.id} terms={terms} onDone={refresh} />
          ) : !mine ? (
            <div className={cn(CARD, "p-4 text-sm text-muted-foreground")}>
              {j.status !== "open" ? "Lowongan ini sudah tidak menerima lamaran." : profile?.account_type !== "developer" ? "Hanya akun developer yang bisa melamar. Ganti jenis akun di Pengaturan." : "Kamu tidak bisa melamar lowongan ini."}
            </div>
          ) : null}
          <Button type="button" variant="outline" className="w-full rounded-full" onClick={share}><Share2 /> Bagikan lowongan</Button>
          {user && !isOwner && <ReportButton targetType="job" targetId={j.id} label="Laporkan lowongan" className="w-full" />}
        </aside>
      </div>
    </main>
  );
}

const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

function ApplyForm({ jobId, userId, terms, onDone }: { jobId: string; userId: string; terms: JobTerms; onDone: () => void }) {
  const hourly = terms.paymentType === "hourly";
  const [f, setF] = useState({ letter: "", bid: "", finish: "" });
  const [errors, setErrors] = useState<{ bid?: string; finish?: string }>({});
  const [busy, setBusy] = useState(false);
  const today = todayWIB();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.letter.trim().length < 20) { toast.error("Ceritakan pengalamanmu minimal 20 karakter."); return; }
    const bid = parseRupiah(f.bid);
    const next: { bid?: string; finish?: string } = {};
    if (bid < 1000) next.bid = hourly ? "Isi tarif per jam, minimal Rp 1.000." : "Isi penawaran harga, minimal Rp 1.000.";
    const fe = finishDateError(f.finish, terms.deadline, !hourly, today);
    if (fe) next.finish = fe;
    setErrors(next);
    if (next.bid || next.finish) { toast.error("Periksa kembali isian yang ditandai."); return; }
    setBusy(true);
    const days = f.finish ? Math.min(365, Math.max(1, Math.round((Date.parse(f.finish + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000))) : 7;
    const base = { job_id: jobId, developer_id: userId, cover_letter: f.letter.trim().slice(0, 4000), bid_amount: bid, est_days: days };
    let { error } = await supabase.from("job_applications").insert(f.finish ? { ...base, finish_date: f.finish } as typeof base : base);
    // SQL 006 belum dijalankan: kirim tanpa tanggal selesai (lama kerja tetap tersimpan sebagai jumlah hari).
    if (error && f.finish && isMissingColumn(error)) ({ error } = await supabase.from("job_applications").insert(base));
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "Kamu sudah melamar lowongan ini." : /tanggal selesai/i.test(error.message ?? "") ? error.message : "Gagal mengirim lamaran."); return; }
    toast.success(hourly ? "Lamaran terkirim! Jika client menerima, client menentukan hari dan jam kerja, lalu kamu menyetujui atau mengajukan pergantian jam." : "Lamaran terkirim! Jika client menerima, kamu akan diminta menyetujui kesepakatan kerja.");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-card p-4 shadow-glow ring-2 ring-primary/40" noValidate>
      <p className="font-extrabold">Lamar proyek ini</p>
      <ol className="space-y-1 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
        {hourly ? (
          <>
            <li><b className="text-foreground">1.</b> Kirim tarif per jam.</li>
            <li><b className="text-foreground">2.</b> Client menerima, lalu menentukan hari dan jam kerja. Kamu boleh mengajukan pergantian jam.</li>
            <li><b className="text-foreground">3.</b> Setelah sepakat, client membayar total semua jam di muka (escrow), lalu kamu mulai bekerja.</li>
          </>
        ) : (
          <>
            <li><b className="text-foreground">1.</b> Kirim penawaran dan tanggal selesai.</li>
            <li><b className="text-foreground">2.</b> Client menerima, kamu menyetujui kesepakatan.</li>
            <li><b className="text-foreground">3.</b> Client membayar (escrow), kamu mulai bekerja.</li>
          </>
        )}
      </ol>
      <div><Label htmlFor="cl">Surat lamaran</Label><Textarea id="cl" rows={6} value={f.letter} onChange={(e) => setF({ ...f, letter: e.target.value })} placeholder="Kenapa kamu cocok? Sertakan link portofolio atau proyek serupa." /></div>
      <div>
        <Label htmlFor="bid">{hourly ? "Tarif per jam" : "Penawaran harga"}</Label>
        <RupiahInput id="bid" value={f.bid} onValueChange={(v) => setF({ ...f, bid: v })} placeholder="Rp 1.500.000" aria-invalid={!!errors.bid} />
        {errors.bid && <p className="mt-1 text-xs text-destructive" role="alert">{errors.bid}</p>}
      </div>
      <div>
        <Label htmlFor="fd">{hourly ? "Selesai pada tanggal (opsional)" : "Selesai pada tanggal"}</Label>
        <Input id="fd" type="date" min={today} max={terms.deadline ?? undefined} value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })} aria-invalid={!!errors.finish} />
        <p className="mt-1 text-xs text-muted-foreground">
          {terms.deadline ? `Tidak boleh lewat ${fmtDay(terms.deadline)} (batas dari client). ` : ""}
          {hourly ? "" : `Jika client tidak menanggapi hasil sampai ${f.finish ? fmtDay(addDaysISO(f.finish, 1)) : "1 hari setelah tanggal ini"}, dana otomatis diteruskan kepadamu.`}
        </p>
        {errors.finish && <p className="mt-1 text-xs text-destructive" role="alert">{errors.finish}</p>}
      </div>
      {!hourly && terms.revisionLimit ? <p className="text-xs text-muted-foreground">Client membatasi revisi maksimal <b>{terms.revisionLimit} kali</b>.</p> : null}
      <Button disabled={busy} className="w-full rounded-full">{busy ? <Loader2 className="animate-spin" /> : <Send />} Kirim lamaran</Button>
    </form>
  );
}

/** Pesanan berbayar yang dibuat dari lamaran (butuh docs/sql/midtrans-escrow/002); kosong jika SQL belum dijalankan. */
function useApplicationOrder(applicationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["application-order", applicationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await looseDb.from("orders").select("id,status").eq("job_application_id", applicationId).maybeSingle();
      if (error) return null;
      return (data as { id: string; status: string } | null) ?? null;
    },
  });
}

/** Kontrak GOBI WORK dari lamaran (butuh docs/sql/gobi-work/001); kosong jika SQL belum dijalankan. */
function useApplicationContract(applicationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["application-contract", applicationId],
    enabled,
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_contracts").select("id,status").eq("application_id", applicationId).maybeSingle();
      if (error) return null;
      return (data as { id: string; status: string } | null) ?? null;
    },
  });
}

function MyAcceptedOrder({ applicationId }: { applicationId: string }) {
  const order = useApplicationOrder(applicationId, true);
  const contract = useApplicationContract(applicationId, true);
  if (contract.data) {
    return <Button asChild size="sm" className="rounded-full"><Link to="/kerja/kontrak/$id" params={{ id: contract.data.id }}><FileSignature /> Buka kontrak</Link></Button>;
  }
  if (order.data) {
    return <Button asChild size="sm" className="rounded-full"><Link to="/pesanan/$id" params={{ id: order.data.id }}><CreditCard /> Buka pesanan</Link></Button>;
  }
  return <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Lamaranmu diterima. Menunggu client membuat kontrak atau pesanan pembayaran; setelah dibayar, dana disimpan di escrow dan kamu bisa mulai bekerja.</p>;
}

function ApplicantCard({ a, finishDate, hourly, stage, canAnswer, slots, onDone }: { a: App; finishDate: string | null; hourly: boolean; stage: string | null; canAnswer: boolean; slots: number; onDone: () => void }) {
  const [chat, setChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const order = useApplicationOrder(a.id, a.status === "accepted");
  const contract = useApplicationContract(a.id, a.status === "accepted");
  async function respond(accept: boolean) {
    if (accept) {
      const name = `@${a.developer?.username}`;
      const deal = `${bidText(a.bid_amount)}${hourly ? " per jam" : ""}${finishDate ? `, selesai ${fmtDay(finishDate)}` : ""}`;
      const next = hourly
        ? "Setelah ini kamu menentukan hari dan jam kerja; freelancer boleh mengajukan pergantian jam. Setelah sepakat, kamu membayar total semua jam di muka lewat escrow."
        : "Kesepakatan kerja dibuat otomatis; setelah freelancer setuju, kamu membayar lewat escrow.";
      const ask = slots > 1
        ? `Terima ${name} (${deal})? ${next} Lowongan tetap dibuka untuk ${slots - 1} posisi lainnya.`
        : `Terima ${name} (${deal})? ${next} Ini posisi terakhir: pelamar lain yang masih menunggu otomatis tidak dipilih dan lowongan ditutup untuk lamaran baru.`;
      if (!confirm(ask)) return;
    }
    setBusy(true);
    const { error, summary, contractId } = accept ? await acceptApplication(a.id) : await respondToApplication(a.id, false);
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    onDone();
    if (!accept) { toast.success("Lamaran ditolak"); return; }
    if (contractId) {
      const head = summary ? acceptedMessage(Math.max(0, summary.positions - summary.accepted)) : "Developer diterima.";
      toast.success(hourly
        ? `${head} Atur hari dan jam kerja di halaman kontrak, lalu kirim ke freelancer.`
        : `${head} Kesepakatan kerja sudah dibuat; menunggu freelancer menyetujui, lalu kamu membayar.`);
      navigate({ to: "/kerja/kontrak/$id", params: { id: contractId } });
      return;
    }
    if (summary) toast.success(`${acceptedMessage(Math.max(0, summary.positions - summary.accepted))} Buat kontrak GOBI WORK atau pesanan langsung untuk membayar lewat escrow.`);
    else toast.success("Developer diterima! Buat kontrak GOBI WORK atau pesanan langsung untuk membayar lewat escrow.");
    setChat(true);
  }
  async function setStage(next: "shortlisted" | "interview") {
    setBusy(true);
    const { error } = await looseDb.rpc("work_set_application_stage", { _application_id: a.id, _stage: next });
    setBusy(false);
    if (error) toast.error(errMsg(error)); else { toast.success(next === "shortlisted" ? "Masuk shortlist" : "Ditandai interview"); onDone(); }
  }
  async function createOrder() {
    setBusy(true);
    const { data, error } = await looseDb.rpc("create_order_from_application", { _application_id: a.id });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Pesanan dibuat. Lanjutkan ke pembayaran.");
    qc.invalidateQueries({ queryKey: ["application-order", a.id] });
    navigate({ to: "/pesanan/$id", params: { id: String(data) } });
  }
  return (
    <div className={cn(CARD, "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {a.developer && (
          <Link to="/$username" params={{ username: a.developer.username }} className="flex min-w-0 items-center gap-3 hover:text-primary">
            <AvatarMini name={a.developer.username} url={a.developer.avatar_url} size={44} />
            <span className="min-w-0"><span className="block truncate font-bold">{a.developer.display_name || a.developer.username}</span><span className="block truncate text-xs text-muted-foreground">{a.developer.headline || `@${a.developer.username}`}</span></span>
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {stage && a.status === "pending" && <Pill tone="info">{STAGE_LABEL[stage] ?? stage}</Pill>}
          <ApplicationStatusBadge status={a.status} />
        </div>
      </div>
      <p className="mt-3 text-sm">{hourly ? "Tarif" : "Penawaran"} <b className="text-primary">{bidText(a.bid_amount)}{hourly ? " /jam" : ""}</b> · {finishDate ? `selesai ${fmtDay(finishDate)}` : `${a.est_days} hari`} · {timeAgo(a.created_at)}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.cover_letter}</p>
      {a.developer?.skills?.length ? <div className="mt-2 flex flex-wrap gap-1">{a.developer.skills.slice(0, 8).map((s) => <span key={s} className="rounded bg-navy/10 px-1.5 py-0.5 font-mono text-[11px] text-navy">{s}</span>)}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canAnswer && <>{slots > 0 && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => respond(true)}><Check /> Terima</Button>}<Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => respond(false)}><X /> Tolak</Button></>}
        {canAnswer && stage !== "shortlisted" && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => setStage("shortlisted")}>Shortlist</Button>}
        {canAnswer && stage !== "interview" && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => setStage("interview")}>Undang interview</Button>}
        {a.status === "accepted" && (contract.data
          ? <Button asChild size="sm" className="rounded-full"><Link to="/kerja/kontrak/$id" params={{ id: contract.data.id }}><FileSignature /> Buka kontrak</Link></Button>
          : order.data
            ? <Button asChild size="sm" className="rounded-full"><Link to="/pesanan/$id" params={{ id: order.data.id }}><CreditCard /> Buka pesanan &amp; bayar</Link></Button>
            : (
              <>
                <Button asChild size="sm" className="rounded-full"><Link to="/kerja/kontrak/baru" search={{ application: a.id }}><FileSignature /> Buat kontrak GOBI WORK</Link></Button>
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={createOrder}><CreditCard /> Pesanan langsung (tanpa kontrak)</Button>
              </>
            ))}
        {a.status !== "withdrawn" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setChat(!chat)}><MessageSquare /> {chat ? "Tutup obrolan" : "Obrolan"}</Button>}
        <ReportButton targetType="application" targetId={a.id} label="Laporkan pelamar" defaultReason={a.status === "accepted" ? "not_completed" : "policy"} className="rounded-full" />
      </div>
      {a.status === "accepted" && !order.data && !contract.data && (
        <p className="mt-2 text-xs text-muted-foreground">Kontrak GOBI WORK cocok untuk milestone atau per jam; pesanan langsung untuk satu pembayaran. Pembayaran lewat Midtrans, dana disimpan di escrow dan langsung diteruskan ke developer begitu kamu menerima hasilnya.</p>
      )}
      {chat && <div className="mt-3"><ApplicationThread applicationId={a.id} /></div>}
    </div>
  );
}
