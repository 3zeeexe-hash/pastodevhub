// Tab admin "Lamaran": statistik, daftar yang jelas, dan detail lengkap tiap lamaran untuk ditinjau.
// Hanya MEMBACA (RLS admin). Isi obrolan lamaran sengaja tidak ditampilkan di sini; hanya jumlah pesan. Obrolan dibuka lewat detail sengketa.
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { FileSignature } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { budgetLabel, jobCategoryLabel } from "@/lib/jobs";
import type { ContractStatus } from "@/lib/work";
import { fmtDate, rp } from "@/lib/work-db";
import { average, bidVsBudget, pct } from "@/lib/admin-work-stats";
import { hasText, Loading, SearchBox } from "@/components/admin-work-extra";
import {
  Block, countOf, Fact, FilterSelect, fmtCount, fmtDateTime, handle, Info, MoreButton, nameOf, profileMap, selectFirst, soft, StatGrid,
  type People,
} from "@/components/admin-work-shared";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContractPill, EmptyState, Pill, reportReasonLabel, Stat } from "@/components/work-ui";

type Tone = NonNullable<ComponentProps<typeof Pill>["tone"]>;

type AppRow = {
  id: string; job_id: string; developer_id: string; status: string; work_stage?: string | null; finish_date?: string | null;
  bid_amount: number | null; est_days: number | null; cover_letter: string | null; created_at: string;
  job: { title: string; status: string; category: string; budget_min: number | null; budget_max: number | null; client_id: string; payment_type?: string | null } | null;
};
type ContractLite = { id: string; status: string; total_amount: number; client_approved_at: string | null; freelancer_approved_at: string | null; created_at: string };
type ReportLite = Record<string, unknown>;

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu jawaban", accepted: "Diterima", rejected: "Ditolak", withdrawn: "Ditarik pelamar" };
const STATUS_TONE: Record<string, Tone> = { pending: "warn", accepted: "ok", rejected: "bad", withdrawn: "neutral" };
const STAGE_LABEL: Record<string, string> = { viewed: "Dilihat client", shortlisted: "Shortlist", interview: "Interview" };
const JOB_STATUS: Record<string, string> = { open: "Dibuka", in_progress: "Sedang dikerjakan", closed: "Ditutup" };

const STATUS_FILTERS = [["all", "Semua status"], ["pending", "Menunggu jawaban"], ["accepted", "Diterima"], ["rejected", "Ditolak"], ["withdrawn", "Ditarik pelamar"]] as const;
const STAGE_FILTERS = [["all", "Semua tahap"], ["viewed", "Dilihat client"], ["shortlisted", "Shortlist"], ["interview", "Interview"]] as const;
const SORTS = [["newest", "Terbaru"], ["bid_desc", "Penawaran tertinggi"], ["bid_asc", "Penawaran terendah"]] as const;

// Kolom dicoba dari yang terlengkap: payment_type (SQL 001), work_stage (SQL 002), finish_date (SQL 006).
const APP_BASE = "id,job_id,developer_id,status,bid_amount,est_days,cover_letter,created_at";
const JOB_EMBED = (pay: boolean) => `job:jobs(title,status,category,budget_min,budget_max,client_id${pay ? ",payment_type" : ""})`;
const APP_VARIANTS = [
  `${APP_BASE},work_stage,finish_date,${JOB_EMBED(true)}`,
  `${APP_BASE},work_stage,${JOB_EMBED(true)}`,
  `${APP_BASE},${JOB_EMBED(true)}`,
  `${APP_BASE},${JOB_EMBED(false)}`,
];
const PAGE = 50;

function useApplicationStats() {
  return useQuery({
    queryKey: ["work-admin-application-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const head = () => looseDb.from("job_applications").select("id", { count: "exact", head: true });
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [total, pending, accepted, rejected, withdrawn, shortlisted, interview, recent, contracts] = await Promise.all([
        countOf(head()),
        countOf(head().eq("status", "pending")),
        countOf(head().eq("status", "accepted")),
        countOf(head().eq("status", "rejected")),
        countOf(head().eq("status", "withdrawn")),
        countOf(head().eq("status", "pending").eq("work_stage", "shortlisted")),
        countOf(head().eq("status", "pending").eq("work_stage", "interview")),
        countOf(head().gte("created_at", since)),
        countOf(looseDb.from("work_contracts").select("id", { count: "exact", head: true })),
      ]);
      return { total, pending, accepted, rejected, withdrawn, shortlisted, interview, recent, contracts };
    },
  });
}

