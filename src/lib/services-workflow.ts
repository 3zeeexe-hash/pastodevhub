// GOBI SERVICES Fase 7: aturan murni untuk dashboard penjual dan alur pengerjaan (terima/tolak, kirim hasil, revisi, setujui).
// Cermin dari docs/sql/gobi-services/007_gobi_services_workflow.sql — database tetap penentu akhir.
import type { ServiceOrderStage } from "./services";
import { validReferenceUrl, type Reference } from "./services-checkout";

// ---- Kelompok di dashboard penjual (cermin `bucket` di service_seller_orders) ----
export type SellerGroup = "needs_action" | "working" | "submitted" | "issues" | "done" | "closed";

export const SELLER_GROUP_LABEL: Record<SellerGroup, string> = {
  needs_action: "Perlu tindakan",
  working: "Dikerjakan",
  submitted: "Menunggu persetujuan",
  issues: "Bermasalah",
  done: "Selesai",
  closed: "Ditutup",
};

export const SELLER_GROUPS: SellerGroup[] = ["needs_action", "working", "submitted", "issues", "done", "closed"];

/** Kelompok untuk sebuah stage; null = tidak ditampilkan ke penjual (pesanan belum dibayar). */
export function sellerGroup(stage: ServiceOrderStage): SellerGroup | null {
  switch (stage) {
    case "awaiting_payment":
    case "payment_processing":
      return null;
    case "pending_seller_acceptance":
    case "revision_requested":
      return "needs_action";
    case "paid":
    case "in_progress":
      return "working";
    case "submitted":
      return "submitted";
    case "cancel_requested":
    case "disputed":
      return "issues";
    case "completed":
      return "done";
    default:
      return "closed"; // cancelled, refunded, partially_refunded
  }
}

// ---- Tenggat ----
export type DueKind = "none" | "ok" | "soon" | "today" | "overdue";
export type DueState = { kind: DueKind; days: number; label: string };

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Selisih hari kalender (zona waktu lokal) antara tenggat dan sekarang. Negatif = terlambat. */
export function dueState(dueAt: string | null, now: Date = new Date()): DueState {
  if (!dueAt) return { kind: "none", days: 0, label: "Tenggat belum ditentukan" };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return { kind: "none", days: 0, label: "Tenggat belum ditentukan" };
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days < 0) return { kind: "overdue", days, label: `Terlambat ${-days} hari` };
  if (days === 0) return { kind: "today", days, label: "Jatuh tempo hari ini" };
  if (days <= 2) return { kind: "soon", days, label: `Sisa ${days} hari` };
  return { kind: "ok", days, label: `Sisa ${days} hari` };
}

// ---- Panel di halaman pesanan ----
export type WorkflowRole = "buyer" | "seller" | "admin" | null;
export type WorkflowPanel = "decide" | "submit" | "review" | "waiting" | "none";

/** Panel yang tampil di halaman pesanan paket, menurut peran dan stage. Aturan sebenarnya ditegakkan fungsi database. */
export function workflowPanel(stage: ServiceOrderStage, role: WorkflowRole): { panel: WorkflowPanel; waitingFor?: "penjual" | "pembeli" } {
  if (role === "seller") {
    if (stage === "pending_seller_acceptance") return { panel: "decide" };
    if (stage === "in_progress" || stage === "revision_requested") return { panel: "submit" };
    if (stage === "submitted") return { panel: "waiting", waitingFor: "pembeli" };
  }
  if (role === "buyer") {
    if (stage === "submitted") return { panel: "review" };
    if (stage === "pending_seller_acceptance" || stage === "in_progress" || stage === "revision_requested") return { panel: "waiting", waitingFor: "penjual" };
  }
  return { panel: "none" };
}

// ---- Validasi form ----
export const SUBMIT_NOTE_MIN = 10;
export const SUBMIT_NOTE_MAX = 3000;
export const REVISION_NOTE_MIN = 10;
export const REVISION_NOTE_MAX = 2000;
export const DECLINE_REASON_MIN = 10;
export const DECLINE_REASON_MAX = 1000;
export const MAX_SUBMISSION_ATTACHMENTS = 5;

