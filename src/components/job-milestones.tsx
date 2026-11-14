import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileSignature } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth } from "@/lib/auth";
import { parsePlan, splitByPercent, type PlanMilestone } from "@/lib/job-milestones";
import { personName, rp, type PartyProfile } from "@/lib/work-db";
import type { ContractStatus, MilestoneStatus } from "@/lib/work";
import { MilestoneProgress } from "@/components/milestone-progress";
import { ContractPill } from "@/components/work-ui";

type PlanRow = { use_milestones: boolean | null; milestone_plan: unknown; payment_type: string | null; budget_min: number | null; budget_max: number | null };
type ContractProgress = {
  id: string; title: string; status: ContractStatus; freelancer: PartyProfile;
  milestones: { id: string; title: string; amount: number; status: MilestoneStatus; position: number }[] | null;
};

/** Rencana milestone dari lowongan (SQL 010). null jika lowongan tidak memakai milestone atau SQL 010 belum dijalankan. */
function useJobPlan(jobId: string) {
  return useQuery({
    queryKey: ["job-milestone-plan", jobId],
    queryFn: async () => {
      const { data, error } = await looseDb.from("jobs").select("use_milestones,milestone_plan,payment_type,budget_min,budget_max").eq("id", jobId).maybeSingle();
      if (error || !data) return null;
      const r = data as PlanRow;
      const plan = parsePlan(r.milestone_plan);
      if (!r.use_milestones || r.payment_type === "hourly" || plan.length === 0) return null;
      return { plan, min: Number(r.budget_min ?? 0), max: Number(r.budget_max ?? 0) };
    },
  });
}

/** Kontrak dari lowongan ini yang boleh dilihat pengguna (pemilik: semua; freelancer: miliknya) beserta milestone-nya. Kosong jika SQL belum ada. */
function useContractProgress(jobId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ["job-contract-progress", jobId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await looseDb
        .from("work_contracts")
        .select("id,title,status,freelancer:profiles!work_contracts_freelancer_id_fkey(username,display_name,avatar_url), milestones:contract_milestones(id,title,amount,status,position)")
        .eq("job_id", jobId)
        .order("created_at");
      if (error) return [] as ContractProgress[];
      return ((data ?? []) as unknown as ContractProgress[]).filter((c) => c.status !== "cancelled");
    },
  });
}

function PlanList({ plan, min, max }: { plan: PlanMilestone[]; min: number; max: number }) {
  const percents = plan.map((p) => p.percent);
  // Perkiraan dari anggaran client; nilai pasti mengikuti penawaran freelancer yang diterima.
  const lo = min > 0 ? splitByPercent(min, percents) : null;
  const hi = max > 0 ? splitByPercent(max, percents) : null;
  return (
    <ol className="space-y-2">
      {plan.map((p, i) => {
        const est = lo && hi ? (lo[i] === hi[i] ? rp(hi[i]) : `${rp(lo[i])} – ${rp(hi[i])}`) : null;
        return (
          <li key={i} className="flex items-start gap-3 rounded-xl bg-secondary/60 p-3 text-sm">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="break-words font-semibold">{p.title}</p>
              {p.description && <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{p.description}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold text-primary">{p.percent}%</p>
              {est && <p className="text-xs text-muted-foreground">≈ {est}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Di halaman lowongan: rencana milestone yang ditulis client (jika diaktifkan) dan progres milestone tiap kontrak
 * dari lowongan ini. Lowongan per jam tidak punya rencana; milestone-nya baru ada setelah kontrak dibuat.
 */
export function JobMilestones({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const plan = useJobPlan(jobId);
  const contracts = useContractProgress(jobId, user?.id);
  const withMilestones = (contracts.data ?? []).filter((c) => (c.milestones?.length ?? 0) > 0);
  if (!plan.data && withMilestones.length === 0) return null;
  return (
    <>
      {plan.data && (
        <section aria-labelledby="jm-plan" className="rounded-xl border border-border bg-card p-5">
          <h2 id="jm-plan" className="mb-1 font-semibold">Milestone pekerjaan</h2>
          <p className="mb-3 text-xs text-muted-foreground">Pekerjaan dibagi per tahap. Tiap tahap dibayar lewat escrow dan disetujui client sendiri-sendiri. Bobot dihitung dari harga yang disepakati.</p>
          <PlanList plan={plan.data.plan} min={plan.data.min} max={plan.data.max} />
        </section>
      )}
      {withMilestones.length > 0 && (
        <section aria-labelledby="jm-progress" className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h2 id="jm-progress" className="font-semibold">Progres milestone</h2>
          {withMilestones.map((c) => (
            <div key={c.id} className="space-y-2 rounded-xl bg-secondary/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold">{personName(c.freelancer)}</p>
                <div className="flex items-center gap-2">
                  <ContractPill status={c.status} />
                  <Link to="/kerja/kontrak/$id" params={{ id: c.id }} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><FileSignature className="size-3.5" /> Buka kontrak</Link>
                </div>
              </div>
              <MilestoneProgress bare milestones={[...(c.milestones ?? [])].sort((a, b) => a.position - b.position)} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
