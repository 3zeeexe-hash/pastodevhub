import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Briefcase, Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  EMPTY_FILTERS, EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_TYPES, PAGE_SIZE, SORT_LABEL, WORK_MODES,
  activeFilterCount, canPostJob, type JobFilters, type JobSort, type JobStatus,
} from "@/lib/jobs";
import { fetchJobs } from "@/lib/jobs-query";
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

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const SELECT_CLS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}

function JobsPage() {
  const { user, profile } = useAuth();
  const [f, setF] = useState<JobFilters>(EMPTY_FILTERS);
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState(false);
  const df = useDebounced(f);
  const set = (patch: Partial<JobFilters>) => { setF((p) => ({ ...p, ...patch })); setPages(1); };

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["jobs", "list", df, pages],
    queryFn: () => fetchJobs(df, pages * PAGE_SIZE),
  });
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const nActive = activeFilterCount(f);
  const rows = data?.rows ?? [];

  return (
    <main>
      <section className="bg-hero border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-10">
          <div>
            <p className="flex items-center gap-2 font-mono text-sm text-primary"><Briefcase className="size-4" /> GOBI WORK</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Explore Jobs</h1>
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
            <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Cari judul atau client…" aria-label="Cari lowongan" className="pl-8" />
          </div>
          {([["open", "Dibuka"], ["in_progress", "Berjalan"], ["all", "Semua"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={f.status === k ? "default" : "outline"} onClick={() => set({ status: k as JobStatus | "all" })}>{l}</Button>
          ))}
          <select aria-label="Urutkan" value={f.sort} onChange={(e) => set({ sort: e.target.value as JobSort })} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {(Object.keys(SORT_LABEL) as JobSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <Button size="sm" variant={open || nActive ? "secondary" : "outline"} onClick={() => setOpen(!open)} aria-expanded={open}>
            <SlidersHorizontal /> Filter{nActive > 0 ? ` (${nActive})` : ""}
          </Button>
          {(nActive > 0 || f.q) && (
            <Button size="sm" variant="ghost" onClick={() => { setF({ ...EMPTY_FILTERS, status: f.status, sort: f.sort }); setPages(1); }}><RotateCcw /> Reset</Button>
          )}
        </div>

        {open && (
          <div className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kategori">
              <select value={f.category} onChange={(e) => set({ category: e.target.value })} className={SELECT_CLS}>
                <option value="">Semua kategori</option>
                {JOB_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Jenis pekerjaan">
              <select value={f.jobType} onChange={(e) => set({ jobType: e.target.value })} className={SELECT_CLS}>
                <option value="">Semua jenis</option>
                {JOB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Metode kerja">
              <select value={f.workMode} onChange={(e) => set({ workMode: e.target.value })} className={SELECT_CLS}>
                <option value="">Remote / hybrid / onsite</option>
                {WORK_MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Pengalaman">
              <select value={f.experience} onChange={(e) => set({ experience: e.target.value })} className={SELECT_CLS}>
                <option value="">Semua level</option>
                {EXPERIENCE_LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Lokasi"><Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Kota atau provinsi" /></Field>
            <Field label="Teknologi"><Input value={f.skill} onChange={(e) => set({ skill: e.target.value })} placeholder="React, Laravel, Figma…" /></Field>
            <Field label="Budget minimal (Rp)">
              <Input type="number" min={0} step={100000} inputMode="numeric" value={f.minBudget || ""} onChange={(e) => set({ minBudget: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} placeholder="1000000" />
            </Field>
          </div>
        )}

        {data && !data.extended && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Filter jenis pekerjaan, metode kerja, lokasi, dan pengalaman aktif setelah skema GOBI WORK dijalankan (docs/sql/gobi-work).
          </p>
        )}

        {isError ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <p className="mt-2 text-muted-foreground">Lowongan gagal dimuat.</p>
            <Button className="mt-3" variant="outline" onClick={() => refetch()}>Coba lagi</Button>
          </div>
        ) : isLoading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-card" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
            <Briefcase className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Belum ada lowongan yang cocok.</p>
            {(nActive > 0 || f.q) && <Button className="mt-3" variant="outline" onClick={() => { setF({ ...EMPTY_FILTERS, status: f.status, sort: f.sort }); setPages(1); }}>Hapus filter</Button>}
          </div>
        ) : (
          <>
            <div className={cn("mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3", isFetching && "opacity-60")}>
              {rows.map((j) => <JobCard key={j.id} j={j} />)}
            </div>
            {data?.hasMore && (
              <div className="mt-6 text-center">
                <Button variant="outline" disabled={isFetching} onClick={() => setPages((p) => p + 1)}>Muat lebih banyak</Button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
