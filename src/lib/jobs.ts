// Freelance jobs: clients post, developers apply. Rules mirror the database policies.
import { formatRupiah } from "@/lib/market";

export type JobStatus = "open" | "in_progress" | "closed";
export type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  open: "Dibuka",
  in_progress: "Sedang dikerjakan",
  closed: "Ditutup",
};
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Menunggu jawaban",
  accepted: "Diterima",
  rejected: "Tidak dipilih",
  withdrawn: "Ditarik",
};

export const JOB_SELECT =
  "id,title,description,category,skills,budget_min,budget_max,deadline,status,applications_count,created_at,client_id, client:profiles!jobs_client_id_fkey(username,display_name,avatar_url)";

export type JobCardData = {
  id: string; title: string; description: string; category: string; skills: string[];
  budget_min: number; budget_max: number; deadline: string | null; status: JobStatus;
  applications_count: number; created_at: string; client_id: string;
  client: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

/** "Rp1.000.000 – Rp3.000.000", "Mulai Rp500.000", "s/d Rp2.000.000" or "Nego". */
export function budgetLabel(min: number, max: number) {
  if (min > 0 && max > 0) return min === max ? formatRupiah(min) : `${formatRupiah(min)} – ${formatRupiah(max)}`;
  if (min > 0) return `Mulai ${formatRupiah(min)}`;
  if (max > 0) return `s/d ${formatRupiah(max)}`;
  return "Nego";
}

/** Budget input check: both whole rupiah ≥ 0, and max not below min when both are set. */
export function validBudget(min: number, max: number) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 0) return false;
  return !(min > 0 && max > 0 && max < min);
}

type Viewer = { id: string | null; accountType: "client" | "developer" | null };

/** A developer may apply once to an open job that is not their own. */
export function canApply(job: { status: JobStatus; client_id: string }, viewer: Viewer, alreadyApplied: boolean) {
  return !!viewer.id && viewer.accountType === "developer" && job.status === "open" && job.client_id !== viewer.id && !alreadyApplied;
}

/** Only client accounts may post jobs. */
export function canPostJob(viewer: Viewer) {
  return !!viewer.id && viewer.accountType === "client";
}

/** The job owner answers pending applications while the job is still open. */
export function canRespond(job: { status: JobStatus; client_id: string }, app: { status: ApplicationStatus }, viewerId: string | null) {
  return !!viewerId && viewerId === job.client_id && job.status === "open" && app.status === "pending";
}
