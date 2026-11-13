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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";
import { ApplicationStatusBadge, JobStatusBadge } from "@/components/job-card";
import { JobExtras } from "@/components/job-extras";
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
  // Saat pemilik membuka daftar pelamar, lamaran yang masih menunggu ditandai "dilihat" (sekali; diabaikan jika SQL 002 belum ada).
  const hasPending = !!apps.data?.some((a) => a.status === "pending");
  useEffect(() => {
    if (viewerIsOwner && hasPending) {
      looseDb.rpc("work_mark_applications_viewed", { _job_id: id }).then(() => qc.invalidateQueries({ queryKey: ["job-app-stages", id] }), () => undefined);
    }
  }, [viewerIsOwner, hasPending, id, qc]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job", id] }); qc.invalidateQueries({ queryKey: ["job-apps", id] }); qc.invalidateQueries({ queryKey: ["job-app-stages", id] }); qc.invalidateQueries({ queryKey: ["jobs"] }); };

  if (job.isLoading) return <main className="min-h-screen bg-background"><GobiLoader page /></main>;
  const j = job.data;
  if (!j) return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">Lowongan tidak ditemukan</h1><Button asChild className="mt-4 rounded-full"><Link to="/lowongan">Lihat lowongan lain</Link></Button></main>;

  const isOwner = user?.id === j.client_id;
  const mine = apps.data?.find((a) => a.developer_id === user?.id) ?? null;
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };

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
          <header className={cn(CARD, "p-4 sm:p-5")}>
            <div className="grid grid-cols-1 gap-3 text-sm min-[420px]:grid-cols-3">
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Anggaran</p><p className="flex items-start gap-1 font-bold"><Wallet className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{budgetLabel(j.budget_min, j.budget_max)}</span></p></div>
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Pelamar</p><p className="flex items-center gap-1 font-bold"><Users className="size-4" />{j.applications_count}</p></div>
              <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Tenggat</p><p className="flex items-center gap-1 font-bold"><CalendarClock className="size-4 shrink-0" />{j.deadline ? new Date(j.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Fleksibel"}</p></div>
            </div>
            {j.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{j.skills.map((s) => <span key={s} className="rounded-md bg-navy/10 px-2 py-0.5 font-mono text-xs text-navy">{s}</span>)}</div>}
          </header>
          <section className={cn(CARD, "p-4 sm:p-5")}>
            <h2 className="mb-3 font-extrabold">Deskripsi proyek</h2>
            {j.description ? <Markdown>{j.description}</Markdown> : <p className="text-sm text-muted-foreground">Tidak ada deskripsi.</p>}
          </section>
          <JobExtras jobId={j.id} />

          {isOwner && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold"><Users className="size-5 text-primary" /> Pelamar ({apps.data?.length ?? 0})</h2>
              {apps.isLoading && <div className={CARD}><GobiLoader compact /></div>}
              {apps.data?.length === 0 && <p className={cn(CARD, "p-8 text-center text-sm text-muted-foreground")}>Belum ada pelamar. Bagikan link lowongan ini ke komunitas.</p>}
              {apps.data?.map((a) => <ApplicantCard key={a.id} a={a} stage={stages.data?.[a.id] ?? null} canAnswer={canRespond(j, a, user?.id ?? null)} onDone={refresh} />)}
            </section>
          )}

          {!isOwner && mine && (
            <section className="space-y-3 rounded-2xl bg-card p-4 shadow-sm ring-2 ring-primary/40 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-extrabold">Lamaran kamu</h2>
                <ApplicationStatusBadge status={mine.status} />
              </div>
              <p className="text-sm">Penawaran <b>{formatRupiah(mine.bid_amount, "Nego")}</b> · {mine.est_days} hari · dikirim {timeAgo(mine.created_at)}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{mine.cover_letter}</p>
              {mine.status === "pending" && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={async () => {
                  const { error } = await supabase.rpc("withdraw_job_application", { _application_id: mine.id });
                  if (error) toast.error(errMsg(error)); else { toast.success("Lamaran ditarik"); refresh(); }
                }}>Tarik lamaran</Button>
              )}
              {mine.status === "accepted" && <MyAcceptedOrder applicationId={mine.id} />}
              {mine.status !== "withdrawn" && (<><h3 className="flex items-center gap-2 pt-2 text-sm font-semibold"><MessageSquare className="size-4" /> Obrolan dengan client</h3><ApplicationThread applicationId={mine.id} /></>)}
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
            <ApplyForm jobId={j.id} userId={user.id} onDone={refresh} />
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

function ApplyForm({ jobId, userId, onDone }: { jobId: string; userId: string; onDone: () => void }) {
  const [f, setF] = useState({ letter: "", bid: "", days: "7" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.letter.trim().length < 20) { toast.error("Ceritakan pengalamanmu minimal 20 karakter."); return; }
    setBusy(true);
    const { error } = await supabase.from("job_applications").insert({
      job_id: jobId, developer_id: userId, cover_letter: f.letter.trim().slice(0, 4000),
      bid_amount: Math.max(0, Math.round(Number(f.bid || 0))), est_days: Math.min(365, Math.max(1, Math.round(Number(f.days || 7)))),
    });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "Kamu sudah melamar lowongan ini." : "Gagal mengirim lamaran."); return; }
    toast.success("Lamaran terkirim! Client akan meninjau penawaranmu.");
    onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-card p-4 shadow-glow ring-2 ring-primary/40">
      <p className="font-extrabold">Lamar proyek ini</p>
      <div><Label htmlFor="cl">Surat lamaran</Label><Textarea id="cl" rows={6} value={f.letter} onChange={(e) => setF({ ...f, letter: e.target.value })} placeholder="Kenapa kamu cocok? Sertakan link portofolio atau proyek serupa." /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="bid">Penawaran (Rp)</Label><Input id="bid" type="number" min={0} step={1000} value={f.bid} onChange={(e) => setF({ ...f, bid: e.target.value })} placeholder="1500000" /></div>
        <div><Label htmlFor="days">Lama kerja (hari)</Label><Input id="days" type="number" min={1} max={365} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></div>
      </div>
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
  return <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Lamaranmu diterima. Menunggu client membuat kontrak atau pesanan pembayaran; setelah dibayar, dana ditahan admin dan kamu bisa mulai bekerja.</p>;
}

function ApplicantCard({ a, stage, canAnswer, onDone }: { a: App; stage: string | null; canAnswer: boolean; onDone: () => void }) {
  const [chat, setChat] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const order = useApplicationOrder(a.id, a.status === "accepted");
  const contract = useApplicationContract(a.id, a.status === "accepted");
  async function respond(accept: boolean) {
    if (accept && !confirm(`Terima @${a.developer?.username}? Pelamar lain otomatis tidak dipilih.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("respond_job_application", { _application_id: a.id, _accept: accept });
    setBusy(false);
    if (error) toast.error(errMsg(error)); else { toast.success(accept ? "Developer diterima! Buat kontrak GOBI WORK atau pesanan langsung untuk membayar lewat escrow." : "Lamaran ditolak"); onDone(); if (accept) setChat(true); }
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
      <p className="mt-3 text-sm">Penawaran <b className="text-primary">{formatRupiah(a.bid_amount, "Nego")}</b> · {a.est_days} hari · {timeAgo(a.created_at)}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.cover_letter}</p>
      {a.developer?.skills?.length ? <div className="mt-2 flex flex-wrap gap-1">{a.developer.skills.slice(0, 8).map((s) => <span key={s} className="rounded bg-navy/10 px-1.5 py-0.5 font-mono text-[11px] text-navy">{s}</span>)}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canAnswer && <><Button size="sm" className="rounded-full" disabled={busy} onClick={() => respond(true)}><Check /> Terima</Button><Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => respond(false)}><X /> Tolak</Button></>}
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
      </div>
      {a.status === "accepted" && !order.data && !contract.data && (
        <p className="mt-2 text-xs text-muted-foreground">Kontrak GOBI WORK cocok untuk milestone atau per jam; pesanan langsung untuk satu pembayaran. Pembayaran lewat Midtrans, dana ditahan admin (escrow) dan baru diteruskan ke developer setelah pekerjaan selesai dan kamu menerima hasilnya.</p>
      )}
      {chat && <div className="mt-3"><ApplicationThread applicationId={a.id} /></div>}
    </div>
  );
}
