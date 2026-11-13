import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah } from "@/lib/market";
import { budgetLabel, type ApplicationStatus, type JobStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge, JobStatusBadge } from "@/components/job-card";
import { GobiLoader } from "@/components/gobi-loader";
import jobImage from "@/assets/lowongan-job.jpg";

export const Route = createFileRoute("/studio/lamaran")({ component: MyApplications });

function MyApplications() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-applications", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("job_applications")
      .select("id,bid_amount,est_days,status,created_at, job:jobs!job_applications_job_id_fkey(id,title,status,budget_min,budget_max)")
      .eq("developer_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-extrabold">Lamaran saya</h1><p className="text-sm text-muted-foreground">Lowongan freelance yang sudah kamu lamar.</p></div>
        <Button asChild className="rounded-full"><Link to="/lowongan"><Briefcase /> Cari lowongan</Link></Button>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {isLoading && <GobiLoader />}
        {data.map((a: any) => (
          <Link key={a.id} to="/lowongan/$id" params={{ id: a.job.id }} className="flex flex-wrap items-center gap-3 p-3 hover:bg-accent/40 sm:p-4">
            <img src={jobImage} alt="" width={56} height={56} loading="lazy" draggable={false} className="size-14 shrink-0 select-none rounded-xl bg-navy object-cover" />
            <div className="min-w-0 flex-1 basis-40">
              <p className="line-clamp-2 break-words font-bold">{a.job.title}</p>
              <p className="text-xs text-muted-foreground">Anggaran {budgetLabel(a.job.budget_min, a.job.budget_max)} · tawaranmu {formatRupiah(a.bid_amount, "Nego")} · {timeAgo(a.created_at)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <JobStatusBadge status={a.job.status as JobStatus} />
              <ApplicationStatusBadge status={a.status as ApplicationStatus} />
            </div>
          </Link>
        ))}
        {!isLoading && data.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Belum ada lamaran. Temukan proyek di halaman Lowongan.</p>}
      </div>
    </div>
  );
}