export function submitWorkErrors(f: { note: string; demoUrl: string; repoUrl: string; attachments: Reference[] }): string[] {
  const out: string[] = [];
  const n = f.note.trim().length;
  if (n < SUBMIT_NOTE_MIN) out.push(`Catatan hasil minimal ${SUBMIT_NOTE_MIN} karakter.`);
  if (n > SUBMIT_NOTE_MAX) out.push(`Catatan hasil maksimal ${SUBMIT_NOTE_MAX} karakter.`);
  if (f.demoUrl.trim() && !validReferenceUrl(f.demoUrl)) out.push("Link demo harus diawali https:// dan tanpa spasi.");
  if (f.repoUrl.trim() && !validReferenceUrl(f.repoUrl)) out.push("Link repositori harus diawali https:// dan tanpa spasi.");
  if (f.attachments.length > MAX_SUBMISSION_ATTACHMENTS) out.push(`Maksimal ${MAX_SUBMISSION_ATTACHMENTS} lampiran.`);
  if (!f.demoUrl.trim() && !f.repoUrl.trim() && f.attachments.length === 0) out.push("Sertakan minimal satu link demo, link repositori, atau lampiran hasil.");
  return out;
}

export function revisionErrors(f: { note: string; used: number; included: number }): string[] {
  const out: string[] = [];
  const n = f.note.trim().length;
  if (f.used >= f.included) out.push("Jatah revisi paket sudah habis. Hubungi penjual untuk revisi tambahan.");
  if (n < REVISION_NOTE_MIN) out.push(`Jelaskan bagian yang perlu direvisi (minimal ${REVISION_NOTE_MIN} karakter).`);
  if (n > REVISION_NOTE_MAX) out.push(`Catatan revisi maksimal ${REVISION_NOTE_MAX} karakter.`);
  return out;
}

export function declineErrors(reason: string): string[] {
  const n = reason.trim().length;
  if (n < DECLINE_REASON_MIN) return [`Alasan penolakan minimal ${DECLINE_REASON_MIN} karakter.`];
  if (n > DECLINE_REASON_MAX) return [`Alasan penolakan maksimal ${DECLINE_REASON_MAX} karakter.`];
  return [];
}

/** Catatan hasil yang ditulis ke orders.delivery_note (tampilan lama). Cermin penyusunan di service_submit_work, maks 4000 karakter. */
export function composeDeliveryNote(f: { note: string; demoUrl: string; repoUrl: string; attachments: Reference[] }): string {
  const demo = f.demoUrl.trim();
  const repo = f.repoUrl.trim();
  const att = f.attachments.map((a) => `\n${a.name.trim() || "Lampiran"}: ${a.url}`).join("");
  return (f.note.trim() + (demo ? `\n\nDemo: ${demo}` : "") + (repo ? `\n\nRepositori: ${repo}` : "") + att).slice(0, 4000);
}

// ---- Bentuk data dari fungsi baca ----
export type SellerOrderRow = {
  id: string; number: number; title: string; amount: number; fee: number | null; net: number;
  order_status: string; stage: ServiceOrderStage; group: SellerGroup; due_at: string | null; accepted_at: string | null;
  created_at: string; delivery_days: number; revisions_included: number; revisions_used: number; package: string | null;
  buyer: { id: string; username: string; display_name: string | null; avatar_url: string | null };
};

export type SellerOrdersResult = {
  counts: Record<SellerGroup | "all", number>;
  total: number;
  rows: SellerOrderRow[];
};

export type SubmissionRow = {
  id: string; note: string; demo_url: string | null; repo_url: string | null; attachments: Reference[]; revision_no: number; created_at: string;
};

export type RevisionRow = { id: string; note: string; submission_id: string | null; created_at: string };
