import { Link } from "@tanstack/react-router";
import { CalendarClock, Users } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { categoryLabel } from "@/lib/market";
import { APPLICATION_STATUS_LABEL, JOB_STATUS_LABEL, budgetLabel, type ApplicationStatus, type JobCardData, type JobStatus } from "@/lib/jobs";
import { AvatarMini } from "@/components/avatar-mini";
import { cn } from "@/lib/utils";

const JOB_TONE: Record<JobStatus, string> = {
  open: "bg-success text-success-foreground",
  in_progress: "bg-link text-background",
  closed: "bg-muted text-muted-foreground",
};
const APP_TONE: Record<ApplicationStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  accepted: "bg-success text-success-foreground",
  rejected: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", JOB_TONE[status])}>{JOB_STATUS_LABEL[status]}</span>;
}
export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={cn("inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", APP_TONE[status])}>{APPLICATION_STATUS_LABEL[status]}</span>;
}

export function JobCard({ j, compact = false }: { j: JobCardData; compact?: boolean }) {
  return (
    <Link to="/lowongan/$id" params={{ id: j.id }} className="group block rounded-xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{categoryLabel(j.category)}</p>
          <h3 className="mt-1 line-clamp-2 font-semibold leading-snug group-hover:text-primary">{j.title}</h3>
        </div>
        <JobStatusBadge status={j.status} />
      </div>
      {!compact && j.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{j.description}</p>}
      {j.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {j.skills.slice(0, compact ? 3 : 6).map((s) => <span key={s} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground">{s}</span>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{budgetLabel(j.budget_min, j.budget_max)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Users className="size-3.5" />{j.applications_count} pelamar</span>
          {j.deadline && <span className="hidden items-center gap-1 sm:flex"><CalendarClock className="size-3.5" />{new Date(j.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>}
        </span>
      </div>
      {j.client && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AvatarMini name={j.client.username} url={j.client.avatar_url} size={16} />
          {j.client.display_name || j.client.username} · {timeAgo(j.created_at)}
        </p>
      )}
    </Link>
  );
}
