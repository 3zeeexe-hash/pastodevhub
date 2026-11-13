// GOBI WORK: aturan murni (tanpa database) untuk kontrak, milestone, timesheet, dan komisi.
// Cermin dari fungsi di docs/sql/gobi-work/001_gobi_work_core.sql — database tetap penentu akhir.

export type ContractStatus = "draft" | "waiting_approval" | "active" | "completed" | "cancelled" | "disputed";
export type MilestoneStatus =
  | "pending" | "awaiting_payment" | "funded" | "in_progress" | "submitted"
  | "revision_requested" | "approved" | "released" | "cancelled" | "disputed";
export type PaymentType = "fixed" | "hourly";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  waiting_approval: "Menunggu persetujuan",
  active: "Aktif",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  disputed: "Sengketa",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "Menunggu",
  awaiting_payment: "Menunggu pembayaran",
  funded: "Didanai",
  in_progress: "Dikerjakan",
  submitted: "Dikirim",
  revision_requested: "Perlu revisi",
  approved: "Disetujui",
  released: "Dana diteruskan",
  cancelled: "Dibatalkan",
  disputed: "Sengketa",
};

/** Perpindahan status milestone yang diizinkan. `released` hanya dari `approved`; `funded` hanya dari pembayaran terverifikasi. */
export const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  pending: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["funded", "cancelled"],
  funded: ["in_progress", "disputed"],
  in_progress: ["submitted", "disputed"],
  submitted: ["revision_requested", "approved", "disputed"],
  revision_requested: ["submitted", "disputed"],
  approved: ["released", "disputed"],
  released: [],
  cancelled: [],
  disputed: ["funded", "in_progress", "submitted", "revision_requested", "approved", "cancelled"],
};

export function canMilestoneMove(from: MilestoneStatus, to: MilestoneStatus) {
  return MILESTONE_TRANSITIONS[from].includes(to);
}

/** Kontrak baru dianggap aktif jika persetujuan KEDUA pihak tercatat. */
export function contractIsActive(c: { status: ContractStatus; client_approved_at: string | null; freelancer_approved_at: string | null }) {
  return c.status === "active" && !!c.client_approved_at && !!c.freelancer_approved_at;
}

type Party = { client_id: string; freelancer_id: string };
export const isClient = (c: Party, uid: string | null) => !!uid && c.client_id === uid;
export const isFreelancer = (c: Party, uid: string | null) => !!uid && c.freelancer_id === uid;

/** Siapa yang boleh melakukan aksi apa pada milestone. */
export function milestoneActions(c: Party & { status: ContractStatus }, m: { status: MilestoneStatus }, uid: string | null) {
  const active = c.status === "active";
  return {
    start: active && isFreelancer(c, uid) && m.status === "funded",
    submit: active && isFreelancer(c, uid) && (m.status === "in_progress" || m.status === "revision_requested"),
    requestRevision: active && isClient(c, uid) && m.status === "submitted",
    approve: active && isClient(c, uid) && m.status === "submitted",
    pay: active && isClient(c, uid) && m.status === "awaiting_payment",
  };
}

/** Hasil kerja hanya bisa dikirim ulang jika kontrak aktif. Jumlah rupiah harus bilangan bulat positif. */
export function validAmount(n: number) {
  return Number.isInteger(n) && n > 0 && n <= 10_000_000_000;
}

/** Total milestone harus sama persis dengan nilai kontrak (harga tetap). */
export function milestonesMatchTotal(total: number, milestones: { amount: number; status?: MilestoneStatus }[]) {
  const live = milestones.filter((m) => m.status !== "cancelled");
  if (live.length === 0 || !validAmount(total)) return false;
  return live.every((m) => validAmount(m.amount)) && live.reduce((s, m) => s + m.amount, 0) === total;
}

/** Komisi platform dalam rupiah bulat. `percent` berasal dari pengaturan admin (0–50). */
export function calcCommission(amount: number, percent: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Nominal tidak valid");
  if (!Number.isFinite(percent) || percent < 0 || percent > 50) throw new Error("Persentase komisi tidak valid");
  const fee = Math.round((amount * percent) / 100);
  return { fee, net: amount - fee };
}

export type Timesheet = { hours: number; status: "submitted" | "approved" | "rejected" };

/** Rekap tagihan: hanya jam yang disetujui client yang ditagih. */
export function timesheetSummary(rows: Timesheet[], hourlyRate: number) {
  const sum = (s: Timesheet["status"]) => rows.filter((r) => r.status === s).reduce((t, r) => t + r.hours, 0);
  const approved = sum("approved");
  return {
    approvedHours: approved,
    pendingHours: sum("submitted"),
    rejectedHours: sum("rejected"),
    billable: Math.round(approved * hourlyRate),
  };
}

/** Validasi satu entri jam kerja (hari ini ke belakang maksimal 60 hari, 0 < jam ≤ 24). */
export function validTimesheetEntry(workDate: Date, hours: number, now: Date = new Date()) {
  if (!(hours > 0 && hours <= 24)) return false;
  const day = 86_400_000;
  const diff = Math.floor((startOfDay(now).getTime() - startOfDay(workDate).getTime()) / day);
  return diff >= 0 && diff <= 60;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
