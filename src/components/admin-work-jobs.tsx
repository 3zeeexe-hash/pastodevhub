// Tab admin "Lowongan": statistik moderasi, daftar yang jelas, dan detail lengkap (deskripsi, aturan kerja, pelamar, laporan, riwayat) sebelum menyetujui/menolak.
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { budgetLabel, experienceLabel, jobCategoryLabel, jobTypeLabel, paymentTypeLabel, sanitizeTerm, workModeLabel } from "@/lib/jobs";
import { useJobTerms } from "@/lib/job-terms";
import { useRefreshWorkAdmin } from "@/lib/use-admin-work-activity";
import { fmtDate, rp, workRpc } from "@/lib/work-db";
import { average } from "@/lib/admin-work-stats";
import { Loading, SearchBox } from "@/components/admin-work-extra";
import {
  Block, countOf, Fact, FilterSelect, fmtCount, fmtDateTime, GroupTitle, handle, Info, MoreButton, nameOf, profileMap, selectFirst, soft, StatGrid,
  type People,
} from "@/components/admin-work-shared";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Pill, ReasonDialog, reportReasonLabel, Stat, type Ask } from "@/components/work-ui";

type Tone = NonNullable<ComponentProps<typeof Pill>["tone"]>;

type JobRow = {
  id: string; title: string; description: string | null; category: string; skills: string[] | null;
  budget_min: number | null; budget_max: number | null; deadline: string | null; status: string; applications_count: number | null;
  created_at: string; client_id: string;
  moderation_status?: string | null; moderation_note?: string | null;
  job_type?: string | null; work_mode?: string | null; location?: string | null; experience_level?: string | null;
  payment_type?: string | null; positions?: number | null; requirements?: string | null;
};
type ReportLite = Record<string, unknown>;
type Hist = { id: number; admin_label: string | null; action: string; note: string | null; created_at: string };
type AppLite = { id: string; developer_id: string; status: string; bid_amount: number | null; created_at: string };

const MOD_LABEL: Record<string, string> = { pending: "Menunggu moderasi", approved: "Disetujui", rejected: "Ditolak" };
const modKey = (m: string | null | undefined) => m ?? "approved"; // lowongan lama tanpa status dianggap disetujui
const modTone = (m: string): Tone => (m === "rejected" ? "bad" : m === "pending" ? "warn" : "ok");
const JOB_STATUS: Record<string, string> = { open: "Dibuka", in_progress: "Sedang dikerjakan", closed: "Ditutup" };
const APP_STATUS: Record<string, string> = { pending: "Menunggu", accepted: "Diterima", rejected: "Ditolak", withdrawn: "Ditarik" };
const APP_TONE: Record<string, Tone> = { pending: "warn", accepted: "ok", rejected: "bad", withdrawn: "neutral" };

const MOD_FILTERS = [["pending", "Menunggu moderasi"], ["approved", "Disetujui"], ["rejected", "Ditolak"], ["reported", "Dilaporkan (laporan terbuka)"], ["all", "Semua"]] as const;
const STATUS_FILTERS = [["all", "Semua status"], ["open", "Dibuka"], ["in_progress", "Sedang dikerjakan"], ["closed", "Ditutup"]] as const;
const SORTS = [["newest", "Terbaru"], ["applicants", "Pelamar terbanyak"], ["budget", "Anggaran tertinggi"]] as const;

const JOB_BASE = "id,title,description,category,skills,budget_min,budget_max,deadline,status,applications_count,created_at,client_id";
const JOB_WORK = "job_type,work_mode,location,experience_level,payment_type,positions,requirements";
const JOB_MOD = "moderation_status,moderation_note";
const JOB_VARIANTS = [`${JOB_BASE},${JOB_WORK},${JOB_MOD}`, `${JOB_BASE},${JOB_MOD}`, JOB_BASE];
const PAGE = 30;

function useJobStats() {
  return useQuery({
    queryKey: ["work-admin-job-stats"],
    staleTime: 30_000,
    queryFn: async () => {
      const head = () => looseDb.from("jobs").select("id", { count: "exact", head: true });
      const [total, pending, approved, rejected, open, inProgress, closed, reportedIds] = await Promise.all([
        countOf(head()),
        countOf(head().eq("moderation_status", "pending")),
        countOf(head().or("moderation_status.eq.approved,moderation_status.is.null")),
        countOf(head().eq("moderation_status", "rejected")),
        countOf(head().eq("status", "open")),
        countOf(head().eq("status", "in_progress")),
        countOf(head().eq("status", "closed")),
        soft<{ target_id: string }[]>(looseDb.from("work_reports").select("target_id").eq("target_type", "job").in("status", ["open", "reviewing"]).limit(1000)),
      ]);
      return { total, pending, approved, rejected, open, inProgress, closed, reported: reportedIds ? new Set(reportedIds.map((r) => r.target_id)).size : null };
    },
  });
}

