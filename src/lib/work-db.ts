// GOBI WORK: tipe baris, pembantu RPC, dan format tampilan. Semua perubahan status lewat fungsi database (work_*), bukan update langsung.
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import type { ContractStatus, MilestoneStatus, PaymentType } from "@/lib/work";

export type PartyProfile = { username: string; display_name: string | null; avatar_url: string | null } | null;

export type ContractRow = {
  id: string; job_id: string; application_id: string; client_id: string; freelancer_id: string;
  title: string; description: string; scope: string; payment_type: PaymentType;
  total_amount: number; hourly_rate: number; deadline: string | null;
  revision_terms: string; usage_rights: string; cancellation_terms: string; payment_terms: string;
  /** Kolom SQL 006; undefined/null sebelum dijalankan. null = tanpa batas revisi. */
  revision_limit?: number | null; revisions_used?: number;
  status: ContractStatus; client_approved_at: string | null; freelancer_approved_at: string | null;
  version: number; created_at: string; updated_at: string;
  client: PartyProfile; freelancer: PartyProfile;
};

export type MilestoneRow = {
  id: string; contract_id: string; position: number; title: string; description: string; amount: number;
  deadline: string | null; status: MilestoneStatus; order_id: string | null; created_at: string; updated_at: string;
  auto_approved_at?: string | null;
};
export type SubmissionRow = { id: string; milestone_id: string; note: string; links: string[]; created_at: string };
export type RevisionRow = { id: string; milestone_id: string; note: string; created_at: string };
export type TimesheetRow = {
  id: string; contract_id: string; work_date: string; hours: number; note: string;
  status: "submitted" | "approved" | "rejected"; decision_note: string | null; billed_order_id: string | null; created_at: string;
  start_time?: string | null; end_time?: string | null;
};
export type EventRow = { id: number; actor_id: string | null; event: string; detail: Record<string, unknown>; created_at: string };
export type DisputeRow = {
  id: string; contract_id: string; milestone_id: string | null; opened_by: string; reason: string;
  status: "open" | "under_review" | "resolved"; decision: string | null; decision_note: string | null; created_at: string; decided_at: string | null;
};
export type ReviewRow = { id: string; reviewer_id: string; reviewee_id: string; rating: number; comment: string; created_at: string };
export type WorkOrderRow = { id: string; title: string; amount: number; status: string; paid_at: string | null; work_milestone_id: string | null; created_at: string };

export const CONTRACT_SELECT =
  "*, client:profiles!work_contracts_client_id_fkey(username,display_name,avatar_url), freelancer:profiles!work_contracts_freelancer_id_fkey(username,display_name,avatar_url)";

/** Memanggil fungsi database dan melempar Error berpesan bahasa Indonesia jika gagal. */
export async function workRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await looseDb.rpc(fn, args);
  if (error) throw new Error(errMsg(error));
  return data as T;
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const rp = (n: number | null | undefined) => idr.format(Number(n ?? 0));
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const personName = (p: PartyProfile) => (p ? p.display_name || p.username : "Pengguna");

const EVENT_LABEL: Record<string, string> = {
  created: "Kontrak dibuat",
  amount_changed: "Nilai kontrak diubah",
  milestone_added: "Milestone ditambahkan",
  milestone_removed: "Milestone dihapus",
  sent: "Kontrak dikirim ke freelancer",
  approved_by_both: "Disetujui kedua pihak — kontrak aktif",
  rejected_by_freelancer: "Freelancer meminta perubahan",
  cancelled: "Kontrak dibatalkan",
  completed: "Kontrak selesai",
  milestone_order_created: "Tagihan milestone dibuat",
  milestone_funded: "Pembayaran terverifikasi, milestone didanai",
  milestone_started: "Milestone mulai dikerjakan",
  milestone_submitted: "Hasil pekerjaan dikirim",
  revision_requested: "Revisi diminta",
  milestone_approved: "Hasil disetujui client",
  milestone_released: "Dana diteruskan ke saldo freelancer",
  milestone_auto_approved: "Client tidak menanggapi sampai batas waktu — hasil disetujui otomatis",
  milestone_auto_released: "Dana diteruskan otomatis ke saldo freelancer",
  timesheet_submitted: "Jam kerja dikirim",
  timesheet_approved: "Jam kerja disetujui",
  timesheet_rejected: "Jam kerja ditolak",
  hourly_invoice_created: "Tagihan jam kerja dibuat",
  hourly_invoice_paid: "Tagihan jam kerja dibayar",
  dispute_opened: "Sengketa diajukan",
  dispute_resolved: "Sengketa diputuskan admin",
};
export function eventLabel(e: string) {
  return EVENT_LABEL[e] ?? (e.startsWith("status_") ? `Status kontrak berubah: ${e.slice(7)}` : e.replace(/_/g, " "));
}
