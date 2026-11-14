// Shared (browser + server) Midtrans constants. No secrets here.
export type MidtransMode = "sandbox" | "production";

export const MIDTRANS_METHODS = [
  { id: "bca", label: "Virtual Account BCA", kind: "va" },
  { id: "bni", label: "Virtual Account BNI", kind: "va" },
  { id: "bri", label: "Virtual Account BRI", kind: "va" },
  { id: "permata", label: "Virtual Account Permata", kind: "va" },
  { id: "qris", label: "QRIS", kind: "qris" },
] as const;

export type MidtransMethodId = (typeof MIDTRANS_METHODS)[number]["id"];
export const MIDTRANS_METHOD_IDS: MidtransMethodId[] = MIDTRANS_METHODS.map((m) => m.id);

export function methodLabel(id: string) {
  return MIDTRANS_METHODS.find((m) => m.id === id)?.label ?? id.toUpperCase();
}

export function midtransBaseUrl(mode: MidtransMode) {
  return mode === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
  denied: "Ditolak",
  failed: "Gagal",
  superseded: "Diganti percobaan baru",
};

export type EscrowStage =
  | "waiting_delivery" // jasa masih dikerjakan atau belum diterima client; dana disimpan di escrow
  | "ready_for_admin" // jasa sudah diterima client tetapi dana belum diteruskan (sisa data lama): admin bisa meneruskan manual
  | "auto_available" // karya: bagian developer langsung tersedia, tanpa masa tahan
  | "frozen"
  | "released"
  | "refunded";

/**
 * Tahap dana escrow. Sama dengan aturan di SQL (developer_wallet, gobi-work/012): tidak ada masa tahan 1 hari.
 * Jasa diteruskan otomatis begitu client menerima hasil; admin hanya perlu bertindak untuk sisa data lama,
 * dana yang dibekukan, atau refund.
 */
export function escrowStage(ledger: { status: string }, kind: string, orderStatus: string): EscrowStage {
  if (ledger.status === "frozen") return "frozen";
  if (ledger.status === "released") return "released";
  if (ledger.status === "refunded") return "refunded";
  if (kind === "service") return orderStatus === "completed" ? "ready_for_admin" : "waiting_delivery";
  return "auto_available";
}

export const ESCROW_STATUS_LABEL: Record<string, string> = {
  held: "Disimpan di escrow",
  released: "Sudah diteruskan ke developer",
  frozen: "Dibekukan admin",
  refunded: "Direfund",
};