export function JobsTab() {
  const qc = useQueryClient();
  const refreshAll = useRefreshWorkAdmin();
  const [modFilter, setModFilter] = useState("pending");
  const [jobStatus, setJobStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [term, setTerm] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [detail, setDetail] = useState<JobRow | null>(null);
  const stats = useJobStats();
  const s = stats.data;

  const q = useQuery({
    queryKey: ["work-admin-jobs", modFilter, jobStatus, sort, limit, term],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const empty = { rows: [] as JobRow[], people: {} as People, reports: {} as Record<string, number> };
      const t = sanitizeTerm(term);
      let ids: string[] | null = null;
      if (modFilter === "reported") {
        const reps = (await soft<{ target_id: string }[]>(looseDb.from("work_reports").select("target_id").eq("target_type", "job").in("status", ["open", "reviewing"]).limit(1000))) ?? [];
        ids = [...new Set(reps.map((r) => r.target_id))];
        if (!ids.length) return empty;
      }
      const rows = await selectFirst<JobRow>(JOB_VARIANTS, (cols) => {
        let qb = looseDb.from("jobs").select(cols).limit(limit);
        qb = sort === "applicants" ? qb.order("applications_count", { ascending: false }).order("created_at", { ascending: false })
          : sort === "budget" ? qb.order("budget_max", { ascending: false }).order("created_at", { ascending: false })
            : qb.order("created_at", { ascending: false });
        if (ids) qb = qb.in("id", ids);
        else if (cols.includes("moderation_status") && modFilter !== "all") {
          qb = modFilter === "approved" ? qb.or("moderation_status.eq.approved,moderation_status.is.null") : qb.eq("moderation_status", modFilter);
        }
        if (jobStatus !== "all") qb = qb.eq("status", jobStatus);
        if (t) qb = qb.or(`title.ilike.%${t}%,category.ilike.%${t}%,description.ilike.%${t}%`);
        return qb;
      });
      if (!rows.length) return empty;
      const [people, reps] = await Promise.all([
        profileMap(rows.map((r) => r.client_id)),
        soft<{ target_id: string }[]>(looseDb.from("work_reports").select("target_id").eq("target_type", "job").in("target_id", rows.map((r) => r.id)).in("status", ["open", "reviewing"])),
      ]);
      const reports: Record<string, number> = {};
      for (const r of reps ?? []) reports[r.target_id] = (reports[r.target_id] ?? 0) + 1;
      return { rows, people, reports };
    },
  });
  const rows = q.data?.rows ?? [];
  const people: People = q.data?.people ?? {};
  const reports = q.data?.reports ?? {};
  const avgApplicants = rows.length ? Math.round((rows.reduce((n, r) => n + Number(r.applications_count ?? 0), 0) / rows.length) * 10) / 10 : 0;
  const avgBudget = average(rows.filter((r) => Number(r.budget_max) > 0).map((r) => Number(r.budget_max)));

  function invalidate() {
    for (const key of ["work-admin-jobs", "work-admin-job-stats", "work-admin-job-detail", "work-admin-stats", "work-admin-audit", "work-admin-job-history"]) qc.invalidateQueries({ queryKey: [key] });
    void refreshAll();
  }
  async function moderate(id: string, status: "approved" | "rejected", note = "") {
    await workRpc("work_admin_moderate_job", { _job_id: id, _status: status, _note: note });
    toast.success(status === "approved" ? "Lowongan disetujui" : "Lowongan ditolak");
    invalidate();
  }
  const approve = (id: string) => moderate(id, "approved").catch((e) => toast.error(errMsg(e)));
  const reject = (j: JobRow) => setAsk({
    title: "Tolak lowongan",
    description: `"${j.title}" tidak akan tayang. Alasanmu dilihat oleh pemilik lowongan dan tercatat di audit log.`,
    label: "Alasan penolakan (dilihat pemilik)", min: 3, confirm: "Tolak",
    onSubmit: async (t) => { await moderate(j.id, "rejected", t); },
  });

  return (
    <div className="space-y-4">
      <div>
        <GroupTitle>Moderasi</GroupTitle>
        <StatGrid>
          <Stat label="Menunggu moderasi" value={fmtCount(s?.pending)} hint="Belum tayang sebelum disetujui" />
          <Stat label="Disetujui" value={fmtCount(s?.approved)} hint="Sudah tayang" />
          <Stat label="Ditolak" value={fmtCount(s?.rejected)} hint="Tidak tayang" />
          <Stat label="Dilaporkan" value={fmtCount(s?.reported)} hint="Lowongan dengan laporan terbuka" />
        </StatGrid>
      </div>
      <div>
        <GroupTitle>Status lowongan</GroupTitle>
        <StatGrid>
          <Stat label="Total lowongan" value={fmtCount(s?.total)} />
          <Stat label="Dibuka" value={fmtCount(s?.open)} hint="Menerima lamaran" />
          <Stat label="Sedang dikerjakan" value={fmtCount(s?.inProgress)} />
          <Stat label="Ditutup" value={fmtCount(s?.closed)} />
        </StatGrid>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={term} onChange={(v) => { setTerm(v); setLimit(PAGE); }} label="Cari lowongan" placeholder="Cari judul, kategori, atau deskripsi…" />
        <FilterSelect value={modFilter} onChange={(v) => { setModFilter(v); setLimit(PAGE); }} label="Filter moderasi" options={MOD_FILTERS} className="w-56" />
        <FilterSelect value={jobStatus} onChange={(v) => { setJobStatus(v); setLimit(PAGE); }} label="Status lowongan" options={STATUS_FILTERS} className="w-48" />
        <FilterSelect value={sort} onChange={(v) => { setSort(v); setLimit(PAGE); }} label="Urutkan lowongan" options={SORTS} className="w-48" />
      </div>
      <p className="text-xs text-muted-foreground">
        Menampilkan {rows.length} lowongan{rows.length >= limit ? " (masih ada yang lebih lama)" : ""}{rows.length > 0 ? ` · rata-rata ${avgApplicants} pelamar per lowongan · rata-rata anggaran maksimum ${rp(avgBudget)}` : ""}.
      </p>

      <Loading q={q} />
      {q.data && rows.length === 0 && <EmptyState>{term.trim() ? "Tidak ada lowongan yang cocok dengan pencarian." : "Tidak ada lowongan pada filter ini."}</EmptyState>}

      <ul className="space-y-3">
        {rows.map((j) => {
          const mod = modKey(j.moderation_status);
          const owner = people[j.client_id];
          const reps = reports[j.id] ?? 0;
          return (
            <li key={j.id}>
              <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/lowongan/$id" params={{ id: j.id }} className="break-words font-bold hover:text-primary">{j.title}</Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {jobCategoryLabel(j.category)} · {owner ? <Link to="/$username" params={{ username: owner.username }} className="hover:text-primary">{handle(owner)}</Link> : "pemilik tidak diketahui"} · {timeAgo(j.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {reps > 0 && <Pill tone="bad">{reps} laporan terbuka</Pill>}
                    <Pill>{JOB_STATUS[j.status] ?? j.status}</Pill>
                    <Pill tone={modTone(mod)}>{MOD_LABEL[mod] ?? mod}</Pill>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Fact label="Anggaran">{budgetLabel(Number(j.budget_min ?? 0), Number(j.budget_max ?? 0))}</Fact>
                  <Fact label="Pelamar" sub={j.positions ? <span className="text-xs text-muted-foreground">{j.positions} posisi dibuka</span> : undefined}>{fmtCount(j.applications_count ?? 0)}</Fact>
                  <Fact label="Batas selesai">{j.deadline ? fmtDate(j.deadline) : "Fleksibel"}</Fact>
                  <Fact label="Sistem & jenis" sub={<span className="text-xs text-muted-foreground">{[workModeLabel(j.work_mode), j.location, experienceLabel(j.experience_level)].filter(Boolean).join(" · ") || undefined}</span>}>{[paymentTypeLabel(j.payment_type), jobTypeLabel(j.job_type)].filter(Boolean).join(" · ") || "—"}</Fact>
                </div>

                {j.skills?.length ? <div className="mt-3 flex flex-wrap gap-1">{j.skills.slice(0, 8).map((k) => <span key={k} className="rounded bg-navy/10 px-1.5 py-0.5 font-mono text-[11px] text-navy">{k}</span>)}</div> : null}
                {j.description && <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{j.description}</p>}
                {j.moderation_note && <p className="mt-2 rounded-lg bg-muted p-2 text-xs"><b>Catatan moderasi:</b> {j.moderation_note}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDetail(j)}>Detail & riwayat</Button>
                  {mod !== "approved" && <Button size="sm" className="rounded-full" onClick={() => void approve(j.id)}>Setujui</Button>}
                  {mod !== "rejected" && <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => reject(j)}>Tolak</Button>}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {rows.length >= limit && <MoreButton busy={q.isFetching} onClick={() => setLimit((n) => n + PAGE)}>Muat lebih banyak</MoreButton>}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail lowongan</DialogTitle>
            <DialogDescription>Tinjau isi, aturan kerja, pelamar, laporan, dan riwayat moderasi sebelum memutuskan.</DialogDescription>
          </DialogHeader>
          {detail && (
            <JobDetailBody
              job={detail}
              owner={people[detail.client_id]}
              onApprove={() => { const id = detail.id; setDetail(null); void approve(id); }}
              onReject={() => { const j = detail; setDetail(null); reject(j); }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

function JobDetailBody({ job: j, owner, onApprove, onReject }: { job: JobRow; owner: People[string] | undefined; onApprove: () => void; onReject: () => void }) {
  const terms = useJobTerms(j.id);
  const q = useQuery({
    queryKey: ["work-admin-job-detail", j.id],
    queryFn: async () => {
      const head = () => looseDb.from("job_applications").select("id", { count: "exact", head: true }).eq("job_id", j.id);
      const [pending, accepted, rejected, withdrawn, apps, reports, history, ownerJobs] = await Promise.all([
        countOf(head().eq("status", "pending")),
        countOf(head().eq("status", "accepted")),
        countOf(head().eq("status", "rejected")),
        countOf(head().eq("status", "withdrawn")),
        soft<AppLite[]>(looseDb.from("job_applications").select("id,developer_id,status,bid_amount,created_at").eq("job_id", j.id).order("created_at", { ascending: false }).limit(10)),
        soft<ReportLite[]>(looseDb.from("work_reports").select("*").eq("target_type", "job").eq("target_id", j.id).order("created_at", { ascending: false }).limit(20)),
        soft<Hist[]>(looseDb.from("admin_audit_log").select("id,admin_label,action,note,created_at").eq("target_type", "job").eq("target_id", j.id).order("id", { ascending: false }).limit(30)),
        countOf(looseDb.from("jobs").select("id", { count: "exact", head: true }).eq("client_id", j.client_id)),
      ]);
      const people = await profileMap((apps ?? []).map((a) => a.developer_id));
      return { counts: { pending, accepted, rejected, withdrawn }, apps: apps ?? [], people, reports: reports ?? [], history: history ?? [], ownerJobs };
    },
  });
  const mod = modKey(j.moderation_status);
  const t = terms.data;

  return (
    <div className="space-y-4 text-sm">
      <Block title="Ringkasan">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link to="/lowongan/$id" params={{ id: j.id }} className="break-words text-base font-bold hover:text-primary">{j.title}</Link>
          <span className="flex flex-wrap gap-1.5"><Pill>{JOB_STATUS[j.status] ?? j.status}</Pill><Pill tone={modTone(mod)}>{MOD_LABEL[mod] ?? mod}</Pill></span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="Kategori">{jobCategoryLabel(j.category)}</Info>
          <Info label="Dibuat">{fmtDateTime(j.created_at)} ({timeAgo(j.created_at)})</Info>
          <Info label="Anggaran">{budgetLabel(Number(j.budget_min ?? 0), Number(j.budget_max ?? 0))}</Info>
          <Info label="Batas selesai">{j.deadline ? fmtDate(j.deadline) : "Fleksibel"}</Info>
          <Info label="Sistem pembayaran">{paymentTypeLabel(j.payment_type) || "—"}</Info>
          <Info label="Jenis pekerjaan">{jobTypeLabel(j.job_type) || "—"}</Info>
          <Info label="Metode kerja">{[workModeLabel(j.work_mode), j.location].filter(Boolean).join(" · ") || "—"}</Info>
          <Info label="Tingkat pengalaman">{experienceLabel(j.experience_level) || "—"}</Info>
          <Info label="Jumlah posisi">{j.positions ?? "—"}</Info>
          <Info label="Total pelamar">{fmtCount(j.applications_count ?? 0)}</Info>
        </dl>
        {j.skills?.length ? <div className="flex flex-wrap gap-1">{j.skills.map((k) => <span key={k} className="rounded bg-navy/10 px-1.5 py-0.5 font-mono text-[11px] text-navy">{k}</span>)}</div> : null}
        {j.moderation_note && <p className="rounded-lg bg-muted p-2 text-xs"><b>Catatan moderasi:</b> {j.moderation_note}</p>}
      </Block>

      <Block title="Pemilik lowongan">
        <div className="flex items-center gap-3">
          <AvatarMini name={owner?.username ?? "?"} url={owner?.avatar_url ?? null} size={40} />
          <div className="min-w-0">
            {owner ? <Link to="/$username" params={{ username: owner.username }} className="block truncate font-bold hover:text-primary">{nameOf(owner)} <span className="text-xs font-normal text-muted-foreground">{handle(owner)}</span></Link> : <p className="font-bold">Profil tidak ditemukan</p>}
            <p className="text-xs text-muted-foreground">{q.isLoading ? "Memuat…" : `${fmtCount(q.data?.ownerJobs)} lowongan di platform`}</p>
          </div>
        </div>
      </Block>

      <Block title="Deskripsi proyek">
        {j.description ? <Markdown>{j.description}</Markdown> : <p className="text-xs text-muted-foreground">Tidak ada deskripsi.</p>}
        {j.requirements && <div><p className="mb-1 text-xs font-semibold text-muted-foreground">Persyaratan tambahan</p><p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-3">{j.requirements}</p></div>}
      </Block>

      <Block title="Aturan kerja">
        {terms.isLoading ? <p className="text-xs text-muted-foreground">Memuat…</p> : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label="Batas revisi">{t?.paymentType === "hourly" ? "Tidak berlaku (per jam)" : t?.revisionLimit ? `${t.revisionLimit} kali` : "Tanpa batas"}</Info>
            <Info label="Tanggal selesai dari client">{t?.deadline ? fmtDate(t.deadline) : "Fleksibel"}</Info>
            <Info label="Hak penggunaan hasil">{t?.usageRights || "Tidak ditulis"}</Info>
            <Info label="Ketentuan pembatalan">{t?.cancellationTerms || "Tidak ditulis"}</Info>
          </dl>
        )}
      </Block>

      <Block title="Pelamar">
        <Loading q={q} />
        {q.data && (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="warn">{fmtCount(q.data.counts.pending)} menunggu</Pill>
              <Pill tone="ok">{fmtCount(q.data.counts.accepted)} diterima</Pill>
              <Pill tone="bad">{fmtCount(q.data.counts.rejected)} ditolak</Pill>
              <Pill>{fmtCount(q.data.counts.withdrawn)} ditarik</Pill>
            </div>
            {q.data.apps.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada pelamar.</p> : (
              <ul className="space-y-1">
                {q.data.apps.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
                    <span>{handle(q.data!.people[a.developer_id])} · {a.bid_amount ? rp(a.bid_amount) : "Nego"} · {timeAgo(a.created_at)}</span>
                    <Pill tone={APP_TONE[a.status] ?? "neutral"}>{APP_STATUS[a.status] ?? a.status}</Pill>
                  </li>
                ))}
              </ul>
            )}
            {(j.applications_count ?? 0) > q.data.apps.length && <p className="text-xs text-muted-foreground">Menampilkan 10 pelamar terbaru. Daftar lengkap ada di tab Lamaran.</p>}
          </>
        )}
      </Block>

      <Block title="Laporan terhadap lowongan">
        {q.data && q.data.reports.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada laporan.</p>}
        <ul className="space-y-1.5">
          {q.data?.reports.map((r, i) => (
            <li key={String(r.id ?? i)} className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <p><b>{typeof r.reason === "string" ? reportReasonLabel(r.reason) : "Laporan"}</b> · {String(r.status ?? "")} · {typeof r.created_at === "string" ? timeAgo(r.created_at) : ""}</p>
              {typeof r.detail === "string" && r.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{r.detail}</p>}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Riwayat moderasi">
        {q.data && q.data.history.length === 0 && <p className="text-xs text-muted-foreground">Belum ada keputusan moderasi untuk lowongan ini. Perubahan isi oleh pemiliknya tidak dicatat oleh sistem.</p>}
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {q.data?.history.map((h) => (
            <li key={h.id} className="rounded-md bg-muted p-2">
              <p className="font-mono text-xs">{h.action}</p>
              <p className="text-xs text-muted-foreground">{h.admin_label ? `@${h.admin_label}` : "admin"} · {timeAgo(h.created_at)}</p>
              {h.note && <p className="mt-0.5 text-xs">{h.note}</p>}
            </li>
          ))}
        </ul>
      </Block>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {mod !== "approved" && <Button className="rounded-full" onClick={onApprove}>Setujui</Button>}
        {mod !== "rejected" && <Button variant="outline" className="rounded-full text-destructive" onClick={onReject}>Tolak</Button>}
      </div>
    </div>
  );
}
