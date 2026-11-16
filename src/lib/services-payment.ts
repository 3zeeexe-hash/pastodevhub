// GOBI SERVICES Fase 6: aturan murni untuk tampilan transaksi dan rekonsiliasi pesanan jasa.
// Cermin dari docs/sql/gobi-services/006_gobi_services_payments.sql — database tetap penentu akhir.
// Pembayaran sendiri tetap lewat Midtrans + escrow yang sudah ada; di sini hanya pemetaan status dan tipe data baca.
import type { ServiceOrderStage } from "./services";

export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "denied" | "failed" | "superseded";
export type EscrowStatus = "held" | "released" | "frozen" | "refunded";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
  denied: "Ditolak",
  failed: "Gagal",
  superseded: "Diganti percobaan baru",
};

export const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  held: "Ditahan (escrow)",
  released: "Diteruskan ke developer",
  frozen: "Dibekukan",
  refunded: "Direfund",
};

/** Status transaksi untuk tampilan admin. */
export type TxStatus = "pending" | "paid" | "failed" | "refunded" | "refund_needed" | "superseded";

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  refund_needed: "Perlu refund",
  superseded: "Diganti",
};

export type TxTone = "ok" | "warn" | "bad" | "info";
export const TX_STATUS_TONE: Record<TxStatus, TxTone> = {
  pending: "warn", paid: "ok", failed: "bad", refunded: "info", refund_needed: "bad", superseded: "info",
};

/**
 * Status transaksi dari baris pembayaran. Refund hanya dianggap terjadi bila escrow sudah ditandai refund
 * (konfirmasi admin atas refund di dashboard Midtrans); `needs_refund` berarti perlu ditangani, bukan sudah selesai.
 */
export function transactionStatus(p: { status: PaymentStatus; needs_refund: boolean; escrow_status: EscrowStatus | null }): TxStatus {
  if (p.escrow_status === "refunded") return "refunded";
  if (p.status === "paid") return p.needs_refund ? "refund_needed" : "paid";
  if (p.status === "pending") return "pending";
  if (p.status === "superseded") return "superseded";
  return "failed";
}

/** Nilai bersih untuk penjual: dibayar dikurangi komisi, tidak pernah negatif. */
export function netAfterCommission(gross: number, commission: number): number {
  return Math.max(0, gross - Math.max(0, commission));
}

/** Stage yang wajar untuk tiap status pesanan lama (cermin pemeriksaan `stage_stale` di service_admin_reconcile). */
export function expectedStages(orderStatus: string): ServiceOrderStage[] | null {
  switch (orderStatus) {
    case "awaiting_payment":
    case "payment_review":
      return ["awaiting_payment", "payment_processing"];
    case "in_progress":
      return ["in_progress", "revision_requested", "pending_seller_acceptance", "cancel_requested", "disputed"];
    case "delivered":
      return ["submitted", "disputed"];
    case "completed":
      return ["completed", "disputed", "refunded", "partially_refunded"];
    case "cancelled":
      return ["cancelled", "refunded", "partially_refunded"];
    default:
      return null; // status lain (mis. requested, declined) tidak dibandingkan
  }
}

export function isStageConsistent(orderStatus: string, stage: ServiceOrderStage): boolean {
  const ok = expectedStages(orderStatus);
  return ok === null || ok.includes(stage);
}

// ---- Rekonsiliasi ----
export type ReconcileCode =
  | "paid_not_progressed" | "paid_without_escrow" | "escrow_amount_mismatch" | "fee_mismatch"
  | "stage_stale" | "needs_refund" | "multiple_paid" | "sync_error";

export const RECONCILE_LABEL: Record<ReconcileCode, string> = {
  paid_not_progressed: "Lunas tetapi pesanan belum berjalan",
  paid_without_escrow: "Sudah dibayar tanpa baris escrow",
  escrow_amount_mismatch: "Nilai escrow tidak sama dengan pesanan",
  fee_mismatch: "Komisi escrow berbeda dari komisi terkunci",
  stage_stale: "Status alur kerja tertinggal",
  needs_refund: "Perlu refund",
  multiple_paid: "Pembayaran lunas lebih dari satu",
  sync_error: "Galat sinkronisasi (30 hari terakhir)",
};

/** Masalah yang menyangkut uang dan perlu ditangani lebih dulu. */
export const RECONCILE_URGENT: ReadonlySet<ReconcileCode> = new Set<ReconcileCode>([
  "paid_not_progressed", "paid_without_escrow", "escrow_amount_mismatch", "fee_mismatch", "needs_refund", "multiple_paid",
]);

export type ReconcileIssue = { code: ReconcileCode; order_id: string; number: number; detail: string };

// ---- Bentuk data dari fungsi baca admin ----
export type AdminTransactionRow = {
  id: string; reference: string; provider: string; mode: string; method: string; bank: string | null;
  status: PaymentStatus; needs_refund: boolean; created_at: string; paid_at: string | null;
  gross: number; commission: number | null; net: number | null; escrow_status: EscrowStatus | null;
  order: { id: string; number: number; title: string; status: string; stage: ServiceOrderStage | null; is_package: boolean };
  buyer: { id: string; username: string };
  seller: { id: string; username: string };
};

export type AdminTransactionList = { total: number; rows: AdminTransactionRow[] };
