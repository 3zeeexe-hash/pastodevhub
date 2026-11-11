import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Check, Loader2, MessageSquare, Send, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { categoryLabel, errMsg, formatRupiah } from "@/lib/market";
import { JOB_SELECT, budgetLabel, canApply, canRespond, type ApplicationStatus, type JobCardData } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";
import { ApplicationStatusBadge, JobStatusBadge } from "@/components/job-card";
import { ApplicationThread } from "@/components/application-thread";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";

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
  const refresh = () => { qc.invalidateQueries({ queryKey: ["job", id] }); qc.invalidateQueries({ queryKey: ["job-apps", id] }); qc.invalidateQueries({ queryKey: ["jobs"] }); };

  if (job.isLoading) return <main className="mx-auto max-w-5xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  const j = job.data;
  if (!j) return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">Lowongan tidak ditemukan</h1><Button asChild className="mt-4"><Link to="/lowongan">Lihat lowongan lain</Link></Button></main>;

  const isOwner = user?.id === j.client_id;
  const mine = apps.data?.find((a) => a.developer_id === user?.id) ?? null;
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };

  async function setStatus(status: "open" | "closed") {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
    if (error) toast.error(errMsg(error)); else { toast.success(status === "closed" ? "Lowongan ditutup" : "Lowongan dibuka lagi"); refresh(); }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/lowongan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Semua lowongan</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0 space-y-5">
          <header className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium uppercase tracking-wide text-primary">{categoryLabel(j.category)}</span><JobStatusBadge status={j.status} /></div>
            <h1 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">{j.title}</h1>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Anggaran</p><p className="font-semibold">{budgetLabel(j.budget_min, j.budget_max)}</p></div>
              <div className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Pelamar</p><p className="flex items-center gap-1 font-semibold"><Users className="size-4" />{j.applications_count}</p></div>
              <div className="rounded-lg bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Tenggat</p><p className="flex items-center gap-1 font-semibold"><CalendarClock className="size-4" />{j.deadline ? new Date(j.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Fleksibel"}</p></div>
            </div>
            {j.skills.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{j.skills.map((s) => <span key={s} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{s}</span>)}</div>}
          </header>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 font-semibold">Deskripsi proyek</h2>
            {j.description ? <Markdown>{j.description}</Markdown> : <p className="text-sm text-muted-foreground">Tidak ada deskripsi.</p>}
          </section>

          {isOwner && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="size-5 text-primary" /> Pelamar ({apps.data?.length ?? 0})</h2>
              {apps.data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada pelamar. Bagikan link lowongan ini ke komunitas.</p>}
              {apps.data?.map((a) => <ApplicantCard key={a.id} a={a} canAnswer={canRespond(j, a, user?.id ?? null)} onDone={refresh} />)}
            </section>
          )}

          {!isOwner && mine && (
            <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Lamaran kamu</h2>
                <ApplicationStatusBadge status={mine.status} />
              </div>
              <p className="text-sm">Penawaran <b>{formatRupiah(mine.bid_amount, "Nego")}</b> · {mine.est_days} hari · dikirim {timeAgo(mine.created_at)}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{mine.cover_letter}</p>
              {mine.status === "pending" && (
                <Button size="sm" variant="outline" onClick={async () => {
                  const { error } = await supabase.rpc("withdraw_job_application", { _application_id: mine.id });
                  if (error) toast.error(errMsg(error)); else { toast.success("Lamaran ditarik"); refresh(); }
                }}>Tarik lamaran</Button>
              )}
              {mine.status !== "withdrawn" && (<><h3 className="flex items-center gap-2 pt-2 text-sm font-semibold"><MessageSquare className="size-4" /> Obrolan dengan client</h3><ApplicationThread applicationId={mine.id} /></>)}
            </section>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {j.client && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Diposting oleh</p>
              <Link to="/$username" params={{ username: j.client.username }} className="mt-2 flex items-center gap-3 hover:text-primary">
                <AvatarMini name={j.client.username} url={j.client.avatar_url} size={40} />
                <span className="min-w-0"><span className="block truncate font-semibold">{j.client.display_name || j.client.username}</span><span className="block text-xs text-muted-foreground">{timeAgo(j.created_at)}</span></span>
              </Link>
            </div>
          )}
          {isOwner ? (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Kelola lowongan</p>
              {j.status !== "closed" ? <Button variant="outline" className="w-full" onClick={() => setStatus("closed")}>Tutup lowongan</Button>
                : <Button className="w-full" onClick={() => setStatus("open")}>Buka lagi</Button>}
              <Button asChild variant="ghost" className="w-full"><Link to="/dashboard">Ke dashboard</Link></Button>
            </div>
          ) : !user ? (
            <SignInCta text="Masuk sebagai developer untuk melamar." />
          ) : canApply(j, viewer, !!mine) ? (
            <ApplyForm jobId={j.id} userId={user.id} onDone={refresh} />
          ) : !mine ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              {j.status !== "open" ? "Lowongan ini sudah tidak menerima lamaran." : profile?.account_type !== "developer" ? "Hanya akun developer yang bisa melamar. Ganti jenis akun di Pengaturan." : "Kamu tidak bisa melamar lowongan ini."}
            </div>
          ) : null}
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
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 shadow-glow">
      <p className="font-semibold">Lamar proyek ini</p>
      <div><Label htmlFor="cl">Surat lamaran</Label><Textarea id="cl" rows={6} value={f.letter} onChange={(e) => setF({ ...f, letter: e.target.value })} placeholder="Kenapa kamu cocok? Sertakan link portofolio atau proyek serupa." /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="bid">Penawaran (Rp)</Label><Input id="bid" type="number" min={0} step={1000} value={f.bid} onChange={(e) => setF({ ...f, bid: e.target.value })} placeholder="1500000" /></div>
        <div><Label htmlFor="days">Lama kerja (hari)</Label><Input id="days" type="number" min={1} max={365} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></div>
      </div>
      <Button disabled={busy} className="w-full">{busy ? <Loader2 className="animate-spin" /> : <Send />} Kirim lamaran</Button>
    </form>
  );
}

