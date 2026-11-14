// GOBI WORK: rencana milestone pada lowongan harga tetap (SQL 010) dan hitungan progres milestone di kontrak.
// Bagian ini murni (tanpa database) supaya mudah diuji. Database tetap penentu akhir: fungsi _work_plan_valid dan
// work_accept_application di docs/sql/gobi-work/010_milestone_di_lowongan.sql memakai aturan yang sama.
import type { MilestoneStatus } from "@/lib/work";

export const MIN_PLAN_MILESTONES = 2;
export const MAX_PLAN_MILESTONES = 10;

/** Isian form (bobot masih teks). */
export type PlanDraft = { title: string; description: string; percent: string };
/** Bentuk yang disimpan di kolom jobs.milestone_plan. */
export type PlanMilestone = { title: string; description: string; percent: number };

export const emptyPlan = (): PlanDraft[] => [
  { title: "", description: "", percent: "50" },
  { title: "", description: "", percent: "50" },
];

export function planPercentTotal(rows: PlanDraft[]) {
  return rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
}

/** Pemeriksaan form. Kunci galat: "milestones" (umum), "milestone-<i>-title|percent|description". Kosong = valid. */
export function validatePlan(rows: PlanDraft[]): Record<string, string> {
  const e: Record<string, string> = {};
  if (rows.length < MIN_PLAN_MILESTONES) e.milestones = `Tambahkan minimal ${MIN_PLAN_MILESTONES} milestone.`;
  else if (rows.length > MAX_PLAN_MILESTONES) e.milestones = `Maksimal ${MAX_PLAN_MILESTONES} milestone.`;
  rows.forEach((r, i) => {
    const t = r.title.trim();
    if (t.length < 3) e[`milestone-${i}-title`] = "Nama milestone minimal 3 huruf.";
    else if (t.length > 120) e[`milestone-${i}-title`] = "Nama milestone maksimal 120 karakter.";
    if (r.description.trim().length > 1000) e[`milestone-${i}-description`] = "Deskripsi maksimal 1000 karakter.";
    const p = Number(r.percent);
    if (r.percent.trim() === "" || !Number.isInteger(p) || p < 1 || p > 100) e[`milestone-${i}-percent`] = "Isi bobot bulat 1–100.";
  });
  const percentsOk = rows.every((_, i) => !e[`milestone-${i}-percent`]);
  if (percentsOk && !e.milestones) {
    const total = planPercentTotal(rows);
    if (total !== 100) e.milestones = `Total bobot harus 100% (sekarang ${total}%).`;
  }
  return e;
}

export function planToJson(rows: PlanDraft[]): PlanMilestone[] {
  return rows.map((r) => ({ title: r.title.trim(), description: r.description.trim(), percent: Number(r.percent) }));
}

/** Membaca kolom jsonb dengan hati-hati; entri yang rusak dibuang. */
export function parsePlan(raw: unknown): PlanMilestone[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanMilestone[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const percent = Number(o.percent);
    if (typeof o.title !== "string" || !o.title.trim() || !Number.isFinite(percent)) continue;
    out.push({ title: o.title.trim(), description: typeof o.description === "string" ? o.description.trim() : "", percent });
  }
  return out;
}

/** Membagi nilai kontrak menurut bobot. Dibulatkan ke bawah; sisa rupiah masuk ke milestone terakhir (sama dengan SQL 010). */
export function splitByPercent(total: number, percents: number[]): number[] {
  const out = percents.map((p) => Math.floor((total * p) / 100));
  if (out.length > 0) out[out.length - 1] += total - out.reduce((s, x) => s + x, 0);
  return out;
}

export type MilestoneTone = "done" | "active" | "bad" | "todo";

/** Selesai = disetujui atau dana sudah diteruskan. Sedang berjalan = sudah dibayar sampai menunggu keputusan client. */
export function milestoneTone(status: MilestoneStatus): MilestoneTone {
  if (status === "approved" || status === "released") return "done";
  if (status === "disputed") return "bad";
  if (status === "pending" || status === "cancelled") return "todo";
  return "active";
}

type MsLite = { amount: number; status: MilestoneStatus };

/** Ringkasan progres. Milestone dibatalkan tidak dihitung. Persen dihitung dari nilai rupiah milestone yang sudah disetujui. */
export function milestoneProgress(ms: MsLite[]) {
  const live = ms.filter((m) => m.status !== "cancelled");
  const done = live.filter((m) => milestoneTone(m.status) === "done");
  const totalAmount = live.reduce((s, m) => s + m.amount, 0);
  const doneAmount = done.reduce((s, m) => s + m.amount, 0);
  const percent = live.length === 0 ? 0 : totalAmount > 0 ? Math.round((doneAmount * 100) / totalAmount) : Math.round((done.length * 100) / live.length);
  return {
    total: live.length, done: done.length, released: live.filter((m) => m.status === "released").length,
    totalAmount, doneAmount, percent, complete: live.length > 0 && done.length === live.length,
  };
}
