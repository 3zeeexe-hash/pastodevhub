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

// Lebar konten yang sama dengan beranda supaya tepi kiri/kanan sejajar.
const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6 xl:max-w-7xl";
const SELECT_CLS = "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm";
const PILL = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}

/**
 * Halaman /lowongan, tema sama dengan beranda GOBI: header biru tua melengkung dengan kilau oranye,
 * kartu pencarian putih yang menimpa header, lalu kartu lowongan (gambar ikon + teks) dalam grid responsif.
 * Mobile: satu kolom, pil status bisa digeser ke samping. md: 2 kolom. xl: 3 kolom.
 */
function JobsPage() {
  const { user, profile } = useAuth();
  const [f, setF] = useState<JobFilters>(EMPTY_FILTERS);
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState(false);
  const df = useDebounced(f);
  const set = (patch: Partial<JobFilters>) => { setF((p) => ({ ...p, ...patch })); setPages(1); };
  const reset = () => { setF({ ...EMPTY_FILTERS, status: f.status, sort: f.sort }); setPages(1); };

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["jobs", "list", df, pages],
    queryFn: () => fetchJobs(df, pages * PAGE_SIZE),
  });
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const nActive = activeFilterCount(f);
  const rows = data?.rows ?? [];

  return (
    <main className="min-h-screen bg-background pb-10 text-foreground">
      <section className="relative overflow-hidden rounded-b-[2rem] bg-header-gradient pb-20 pt-8 text-white sm:pt-10 sm:pb-24">
        <div className="pointer-events-none absolute -left-16 bottom-0 size-48 rounded-full bg-primary/30 blur-2xl" />
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className={cn("relative flex flex-wrap items-end justify-between gap-4", WRAP)}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-sm font-semibold text-primary"><Briefcase className="size-4" /> GOBI WORK</p>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Lowongan Freelance</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80 sm:text-base">Client memasang kebutuhan, developer melamar dengan penawaran harga dan waktu kerja.</p>
          </div>
          {canPostJob(viewer) ? (
            <Link to="/lowongan/baru" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110 sm:w-auto">
              <Plus className="size-4" /> Pasang lowongan
            </Link>
          ) : !user ? (
            <Link to="/auth" className="inline-flex h-11 w-full items-center justify-center rounded-full bg-white/15 px-6 text-sm font-bold text-white ring-1 ring-white/30 transition hover:bg-white/25 sm:w-auto">
              Masuk untuk pasang lowongan
            </Link>
          ) : null}
        </div>
      </section>

      <div className={cn("relative z-10 -mt-12", WRAP)}>
        {/* Kartu pencarian + filter, menimpa header seperti kotak pencarian di beranda. */}
        <div className="rounded-3xl bg-card p-3 shadow-lg ring-1 ring-border sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Cari judul atau client…" aria-label="Cari lowongan" className="h-11 rounded-full pl-11" />
            </div>
            <div className="flex items-center gap-2">
              <select aria-label="Urutkan" value={f.sort} onChange={(e) => set({ sort: e.target.value as JobSort })} className="h-10 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm font-semibold md:flex-none">
                {(Object.keys(SORT_LABEL) as JobSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn(PILL, open || nActive ? "bg-navy text-white" : "bg-secondary text-foreground")}>
                <SlidersHorizontal className="size-4" /> Filter{nActive > 0 ? ` (${nActive})` : ""}
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([["open", "Dibuka"], ["in_progress", "Berjalan"], ["all", "Semua"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={f.status === k}
                onClick={() => set({ status: k as JobStatus | "all" })}
                className={cn(PILL, f.status === k ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70")}
              >
                {l}
              </button>
            ))}
            {(nActive > 0 || f.q) && (
              <button type="button" onClick={reset} className={cn(PILL, "text-muted-foreground hover:text-foreground")}><RotateCcw className="size-4" /> Reset</button>
            )}
          </div>

          {open && (
            <div className="mt-3 grid gap-3 rounded-2xl bg-secondary/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Field label="Lokasi"><Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder="Kota atau provinsi" className="h-10 rounded-xl" /></Field>
              <Field label="Teknologi"><Input value={f.skill} onChange={(e) => set({ skill: e.target.value })} placeholder="React, Laravel, Figma…" className="h-10 rounded-xl" /></Field>
              <Field label="Budget minimal (Rp)">
                <Input type="number" min={0} step={100000} inputMode="numeric" value={f.minBudget || ""} onChange={(e) => set({ minBudget: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} placeholder="1000000" className="h-10 rounded-xl" />
              </Field>
            </div>
          )}
        </div>

        {data && !data.extended && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-card p-3 text-xs text-muted-foreground shadow-sm ring-1 ring-border">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Filter jenis pekerjaan, metode kerja, lokasi, dan pengalaman aktif setelah skema GOBI WORK dijalankan (docs/sql/gobi-work).
          </p>
        )}

        <div className="pt-6">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <Briefcase className="size-6 text-link" /> Semua Lowongan
            {!isLoading && !isError && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-link">{rows.length}{data?.hasMore ? "+" : ""}</span>}
          </h2>

          {isError ? (
            <div className="rounded-2xl bg-card p-10 text-center shadow-sm ring-1 ring-border">
              <AlertTriangle className="mx-auto size-8 text-destructive" />
              <p className="mt-2 text-muted-foreground">Lowongan gagal dimuat.</p>
              <Button className="mt-3 rounded-full" variant="outline" onClick={() => refetch()}>Coba lagi</Button>
            </div>
          ) : isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-52 animate-pulse rounded-2xl bg-card ring-1 ring-border" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl bg-card p-10 text-center shadow-sm ring-1 ring-border">
              <Briefcase className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Belum ada lowongan yang cocok.</p>
              {(nActive > 0 || f.q) && <Button className="mt-3 rounded-full" variant="outline" onClick={reset}>Hapus filter</Button>}
            </div>
          ) : (
            <>
              <div className={cn("grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3", isFetching && "opacity-60")}>
                {rows.map((j) => <JobCard key={j.id} j={j} />)}
              </div>
              {data?.hasMore && (
                <div className="mt-6 text-center">
                  <Button variant="outline" className="rounded-full px-8" disabled={isFetching} onClick={() => setPages((p) => p + 1)}>Muat lebih banyak</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