function ApplicantCard({ a, canAnswer, onDone }: { a: App; canAnswer: boolean; onDone: () => void }) {
  const [chat, setChat] = useState(false);
  const [busy, setBusy] = useState(false);
  async function respond(accept: boolean) {
    if (accept && !confirm(`Terima @${a.developer?.username}? Pelamar lain otomatis tidak dipilih.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("respond_job_application", { _application_id: a.id, _accept: accept });
    setBusy(false);
    if (error) toast.error(errMsg(error)); else { toast.success(accept ? "Developer diterima! Lanjutkan diskusi lewat obrolan." : "Lamaran ditolak"); onDone(); if (accept) setChat(true); }
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {a.developer && (
          <Link to="/$username" params={{ username: a.developer.username }} className="flex min-w-0 items-center gap-3 hover:text-primary">
            <AvatarMini name={a.developer.username} url={a.developer.avatar_url} size={44} />
            <span className="min-w-0"><span className="block truncate font-semibold">{a.developer.display_name || a.developer.username}</span><span className="block truncate text-xs text-muted-foreground">{a.developer.headline || `@${a.developer.username}`}</span></span>
          </Link>
        )}
        <ApplicationStatusBadge status={a.status} />
      </div>
      <p className="mt-3 text-sm">Penawaran <b className="text-primary">{formatRupiah(a.bid_amount, "Nego")}</b> · {a.est_days} hari · {timeAgo(a.created_at)}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.cover_letter}</p>
      {a.developer?.skills?.length ? <div className="mt-2 flex flex-wrap gap-1">{a.developer.skills.slice(0, 8).map((s) => <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{s}</span>)}</div> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canAnswer && <><Button size="sm" disabled={busy} onClick={() => respond(true)}><Check /> Terima</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => respond(false)}><X /> Tolak</Button></>}
        {a.status !== "withdrawn" && <Button size="sm" variant="ghost" onClick={() => setChat(!chat)}><MessageSquare /> {chat ? "Tutup obrolan" : "Obrolan"}</Button>}
      </div>
      {chat && <div className="mt-3"><ApplicationThread applicationId={a.id} /></div>}
    </div>
  );
}
