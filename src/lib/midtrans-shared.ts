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

// ---------- Biaya admin per metode pembayaran ----------

/**
 * Biaya admin satu metode: nominal tetap (Rp) ditambah persen dari nominal pesanan.
 * Contoh: VA = { flat: 4000, percent: 0 }, QRIS = { flat: 0, percent: 0.7 }.
 * Biaya ditanggung pembeli dan ditambahkan di atas nominal pesanan; dana escrow developer tetap nominal pesanan.
 */
export type FeeRule = { flat: number; percent: number };
export type MidtransFees = Record<MidtransMethodId, FeeRule>;

export const MAX_FEE_FLAT = 100_000; // Rp
export const MAX_FEE_PERCENT = 10; // %

export function emptyFees(): MidtransFees {
  return Object.fromEntries(MIDTRANS_METHOD_IDS.map((id) => [id, { flat: 0, percent: 0 }])) as MidtransFees;
}

function cleanRule(v: unknown): FeeRule {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const flat = Number(o["flat"]);
  const percent = Number(o["percent"]);
  return {
    flat: Number.isFinite(flat) ? Math.min(MAX_FEE_FLAT, Math.max(0, Math.round(flat))) : 0,
    // Paling banyak dua desimal (0,01%), supaya hitungan tetap bilangan bulat.
    percent: Number.isFinite(percent) ? Math.min(MAX_FEE_PERCENT, Math.max(0, Math.round(percent * 100) / 100)) : 0,
  };
}

/** Membaca isi kolom jsonb dengan toleran: metode yang hilang atau nilai aneh dianggap tanpa biaya. */
export function normalizeFees(v: unknown): MidtransFees {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = emptyFees();
  for (const id of MIDTRANS_METHOD_IDS) out[id] = cleanRule(src[id]);
  return out;
}

/** Biaya (Rp, bulat ke atas) untuk nominal pesanan tertentu. Dihitung dengan bilangan bulat agar 0,7% dari 100.000 tepat 700. */
export function computeFee(rule: FeeRule | undefined, amount: number): number {
  if (!rule) return 0;
  const r = cleanRule(rule);
  const basisPoints = Math.round(r.percent * 100);
  const base = Math.round(amount);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.ceil(r.flat + (base * basisPoints) / 10_000);
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const pct = (n: number) => `${String(n).replace(".", ",")}%`;

/** Teks singkat aturan biaya, mis. "Rp4.000", "0,7%", "Rp2.000 + 0,7%" atau "Gratis". */
export function feeRuleLabel(rule: FeeRule | undefined): string {
  const r = cleanRule(rule);
  if (r.flat > 0 && r.percent > 0) return `${rp(r.flat)} + ${pct(r.percent)}`;
  if (r.flat > 0) return rp(r.flat);
  if (r.percent > 0) return pct(r.percent);
  return "Gratis";
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
