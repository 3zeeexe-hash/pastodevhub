import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Building2, CalendarClock, Users, Wallet } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import {
  APPLICATION_STATUS_LABEL, JOB_STATUS_LABEL, budgetLabel, jobCategoryLabel, jobTypeLabel, workModeLabel,
  type ApplicationStatus, type JobCardData, type JobStatus,
} from "@/lib/jobs";
import { AvatarMini } from "@/components/avatar-mini";
import jobImage from "@/assets/lowongan-job.jpg";
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

/**
 * Kartu lowongan (dipakai di semua daftar lowongan). Gaya sama dengan kartu "Lowongan Freelance" di beranda:
 * gambar ikon lowongan di kiri (80px di mobile, 96px mulai sm), kategori, judul, client, dan anggaran di sebelahnya,
 * lalu info tambahan (jenis kerja, deskripsi, skill) selebar kartu, dan baris bawah berisi pelamar + tombol detail.
 */
export function JobCard({ j, compact = false }: { j: JobCardData; compact?: boolean }) {
  // Kolom GOBI WORK bersifat opsional: kartu lama (tanpa kolom itu) tampil seperti sebelumnya.
  const meta = [j.job_type ? jobTypeLabel(j.job_type) : "", j.work_mode ? workModeLabel(j.work_mode) : "", j.location ?? ""].filter(Boolean);
  const clientName = j.client?.display_name || j.client?.username || "Client";
  return (
    <Link
      to="/lowongan/$id"
      params={{ id: j.id }}
      className="group flex h-full flex-col rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <img
          src={jobImage}
          alt=""
          width={96}
          height={96}
          loading="lazy"
          draggable={false}
          className="size-20 shrink-0 select-none rounded-xl bg-navy object-cover sm:size-24"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-orange-ink">{jobCategoryLabel(j.category)}</span>
            <JobStatusBadge status={j.status} />
          </div>
          <h3 className="mt-0.5 line-clamp-2 break-words text-base font-extrabold leading-snug group-hover:text-primary">{j.title}</h3>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4 shrink-0" />
            <span className="truncate">{clientName}</span>
            {j.client?.is_verified && <BadgeCheck className="size-4 shrink-0 text-link" aria-label="Terverifikasi" />}
          </p>
          <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm font-semibold text-foreground/80">
            <Wallet className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{budgetLabel(j.budget_min, j.budget_max)}{j.payment_type === "hourly" ? " /jam" : ""}</span>
          </p>
        </div>
      </div>

      {meta.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {meta.map((m) => <span key={m} className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-link">{m}</span>)}
        </div>
      )}
      {!compact && j.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{j.description}</p>}
      {j.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {j.skills.slice(0, compact ? 3 : 5).map((s) => <span key={s} className="rounded-md bg-navy/10 px-2 py-0.5 font-mono text-xs text-navy">{s}</span>)}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="size-3.5" />{j.applications_count} pelamar</span>
          {j.deadline && <span className="flex items-center gap-1"><CalendarClock className="size-3.5" />{new Date(j.deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>}
          <span className="flex items-center gap-1.5">
            {j.client && <AvatarMini name={j.client.username} url={j.client.avatar_url} size={16} />}
            {timeAgo(j.created_at)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-4 py-1.5 text-sm font-bold text-orange-ink transition group-hover:bg-primary/25">
          Lihat Detail <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
