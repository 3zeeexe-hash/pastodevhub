// GOBI SERVICES Fase 8: aturan murni untuk dashboard pembeli, pembatalan pesanan, dan ulasan.
// Cermin dari docs/sql/gobi-services/008_gobi_services_buyer.sql — database tetap penentu akhir.
import type { ServiceOrderStage } from "./services";

// ---- Kelompok di dashboard pembeli (cermin `bucket` di service_buyer_orders) ----
export type BuyerGroup = "needs_action" | "working" | "issues" | "done" | "closed";

export const BUYER_GROUP_LABEL: Record<BuyerGroup, string> = {
  needs_action: "Perlu tindakan",
  working: "Berjalan",
  issues: "Bermasalah",
  done: "Selesai",
  closed: "Ditutup",
};

export const BUYER_GROUPS: BuyerGroup[] = ["needs_action", "working", "issues", "done", "closed"];

/** Kelompok untuk sebuah stage. Menunggu pembayaran dan hasil yang menunggu diperiksa adalah tindakan pembeli. */
export function buyerGroup(stage: ServiceOrderStage): BuyerGroup {
  switch (stage) {
    case "awaiting_payment":
    case "submitted":
      return "needs_action";
    case "payment_processing":
    case "paid":
    case "pending_seller_acceptance":
    case "in_progress":
    case "revision_requested":
      return "working";
    case "cancel_requested":
    case "disputed":
      return "issues";
    case "completed":
      return "done";
    default:
      return "closed"; // cancelled, refunded, partially_refunded
  }
}

/** Keterangan singkat di kartu pesanan pembeli. */
export const BUYER_STAGE_HINT: Partial<Record<ServiceOrderStage, string>> = {
  awaiting_payment: "Selesaikan pembayaran agar pesanan diproses",
  payment_processing: "Menunggu konfirmasi pembayaran",
  paid: "Pembayaran diterima",
  pending_seller_acceptance: "Menunggu penjual menerima pesanan",
  in_progress: "Sedang dikerjakan penjual",
  submitted: "Hasil sudah dikirim, periksa lalu setujui atau minta revisi",
  revision_requested: "Penjual mengerjakan revisi",
  cancel_requested: "Ada permintaan pembatalan",
  disputed: "Pesanan sedang disengketakan",
};

// ---- Pembatalan ----
export type CancelRole = "buyer" | "seller" | null;
export type CancelUi = "request" | "respond" | "waiting" | "none";

/**
 * Tampilan pembatalan di halaman pesanan.
 * request: pembeli sebelum penjual menerima (langsung batal), atau pembeli/penjual saat dikerjakan (perlu persetujuan);
 * respond: pihak lawan menjawab permintaan; waiting: peminta menunggu dan bisa menarik permintaan.
 */
export function cancelUi(stage: ServiceOrderStage, role: CancelRole, requestedBy: string | null, userId: string | null): CancelUi {
  if (!role || !userId) return "none";
  if (stage === "cancel_requested") {
    if (!requestedBy) return "none";
    return requestedBy === userId ? "waiting" : "respond";
  }
  if (stage === "pending_seller_acceptance") return role === "buyer" ? "request" : "none";
  if (stage === "in_progress" || stage === "revision_requested") return "request";
  return "none";
}

export const CANCEL_REASON_MIN = 10;
export const CANCEL_REASON_MAX = 1000;

export function cancelReasonErrors(reason: string): string[] {
  const n = reason.trim().length;
  if (n < CANCEL_REASON_MIN) return [`Alasan minimal ${CANCEL_REASON_MIN} karakter.`];
  if (n > CANCEL_REASON_MAX) return [`Alasan maksimal ${CANCEL_REASON_MAX} karakter.`];
  return [];
}

// ---- Ulasan ----
export const REVIEW_COMMENT_MAX = 1000;
export const REPLY_MIN = 2;
export const REPLY_MAX = 1000;

export function reviewErrors(f: { rating: number; comment: string }): string[] {
  const out: string[] = [];
  if (!Number.isInteger(f.rating) || f.rating < 1 || f.rating > 5) out.push("Pilih nilai 1 sampai 5 bintang.");
  if (f.comment.trim().length > REVIEW_COMMENT_MAX) out.push(`Ulasan maksimal ${REVIEW_COMMENT_MAX} karakter.`);
  return out;
}

export function replyErrors(reply: string): string[] {
  const n = reply.trim().length;
  if (n < REPLY_MIN) return [`Balasan minimal ${REPLY_MIN} karakter.`];
  if (n > REPLY_MAX) return [`Balasan maksimal ${REPLY_MAX} karakter.`];
  return [];
}

/** Pembeli boleh memberi ulasan sekali, hanya setelah pesanan selesai. */
export function canLeaveReview(stage: ServiceOrderStage | null, role: CancelRole, hasReview: boolean): boolean {
  return stage === "completed" && role === "buyer" && !hasReview;
}

/** Penjual boleh membalas sekali, hanya bila sudah ada ulasan. */
export function canReplyReview(role: CancelRole, hasReview: boolean, hasReply: boolean): boolean {
  return role === "seller" && hasReview && !hasReply;
}

// ---- Bentuk data dari fungsi baca ----
export type BuyerOrderRow = {
  id: string; number: number; title: string; amount: number; stage: ServiceOrderStage; group: BuyerGroup;
  due_at: string | null; created_at: string; delivery_days: number; revisions_included: number; revisions_used: number;
  package: string | null; has_review: boolean; cancel_requested_by: string | null;
  seller: { id: string; username: string; display_name: string | null; avatar_url: string | null };
};

export type BuyerOrdersResult = {
  counts: Record<BuyerGroup | "all", number>;
  total: number;
  rows: BuyerOrderRow[];
};

export type ReviewRow = {
  id: string; rating: number; comment: string; seller_reply: string | null; replied_at: string | null; created_at: string; is_visible: boolean;
};
