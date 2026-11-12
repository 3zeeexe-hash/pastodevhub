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

/** Funds are held by the admin at least this long after payment. */
export const ESCROW_HOLD_HOURS = 24;

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
  | "holding" // masa tahan 1 hari belum selesai
  | "waiting_delivery" // masa tahan selesai, jasa belum diterima client
  | "ready_for_admin" // jasa sudah diterima + lewat 1 hari: tinggal konfirmasi manual admin
  | "auto_available" // karya: otomatis tersedia untuk developer setelah masa tahan
  | "frozen"
  | "released"
  | "refunded";

/**
 * Tahap dana escrow. Sama dengan aturan di SQL (developer_wallet / admin_release_escrow):
 * jasa TIDAK pernah otomatis masuk saldo; hanya admin yang meneruskannya setelah client menerima dan lewat 1 hari.
 */
export function escrowStage(
  ledger: { status: string; held_until: string },
  kind: string,
  orderStatus: string,
  now: number = Date.now(),
): EscrowStage {
  if (ledger.status === "frozen") return "frozen";
  if (ledger.status === "released") return "released";
  if (ledger.status === "refunded") return "refunded";
  if (new Date(ledger.held_until).getTime() > now) return "holding";
  if (kind === "service") return orderStatus === "completed" ? "ready_for_admin" : "waiting_delivery";
  return "auto_available";
}

export const ESCROW_STATUS_LABEL: Record<string, string> = {
  held: "Ditahan admin",
  released: "Sudah diteruskan ke developer",
  frozen: "Dibekukan admin",
  refunded: "Direfund",
};
