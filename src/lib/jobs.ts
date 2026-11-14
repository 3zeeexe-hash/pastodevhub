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

/** Kolom tambahan GOBI WORK (butuh docs/sql/gobi-work/001). Dipakai dengan cadangan jika SQL belum dijalankan. */
export const JOB_SELECT_WORK =
  "id,title,description,category,skills,budget_min,budget_max,deadline,status,applications_count,created_at,client_id,job_type,work_mode,location,experience_level,payment_type,positions, client:profiles!jobs_client_id_fkey(username,display_name,avatar_url,is_verified)";
export const JOB_EXTRA_SELECT = "job_type,work_mode,location,experience_level,payment_type,positions,requirements";

export type JobCardData = {
  id: string; title: string; description: string; category: string; skills: string[];
  budget_min: number; budget_max: number; deadline: string | null; status: JobStatus;
  applications_count: number; created_at: string; client_id: string;
  job_type?: JobType; work_mode?: WorkMode; location?: string | null; experience_level?: ExperienceLevel | null;
  payment_type?: PaymentType; positions?: number;
  client: { username: string; display_name: string | null; avatar_url: string | null; is_verified?: boolean } | null;
};

export type JobExtra = {
  job_type: JobType; work_mode: WorkMode; location: string | null; experience_level: ExperienceLevel | null;
  payment_type: PaymentType; positions: number; requirements: string | null;
};

// ---------- Kategori, jenis, metode, pengalaman, sistem bayar ----------
export const JOB_CATEGORIES = [
  ["web-development", "Web Development"],
  ["mobile-development", "Mobile Development"],
  ["backend-development", "Backend Development"],
  ["frontend-development", "Frontend Development"],
  ["full-stack-development", "Full Stack Development"],
  ["ui-ux-design", "UI/UX Design"],
  ["graphic-design", "Graphic Design"],
  ["api-integration", "API Integration"],
  ["database", "Database"],
  ["devops", "DevOps"],
  ["cybersecurity", "Cybersecurity"],
  ["data-science", "Data Science"],
  ["ai-ml", "AI / Machine Learning"],
  ["it-support", "IT Support"],
  ["digital-marketing", "Digital Marketing"],
  ["other", "Other"],
] as const;

/** Lowongan lama memakai kategori marketplace; dipetakan ke kategori GOBI WORK agar tetap tampil dan terfilter. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  website: "web-development",
  "aplikasi-mobile": "mobile-development",
  template: "ui-ux-design",
  plugin: "other",
  game: "other",
  desain: "graphic-design",
  "data-ai": "ai-ml",
  lainnya: "other",
};
export const normalizeCategory = (slug: string) => LEGACY_CATEGORY_MAP[slug] ?? slug;
export function jobCategoryLabel(slug: string) {
  const n = normalizeCategory(slug);
  return JOB_CATEGORIES.find(([k]) => k === n)?.[1] ?? "Other";
}
/** Semua nilai `jobs.category` yang cocok dengan satu kategori filter (termasuk nilai lama). */
export function categoryFilterValues(slug: string) {
  return [slug, ...Object.entries(LEGACY_CATEGORY_MAP).filter(([, v]) => v === slug).map(([k]) => k)];
}

export const JOB_TYPES = [["freelance", "Freelance"], ["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Magang"]] as const;
export const WORK_MODES = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "Onsite"]] as const;
export const EXPERIENCE_LEVELS = [["entry", "Pemula"], ["junior", "Junior"], ["mid", "Menengah"], ["senior", "Senior"], ["expert", "Ahli"]] as const;
export const PAYMENT_TYPES = [["fixed", "Kerja langsung"], ["hourly", "Per jam"]] as const;
export type JobType = (typeof JOB_TYPES)[number][0];
export type WorkMode = (typeof WORK_MODES)[number][0];
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number][0];
export type PaymentType = (typeof PAYMENT_TYPES)[number][0];

type Options = readonly (readonly [string, string])[];
const labelOf = (list: Options, v?: string | null) => list.find(([k]) => k === v)?.[1] ?? "";
const has = (list: Options, v: string) => list.some(([k]) => k === v);
export const jobTypeLabel = (v?: string | null) => labelOf(JOB_TYPES, v);
export const workModeLabel = (v?: string | null) => labelOf(WORK_MODES, v);
export const experienceLabel = (v?: string | null) => labelOf(EXPERIENCE_LEVELS, v);
export const paymentTypeLabel = (v?: string | null) => labelOf(PAYMENT_TYPES, v);

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

