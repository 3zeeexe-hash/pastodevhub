import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Briefcase, Plus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo, useAuth } from "@/lib/auth";
import { budgetLabel, canPostJob, type JobStatus } from "@/lib/jobs";
import { MODERATION_LABEL, normalizeModeration } from "@/lib/job-review";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { JobStatusBadge } from "@/components/job-card";
import { AccountSideNav } from "@/components/side-navs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lowongan/saya")({
  head: () => ({
    meta: [
      { title: "Lowongan saya — Pastodev" },
      { name: "description", content: "Semua lowongan yang kamu pasang, status peninjauan, dan jumlah pelamarnya." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyJobsPage,
});

type MyJob = {
  id: string; title: string; status: string; budget_min: number; budget_max: number; applications_count: number; created_at: string;
  moderation_status?: string | null;
};
const COLS = "id,title,status,budget_min,budget_max,applications_count,created_at";

/** Kolom peninjauan ada setelah SQL GOBI WORK; kalau belum ada, pakai kolom lama (semua lowongan dianggap disetujui). */
async function fetchMyJobs(userId: string): Promise<MyJob[]> {
  const withReview = await looseDb.from("jobs").select(`${COLS},moderation_status`).eq("client_id", userId).order("created_at", { ascending: false }).limit(100);
  const res = withReview.error
    ? await supabase.from("jobs").select(COLS).eq("client_id", userId).order("created_at", { ascending: false }).limit(100)
    : withReview;
  return (res.data ?? []) as unknown as MyJob[];
}

type Filter = "all" | "review" | "open" | "running" | "closed";
const FILTERS: [Filter, string][] = [["all", "Semua"], ["review", "Ditinjau"], ["open", "Dibuka"], ["running", "Berjalan"], ["closed", "Ditutup"]];

function matches(j: MyJob, f: Filter) {
  const approved = normalizeModeration(j.moderation_status) === "approved";
  switch (f) {
    case "review": return !approved;
    case "open": return approved && j.status === "open";
    case "running": return approved && j.status === "in_progress";
    case "closed": return approved && j.status !== "open" && j.status !== "in_progress";
    default: return true;
  }
}

function MyJobsPage() {
  const { user, profile, loading } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["my-jobs", user?.id],
    enabled: !!user,
    queryFn: () => fetchMyJobs(user!.id),
  });

  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk sebagai client untuk melihat lowongan kamu." /></main>;
  if (!canPostJob({ id: user.id, accountType: profile?.account_type ?? null })) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Briefcase className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Lowongan saya khusus akun client</h1>
        <p className="mt-2 text-sm text-muted-foreground">Akun developer bisa melamar lowongan. Ganti peran ke Client di Pengaturan untuk memasang dan mengelola lowongan.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild><Link to="/lowongan">Lihat lowongan</Link></Button>
          <Button asChild variant="outline"><Link to="/settings">Pengaturan</Link></Button>
        </div>
      </main>
    );
  }

  const jobs = data ?? [];
  const shown = jobs.filter((j) => matches(j, filter));
  const applicants = jobs.reduce((n, j) => n + j.applications_count, 0);

  return (
    <AccountSideNav>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Lowongan saya</h1>
            <p className="text-sm text-muted-foreground">{jobs.length} lowongan · {applicants} total pelamar</p>
          </div>
          <Button asChild className="shadow-glow"><Link to="/lowongan/baru"><Plus /> Pasang lowongan</Link></Button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn("inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-bold transition active:scale-95", filter === k ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70")}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="rounded-xl border border-border bg-card">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Memuat lowongan…</p>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {jobs.length === 0
                ? <>Belum ada lowongan. <Link to="/lowongan/baru" className="text-link hover:underline">Pasang proyek pertamamu</Link> dan biarkan developer melamar.</>
                : "Tidak ada lowongan di filter ini."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((j) => {
                const mod = normalizeModeration(j.moderation_status);
                return (
                  <li key={j.id}>
                    <Link to="/lowongan/$id" params={{ id: j.id }} className="flex flex-wrap items-center gap-3 p-4 hover:bg-accent/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{j.title}</p>
                        <p className="text-xs text-muted-foreground">{budgetLabel(j.budget_min, j.budget_max)} · {timeAgo(j.created_at)}</p>
                      </div>
                      <span className="flex items-center gap-1 text-sm"><Users className="size-4 text-primary" />{j.applications_count}</span>
                      {mod === "approved"
                        ? <JobStatusBadge status={j.status as JobStatus} />
                        : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${mod === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"}`}>{MODERATION_LABEL[mod]}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AccountSideNav>
  );
}
