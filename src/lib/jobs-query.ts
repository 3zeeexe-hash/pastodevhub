import { looseDb } from "@/lib/escrow-db";
import {
  JOB_SELECT, JOB_SELECT_WORK, categoryFilterValues, sanitizeTerm, todayISO,
  type JobCardData, type JobFilters,
} from "@/lib/jobs";

export type JobsPage = { rows: JobCardData[]; hasMore: boolean; extended: boolean };

function isMissingColumn(err: { code?: string; message?: string } | null) {
  return !!err && (err.code === "42703" || /column .* does not exist/i.test(err.message ?? ""));
}

function caseVariants(s: string) {
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return Array.from(new Set([s, s.toLowerCase(), s.toUpperCase(), cap]));
}

/**
 * Mengambil `limit` lowongan (+1 untuk mengetahui masih ada halaman berikutnya).
 * Memakai kolom GOBI WORK; jika SQL-nya belum dijalankan, otomatis kembali ke kolom lama
 * (tanpa filter jenis/metode/lokasi/pengalaman) dan memberi tanda `extended: false`.
 */
export async function fetchJobs(f: JobFilters, limit: number): Promise<JobsPage> {
  const run = async (extended: boolean) => {
    let qb = looseDb.from("jobs").select(extended ? JOB_SELECT_WORK : JOB_SELECT).range(0, limit);
    const term = sanitizeTerm(f.q);
    if (term) qb = qb.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    if (f.category) qb = qb.in("category", categoryFilterValues(f.category));
    if (f.status !== "all") qb = qb.eq("status", f.status);
    const skill = sanitizeTerm(f.skill);
    if (skill) qb = qb.overlaps("skills", caseVariants(skill));
    if (f.minBudget > 0) qb = qb.or(`budget_max.gte.${Math.floor(f.minBudget)},budget_min.gte.${Math.floor(f.minBudget)}`);
    if (extended) {
      qb = qb.eq("moderation_status", "approved");
      if (f.jobType) qb = qb.eq("job_type", f.jobType);
      if (f.workMode) qb = qb.eq("work_mode", f.workMode);
      if (f.experience) qb = qb.eq("experience_level", f.experience);
      const loc = sanitizeTerm(f.location);
      if (loc) qb = qb.ilike("location", `%${loc}%`);
    }
    if (f.sort === "budget") {
      qb = qb.order("budget_max", { ascending: false }).order("budget_min", { ascending: false }).order("created_at", { ascending: false });
    } else if (f.sort === "deadline") {
      qb = qb.or(`deadline.is.null,deadline.gte.${todayISO()}`).order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    } else {
      qb = qb.order("created_at", { ascending: false });
    }
    return qb;
  };

  let extended = true;
  let res = await run(true);
  if (res.error && isMissingColumn(res.error)) {
    extended = false;
    res = await run(false);
  }
  if (res.error) throw res.error;
  const all = (res.data ?? []) as unknown as JobCardData[];
  return { rows: all.slice(0, limit), hasMore: all.length > limit, extended };
}