export function ApplicationsTab() {
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [sort, setSort] = useState("newest");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<AppRow | null>(null);
  const stats = useApplicationStats();
  const s = stats.data;

  const q = useQuery({
    queryKey: ["work-admin-applications", status, stage, limit],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const rows = await selectFirst<AppRow>(APP_VARIANTS, (cols) => {
        let qb = looseDb.from("job_applications").select(cols).order("created_at", { ascending: false }).limit(limit);
        if (status !== "all") qb = qb.eq("status", status);
        if (stage !== "all" && cols.includes("work_stage")) qb = qb.eq("work_stage", stage);
        return qb;
      });
      const people = await profileMap(rows.flatMap((r) => [r.developer_id, r.job?.client_id]));
      return { rows, people };
    },
  });
  const rows = q.data?.rows ?? [];
  const people: People = q.data?.people ?? {};
  const shown = rows
    .filter((a) => hasText(term, a.job?.title, people[a.developer_id]?.username, people[a.developer_id]?.display_name, people[a.job?.client_id ?? ""]?.username, STATUS_LABEL[a.status], a.status, a.cover_letter))
    .sort((a, b) => (sort === "bid_desc" ? Number(b.bid_amount ?? 0) - Number(a.bid_amount ?? 0) : sort === "bid_asc" ? Number(a.bid_amount ?? 0) - Number(b.bid_amount ?? 0) : 0));
  const fixedBids = rows.filter((r) => r.bid_amount && r.job?.payment_type !== "hourly").map((r) => Number(r.bid_amount));
  const decided = (s?.accepted ?? 0) + (s?.rejected ?? 0);

  return (
    <div className="space-y-4">
      <StatGrid cols="lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total lamaran" value={fmtCount(s?.total)} hint={s?.recent != null ? `${fmtCount(s.recent)} baru dalam 7 hari` : undefined} />
        <Stat label="Menunggu jawaban" value={fmtCount(s?.pending)} hint={s ? `${fmtCount(s.shortlisted)} shortlist · ${fmtCount(s.interview)} interview` : undefined} />
        <Stat label="Diterima" value={fmtCount(s?.accepted)} hint={s ? (decided > 0 ? `${pct(s.accepted, decided)}% dari lamaran yang sudah dijawab` : "Belum ada yang dijawab") : undefined} />
        <Stat label="Ditolak" value={fmtCount(s?.rejected)} hint="Ditolak oleh client" />
        <Stat label="Ditarik pelamar" value={fmtCount(s?.withdrawn)} hint="Dibatalkan oleh pelamar" />
        <Stat label="Kontrak dibuat" value={fmtCount(s?.contracts)} hint="Dari lamaran yang diterima" />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={term} onChange={setTerm} label="Cari lamaran" placeholder="Cari lowongan, pelamar, client, atau isi surat…" />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setLimit(PAGE); }} label="Status lamaran" options={STATUS_FILTERS} />
        <FilterSelect value={stage} onChange={(v) => { setStage(v); setLimit(PAGE); }} label="Tahap lamaran" options={STAGE_FILTERS} className="w-44" />
        <FilterSelect value={sort} onChange={setSort} label="Urutkan lamaran" options={SORTS} className="w-52" />
      </div>

      <p className="text-xs text-muted-foreground">
        Menampilkan {shown.length} dari {rows.length} lamaran terbaru yang dimuat{fixedBids.length > 0 ? ` · rata-rata penawaran kerja langsung ${rp(average(fixedBids))}` : ""}. Pencarian hanya mencari di data yang sudah dimuat; tekan "Muat lebih banyak" untuk yang lebih lama.
      </p>

      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>{term.trim() ? "Tidak ada lamaran yang cocok dengan pencarian." : "Belum ada lamaran pada filter ini."}</EmptyState>}

      <ul className="space-y-3">
        {shown.map((a) => {
          const dev = people[a.developer_id];
          const client = a.job ? people[a.job.client_id] : undefined;
          const hourly = a.job?.payment_type === "hourly";
          const verdict = bidVsBudget(a.bid_amount, Number(a.job?.budget_min ?? 0), Number(a.job?.budget_max ?? 0), hourly);
          return (
            <li key={a.id}>
              <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarMini name={dev?.username ?? "?"} url={dev?.avatar_url ?? null} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-bold">{nameOf(dev)} <span className="text-xs font-normal text-muted-foreground">{handle(dev)}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{dev?.headline || "Pelamar"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.work_stage && a.status === "pending" && <Pill tone="info">{STAGE_LABEL[a.work_stage] ?? a.work_stage}</Pill>}
                    <Pill tone={STATUS_TONE[a.status] ?? "neutral"}>{STATUS_LABEL[a.status] ?? a.status}</Pill>
                  </div>
                </div>

                <p className="mt-3 text-sm">
                  Melamar ke <Link to="/lowongan/$id" params={{ id: a.job_id }} className="font-semibold hover:text-primary">{a.job?.title ?? "Lowongan dihapus"}</Link>
                  <span className="text-muted-foreground"> · pemilik {handle(client)}</span>
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Fact label={hourly ? "Tarif per jam" : "Penawaran"} sub={<Pill tone={verdict.tone}>{verdict.label}</Pill>}>{a.bid_amount ? rp(a.bid_amount) : "Nego"}</Fact>
                  <Fact label="Anggaran lowongan" sub={a.job ? <Pill>{JOB_STATUS[a.job.status] ?? a.job.status}</Pill> : undefined}>{a.job ? budgetLabel(Number(a.job.budget_min ?? 0), Number(a.job.budget_max ?? 0)) : "—"}</Fact>
                  <Fact label={a.finish_date ? "Selesai pada" : "Estimasi pengerjaan"} sub={<span className="text-xs text-muted-foreground">dikirim {timeAgo(a.created_at)}</span>}>{a.finish_date ? fmtDate(a.finish_date) : a.est_days ? `${a.est_days} hari` : "—"}</Fact>
                </div>

                {a.cover_letter && <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{a.cover_letter}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="rounded-full" onClick={() => setOpen(a)}>Lihat detail lengkap</Button>
                  <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/lowongan/$id" params={{ id: a.job_id }}>Buka lowongan</Link></Button>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {rows.length >= limit && <MoreButton busy={q.isFetching} onClick={() => setLimit((n) => n + PAGE)}>Muat lebih banyak</MoreButton>}

      <ApplicationDetail app={open} people={people} onClose={() => setOpen(null)} />
    </div>
  );
}

function ApplicationDetail({ app, people, onClose }: { app: AppRow | null; people: People; onClose: () => void }) {
  const q = useQuery({
    enabled: !!app,
    queryKey: ["work-admin-application-detail", app?.id],
    queryFn: async () => {
      const a = app!;
      const head = (table: string) => looseDb.from(table).select("id", { count: "exact", head: true });
      const [contract, ban, devTotal, devAccepted, jobApplicants, messages, reports] = await Promise.all([
        soft<ContractLite>(looseDb.from("work_contracts").select("id,status,total_amount,client_approved_at,freelancer_approved_at,created_at").eq("application_id", a.id).maybeSingle()),
        soft<{ reason: string | null }>(looseDb.from("user_bans").select("reason").eq("user_id", a.developer_id).maybeSingle()),
        countOf(head("job_applications").eq("developer_id", a.developer_id)),
        countOf(head("job_applications").eq("developer_id", a.developer_id).eq("status", "accepted")),
        countOf(head("job_applications").eq("job_id", a.job_id)),
        countOf(head("job_messages").eq("application_id", a.id)),
        soft<ReportLite[]>(looseDb.from("work_reports").select("*").eq("target_type", "application").eq("target_id", a.id).order("created_at", { ascending: false }).limit(20)),
      ]);
      return { contract, ban, devTotal, devAccepted, jobApplicants, messages, reports: reports ?? [] };
    },
  });

  const dev = app ? people[app.developer_id] : undefined;
  const client = app?.job ? people[app.job.client_id] : undefined;
  const hourly = app?.job?.payment_type === "hourly";
  const verdict = app ? bidVsBudget(app.bid_amount, Number(app.job?.budget_min ?? 0), Number(app.job?.budget_max ?? 0), hourly) : null;

  return (
    <Dialog open={!!app} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detail lamaran</DialogTitle>
          <DialogDescription>Semua yang dibutuhkan untuk meninjau lamaran ini. Isi obrolan tidak ditampilkan; hanya jumlah pesan.</DialogDescription>
        </DialogHeader>
        {app && (
          <div className="space-y-4 text-sm">
            <Block title="Pelamar">
              <div className="flex items-center gap-3">
                <AvatarMini name={dev?.username ?? "?"} url={dev?.avatar_url ?? null} size={48} />
                <div className="min-w-0">
                  {dev ? <Link to="/$username" params={{ username: dev.username }} className="block truncate font-bold hover:text-primary">{nameOf(dev)} <span className="text-xs font-normal text-muted-foreground">{handle(dev)}</span></Link> : <p className="font-bold">Profil tidak ditemukan</p>}
                  {dev?.headline && <p className="text-xs text-muted-foreground">{dev.headline}</p>}
                </div>
                {q.data?.ban && <Pill tone="bad">diblokir</Pill>}
              </div>
              {dev?.skills?.length ? <div className="flex flex-wrap gap-1">{dev.skills.slice(0, 12).map((k) => <span key={k} className="rounded bg-navy/10 px-1.5 py-0.5 font-mono text-[11px] text-navy">{k}</span>)}</div> : null}
              <p className="text-xs text-muted-foreground">
                {q.isLoading ? "Memuat riwayat pelamar…" : `Riwayat: ${fmtCount(q.data?.devTotal)} lamaran di platform, ${fmtCount(q.data?.devAccepted)} diterima${q.data?.ban?.reason ? ` · alasan blokir: ${q.data.ban.reason}` : ""}`}
              </p>
            </Block>

            <Block title="Lowongan">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Judul"><Link to="/lowongan/$id" params={{ id: app.job_id }} className="text-primary underline">{app.job?.title ?? "Lowongan dihapus"}</Link></Info>
                <Info label="Pemilik (client)">{handle(client)}</Info>
                <Info label="Kategori">{app.job ? jobCategoryLabel(app.job.category) : "—"}</Info>
                <Info label="Anggaran">{app.job ? budgetLabel(Number(app.job.budget_min ?? 0), Number(app.job.budget_max ?? 0)) : "—"}</Info>
                <Info label="Status lowongan">{app.job ? (JOB_STATUS[app.job.status] ?? app.job.status) : "—"}</Info>
                <Info label="Total pelamar di lowongan ini">{fmtCount(q.data?.jobApplicants)}</Info>
              </dl>
            </Block>

            <Block title="Penawaran & jadwal">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label={hourly ? "Tarif per jam" : "Penawaran"}>{app.bid_amount ? rp(app.bid_amount) : "Nego"}</Info>
                <Info label="Dibanding anggaran">{verdict && <Pill tone={verdict.tone}>{verdict.label}</Pill>}</Info>
                <Info label="Estimasi pengerjaan">{app.est_days ? `${app.est_days} hari` : "—"}</Info>
                <Info label="Tanggal selesai yang diusulkan">{app.finish_date ? fmtDate(app.finish_date) : "Tidak diisi"}</Info>
                <Info label="Status"><Pill tone={STATUS_TONE[app.status] ?? "neutral"}>{STATUS_LABEL[app.status] ?? app.status}</Pill></Info>
                <Info label="Tahap peninjauan client">{app.work_stage ? (STAGE_LABEL[app.work_stage] ?? app.work_stage) : "Belum ditandai"}</Info>
                <Info label="Dikirim">{fmtDateTime(app.created_at)} ({timeAgo(app.created_at)})</Info>
              </dl>
            </Block>

            <Block title="Surat lamaran">
              {app.cover_letter ? <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-3">{app.cover_letter}</p> : <p className="text-xs text-muted-foreground">Surat lamaran kosong.</p>}
            </Block>

            <Block title="Tindak lanjut">
              <Loading q={q} />
              {q.data && (
                <div className="space-y-2">
                  {q.data.contract ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                      <div>
                        <p className="font-semibold">Kontrak GOBI WORK · {rp(q.data.contract.total_amount)}</p>
                        <p className="text-xs text-muted-foreground">dibuat {fmtDate(q.data.contract.created_at)} · client {q.data.contract.client_approved_at ? "sudah setuju" : "belum setuju"} · freelancer {q.data.contract.freelancer_approved_at ? "sudah setuju" : "belum setuju"}</p>
                      </div>
                      <span className="flex items-center gap-2">
                        <ContractPill status={q.data.contract.status as ContractStatus} />
                        <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/kerja/kontrak/$id" params={{ id: q.data.contract.id }}><FileSignature /> Buka kontrak</Link></Button>
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{app.status === "accepted" ? "Lamaran diterima, tetapi kontrak belum dibuat." : "Belum ada kontrak (kontrak dibuat setelah lamaran diterima)."}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Obrolan lamaran: {fmtCount(q.data.messages)} pesan.</p>
                  {q.data.reports.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-destructive">{q.data.reports.length} laporan terhadap lamaran ini</p>
                      {q.data.reports.map((r, i) => (
                        <div key={String(r.id ?? i)} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
                          <p><b>{typeof r.reason === "string" ? reportReasonLabel(r.reason) : "Laporan"}</b> · {String(r.status ?? "")} · {typeof r.created_at === "string" ? timeAgo(r.created_at) : ""}</p>
                          {typeof r.detail === "string" && r.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{r.detail}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Block>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
