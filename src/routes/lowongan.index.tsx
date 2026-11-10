import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Briefcase, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/market";
import { JOB_SELECT, canPostJob, type JobCardData, type JobStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobCard } from "@/components/job-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lowongan/")({
  head: () => ({
    meta: [
      { title: "Lowongan freelance — Pastodev" },
      { name: "description", content: "Proyek freelance dari client: website, aplikasi, desain, dan lainnya. Developer bisa langsung melamar." },
      { property: "og:title", content: "Lowongan freelance — Pastodev" },
      { property: "og:description", content: "Temukan proyek freelance dan lamar langsung ke client di Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { user, profile } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("open");
  const term = q.trim().replace(/[%,()_]/g, " ").trim();
  const { data, isLoading } = useQuery({
    queryKey: ["jobs", "list", term, cat, status],
    queryFn: async () => {
      let qb = supabase.from("jobs").select(JOB_SELECT).order("created_at", { ascending: false }).limit(60);
      if (term) qb = qb.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      if (cat) qb = qb.eq("category", cat);
      if (status !== "all") qb = qb.eq("status", status);
      return ((await qb).data ?? []) as unknown as JobCardData[];
    },
  });
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  return (
    <main>
      <section className="bg-hero border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-10">
          <div>
            <p className="flex items-center gap-2 font-mono text-sm text-primary"><Briefcase className="size-4" /> freelance</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Lowongan proyek</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">Client memasang kebutuhan, developer melamar dengan penawaran harga dan waktu kerja.</p>
          </div>
          {canPostJob(viewer) ? (
            <Button asChild size="lg" className="shadow-glow"><Link to="/lowongan/baru"><Plus /> Pasang lowongan</Link></Button>
          ) : !user ? (
            <Button asChild size="lg" variant="outline"><Link to="/auth">Masuk untuk pasang lowongan</Link></Button>
          ) : null}
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari lowongan…" className="pl-8" />
          </div>
          {([["open", "Dibuka"], ["in_progress", "Berjalan"], ["all", "Semua"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={status === k ? "default" : "outline"} onClick={() => setStatus(k)}>{l}</Button>
          ))}
          <select aria-label="Kategori" value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Semua kategori</option>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className={cn("mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3", isLoading && "opacity-60")}>
          {(data ?? []).map((j) => <JobCard key={j.id} j={j} />)}
        </div>
        {!isLoading && data?.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <Briefcase className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Belum ada lowongan yang cocok.</p>
          </div>
        )}
      </div>
    </main>
  );
}
