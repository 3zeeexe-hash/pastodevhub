import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { fmtDate, rp } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Pill } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/lamaran")({ component: Applications });

type AppRow = {
  id: string; status: string; bid_amount: number; est_days: number; created_at: string; work_stage?: string | null;
  job: { id: string; title: string } | null;
};
type MyJob = { id: string; title: string; status: string; moderation_status: string | null; applications_count: number; deadline: string | null; created_at: string };

const STAGE: Record<string, string> = { viewed: "Dilihat client", shortlisted: "Shortlist", interview: "Interview" };
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", accepted: "Diterima", rejected: "Ditolak", withdrawn: "Ditarik" };
const STATUS_TONE: Record<string, "neutral" | "ok" | "bad" | "warn"> = { pending: "warn", accepted: "ok", rejected: "bad", withdrawn: "neutral" };

function Applications() {
  const { user } = useAuth();
  const uid = user!.id;

  const apps = useQuery({
    queryKey: ["work-my-apps", uid],
    queryFn: async () => {
      // work_stage ada setelah SQL 002; jika belum dijalankan, ambil tanpa kolom itu.
      let res = await looseDb.from("job_applications").select("id,status,bid_amount,est_days,created_at,work_stage,job:jobs(id,title)").eq("developer_id", uid).order("created_at", { ascending: false });
      if (res.error) res = await looseDb.from("job_applications").select("id,status,bid_amount,est_days,created_at,job:jobs(id,title)").eq("developer_id", uid).order("created_at", { ascending: false });
      if (res.error) throw new Error(errMsg(res.error));
      const rows = (res.data ?? []) as unknown as AppRow[];
      const ids = rows.filter((r) => r.status === "accepted").map((r) => r.id);
      const contracts: Record<string, string> = {};
      if (ids.length) {
        const c = await looseDb.from("work_contracts").select("id,application_id").in("application_id", ids);
        for (const r of (c.data ?? []) as { id: string; application_id: string }[]) contracts[r.application_id] = r.id;
      }
      return { rows, contracts };
    },
  });

  const jobs = useQuery({
    queryKey: ["work-my-jobs", uid],
    queryFn: async () => {
      let res = await looseDb.from("jobs").select("id,title,status,moderation_status,applications_count,deadline,created_at").eq("client_id", uid).order("created_at", { ascending: false });
      if (res.error) res = await looseDb.from("jobs").select("id,title,status,applications_count,deadline,created_at").eq("client_id", uid).order("created_at", { ascending: false });
      if (res.error) throw new Error(errMsg(res.error));
      return (res.data ?? []) as MyJob[];
    },
  });

  return (
    <div className="space-y-10">
      <section aria-labelledby="sent">
        <h1 id="sent" className="mb-3 text-2xl font-bold">Lamaran saya</h1>
        {apps.isLoading && <Skeleton className="h-28 rounded-xl" />}
        {apps.error && <ErrorState error={apps.error} onRetry={() => apps.refetch()} />}
        {apps.data?.rows.length === 0 && <EmptyState>Kamu belum melamar lowongan. <Link to="/lowongan" className="text-primary underline">Cari lowongan</Link></EmptyState>}
        <ul className="space-y-3">
          {apps.data?.rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {a.job ? <Link to="/lowongan/$id" params={{ id: a.job.id }} className="font-semibold hover:text-primary">{a.job.title}</Link> : <span className="font-semibold">Lowongan dihapus</span>}
                <div className="flex gap-1.5">
                  {a.work_stage && a.status === "pending" && <Pill tone="info">{STAGE[a.work_stage] ?? a.work_stage}</Pill>}
                  <Pill tone={STATUS_TONE[a.status] ?? "neutral"}>{STATUS_LABEL[a.status] ?? a.status}</Pill>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Penawaran {rp(a.bid_amount)} · {a.est_days} hari · {timeAgo(a.created_at)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {apps.data?.contracts[a.id] && <Button asChild size="sm"><Link to="/kerja/kontrak/$id" params={{ id: apps.data.contracts[a.id] }}><FileSignature /> Buka kontrak</Link></Button>}
                {a.status !== "withdrawn" && <Button asChild size="sm" variant="outline"><Link to="/kerja/pesan" search={{ application: a.id }}>Obrolan</Link></Button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-xl font-bold">Lowongan saya (client)</h2>
        {jobs.isLoading && <Skeleton className="h-28 rounded-xl" />}
        {jobs.error && <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />}
        {jobs.data?.length === 0 && <EmptyState>Kamu belum memasang lowongan. <Link to="/lowongan/baru" className="text-primary underline">Buat lowongan</Link></EmptyState>}
        <ul className="space-y-3">
          {jobs.data?.map((j) => (
            <li key={j.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to="/lowongan/$id" params={{ id: j.id }} className="font-semibold hover:text-primary">{j.title}</Link>
                <div className="flex gap-1.5">
                  <Pill tone={j.status === "open" ? "ok" : "neutral"}>{j.status === "open" ? "Dibuka" : "Ditutup"}</Pill>
                  {j.moderation_status && j.moderation_status !== "approved" && <Pill tone={j.moderation_status === "rejected" ? "bad" : "warn"}>{j.moderation_status === "rejected" ? "Ditolak admin" : "Menunggu moderasi"}</Pill>}
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{j.applications_count} pelamar · tenggat {fmtDate(j.deadline)} · {timeAgo(j.created_at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