// ---------- Filter Explore Jobs ----------
export type JobSort = "newest" | "budget" | "deadline";
export type JobFilters = {
  q: string; category: string; status: JobStatus | "all"; jobType: string; workMode: string;
  experience: string; location: string; skill: string; minBudget: number; sort: JobSort;
};
export const EMPTY_FILTERS: JobFilters = {
  q: "", category: "", status: "open", jobType: "", workMode: "", experience: "", location: "", skill: "", minBudget: 0, sort: "newest",
};
export const SORT_LABEL: Record<JobSort, string> = { newest: "Terbaru", budget: "Budget tertinggi", deadline: "Deadline terdekat" };
export const PAGE_SIZE = 12;

/** Membersihkan teks pencarian agar aman dipakai di filter PostgREST (`or`/`ilike`). */
export function sanitizeTerm(s: string) {
  return s.replace(/[%,()_*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Jumlah filter lanjutan yang aktif (di luar pencarian, status, dan urutan). */
export function activeFilterCount(f: JobFilters) {
  return [f.category, f.jobType, f.workMode, f.experience, f.location.trim(), f.skill.trim(), f.minBudget > 0 ? "1" : ""].filter(Boolean).length;
}

// ---------- Form pembuatan lowongan ----------
export type JobFormInput = {
  title: string; description: string; category: string; skills: string[]; jobType: string; workMode: string;
  location: string; experience: string; paymentType: string; min: number; max: number; deadline: string;
  positions: number; requirements: string;
  /** Batas jumlah revisi (1–20); null/kosong = tanpa batas. Hanya berlaku untuk kerja langsung. */
  revisionLimit?: number | null;
};

export const MAX_REVISION_LIMIT = 20;

export function parseSkills(raw: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim().slice(0, 30);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
  }
  return out.slice(0, 12);
}

export function todayISO(d: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mengembalikan pesan kesalahan per field; objek kosong berarti valid. Database tetap penentu akhir. */
export function validateJobForm(f: JobFormInput, today: string = todayISO()) {
  const e: Record<string, string> = {};
  const title = f.title.trim();
  if (title.length < 5 || title.length > 120) e.title = "Judul 5–120 karakter.";
  const desc = f.description.trim();
  if (desc.length < 30) e.description = "Deskripsi minimal 30 karakter.";
  else if (desc.length > 8000) e.description = "Deskripsi maksimal 8000 karakter.";
  if (!JOB_CATEGORIES.some(([k]) => k === f.category)) e.category = "Pilih kategori.";
  if (f.skills.length < 1) e.skills = "Isi minimal satu keahlian.";
  if (!has(JOB_TYPES, f.jobType)) e.jobType = "Pilih jenis pekerjaan.";
  if (!has(WORK_MODES, f.workMode)) e.workMode = "Pilih metode kerja.";
  if (!has(EXPERIENCE_LEVELS, f.experience)) e.experience = "Pilih tingkat pengalaman.";
  if (!has(PAYMENT_TYPES, f.paymentType)) e.paymentType = "Pilih sistem pembayaran.";
  const loc = f.location.trim();
  if (loc.length > 100) e.location = "Lokasi maksimal 100 karakter.";
  else if (f.workMode !== "remote" && loc.length < 2) e.location = "Isi lokasi untuk pekerjaan hybrid/onsite.";
  if (!Number.isInteger(f.min) || !Number.isInteger(f.max) || f.min <= 0 || f.max <= 0) e.budget = "Isi budget minimum dan maksimum (bilangan bulat rupiah).";
  else if (f.max < f.min) e.budget = "Budget maksimum tidak boleh di bawah minimum.";
  else if (f.max > 10_000_000_000) e.budget = "Budget terlalu besar.";
  if (f.deadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.deadline)) e.deadline = "Format tanggal tidak valid.";
    else if (f.deadline < today) e.deadline = "Tanggal selesai tidak boleh di masa lalu.";
  }
  if (f.revisionLimit !== null && f.revisionLimit !== undefined) {
    if (f.paymentType === "hourly") e["revisionLimit"] = "Batas revisi hanya untuk kerja langsung, bukan per jam.";
    else if (!Number.isInteger(f.revisionLimit) || f.revisionLimit < 1 || f.revisionLimit > MAX_REVISION_LIMIT) e["revisionLimit"] = `Batas revisi 1–${MAX_REVISION_LIMIT} kali.`;
  }
  if (!Number.isInteger(f.positions) || f.positions < 1 || f.positions > 100) e.positions = "Jumlah freelancer 1–100.";
  if (f.requirements.length > 4000) e.requirements = "Persyaratan tambahan maksimal 4000 karakter.";
  return e;
}
