// GOBI SERVICES: aturan murni (tanpa database) untuk status jasa, status pesanan, revisi, dan harga.
// Cermin dari docs/sql/gobi-services/001_gobi_services_core.sql — database tetap penentu akhir.
import { calcCommission, validAmount } from "./work";

// ============ Status jasa ============
export type ServiceStatus = "draft" | "pending_review" | "published" | "rejected" | "paused" | "archived";

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  draft: "Draft",
  pending_review: "Menunggu moderasi",
  published: "Terbit",
  rejected: "Ditolak",
  paused: "Dijeda",
  archived: "Diarsipkan",
};

/** Jasa tampil di marketplace publik hanya jika terbit dan aktif. */
export function isPubliclyVisible(s: { status: ServiceStatus; is_active: boolean }) {
  return s.status === "published" && s.is_active;
}

export type OwnerMoveContext = { moderated: boolean; adminHold: boolean; wasPublished: boolean };

/** Perpindahan status yang boleh dilakukan pemilik jasa (cermin `_service_owner_move_ok`). Admin tidak dibatasi daftar ini. */
export function serviceOwnerMoveOk(from: ServiceStatus, to: ServiceStatus, ctx: OwnerMoveContext): boolean {
  if (from === to) return true;
  switch (from) {
    case "draft":
      return to === "pending_review" || to === "archived" || (to === "published" && !ctx.moderated);
    case "pending_review":
      return to === "draft";
    case "published":
      return to === "paused" || to === "archived";
    case "paused":
      return (to === "archived" && !ctx.adminHold) || (to === "published" && !ctx.adminHold && (!ctx.moderated || ctx.wasPublished));
    case "rejected":
      return to === "draft" || to === "pending_review";
    case "archived":
      return to === "draft";
  }
}

// ============ Paket ============
export type PackageTier = "basic" | "standard" | "premium";
export const PACKAGE_TIERS: PackageTier[] = ["basic", "standard", "premium"];

export type PackageInput = {
  tier: PackageTier;
  name: string;
  price: number;
  delivery_days: number;
  revisions: number;
  is_active?: boolean;
};

/**
 * Seller memakai satu paket (Basic) atau tiga paket (Basic, Standard, Premium).
 * Mengembalikan daftar pesan galat; kosong berarti valid.
 */
export function validatePackages(pkgs: PackageInput[]): string[] {
  const errors: string[] = [];
  if (pkgs.length !== 1 && pkgs.length !== 3) errors.push("Pakai satu paket atau tiga paket.");
  const tiers = pkgs.map((p) => p.tier);
  if (new Set(tiers).size !== tiers.length) errors.push("Tiap tingkat paket hanya boleh satu.");
  if (pkgs.length === 1 && tiers[0] !== "basic") errors.push("Paket tunggal memakai tingkat Basic.");
  if (pkgs.length === 3 && !PACKAGE_TIERS.every((t) => tiers.includes(t))) errors.push("Tiga paket harus Basic, Standard, dan Premium.");
  for (const p of pkgs) {
    if (!p.name.trim()) errors.push(`Nama paket ${p.tier} kosong.`);
    if (!validAmount(p.price)) errors.push(`Harga paket ${p.tier} harus bilangan bulat positif.`);
    if (!Number.isInteger(p.delivery_days) || p.delivery_days < 1 || p.delivery_days > 365) errors.push(`Waktu pengerjaan paket ${p.tier} harus 1 sampai 365 hari.`);
    if (!Number.isInteger(p.revisions) || p.revisions < 0 || p.revisions > 99) errors.push(`Jumlah revisi paket ${p.tier} harus 0 sampai 99.`);
  }
  return errors;
}

/** "Harga mulai dari": harga paket aktif termurah, atau null kalau tidak ada. */
export function startingPrice(pkgs: { price: number; is_active?: boolean }[]): number | null {
  const live = pkgs.filter((p) => p.is_active !== false && validAmount(p.price));
  return live.length ? Math.min(...live.map((p) => p.price)) : null;
}

// ============ Harga pesanan (dihitung ulang di server; ini cermin untuk tampilan dan tes) ============
export type AddonInput = { price: number; quantity?: number; extraDays?: number; extraRevisions?: number };

export type OrderPricingInput = {
  packagePrice: number;
  packageDays: number;
  packageRevisions: number;
  addons?: AddonInput[];
  /** Persen komisi aktif dari pengaturan admin (0–50). */
  commissionPercent: number;
};

/**
 * Total = harga paket + add-on. Komisi dipotong dari penjual, bukan ditambahkan ke pembeli
 * (biaya layanan pembeli belum ada: menunggu keputusan desain escrow di Fase 6).
 */
export function calcServiceOrderPricing(input: OrderPricingInput) {
  if (!validAmount(input.packagePrice)) throw new Error("Harga paket tidak valid");
  if (!Number.isInteger(input.packageDays) || input.packageDays < 1) throw new Error("Waktu pengerjaan tidak valid");
  if (!Number.isInteger(input.packageRevisions) || input.packageRevisions < 0) throw new Error("Jumlah revisi tidak valid");
  let subtotal = input.packagePrice;
  let deliveryDays = input.packageDays;
  let revisions = input.packageRevisions;
  for (const a of input.addons ?? []) {
    const qty = a.quantity ?? 1;
    const days = a.extraDays ?? 0;
    const revs = a.extraRevisions ?? 0;
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new Error("Jumlah add-on harus 1 sampai 10");
    if (!validAmount(a.price)) throw new Error("Harga add-on tidak valid");
    if (!Number.isInteger(days) || days < 0 || !Number.isInteger(revs) || revs < 0) throw new Error("Tambahan add-on tidak valid");
    subtotal += a.price * qty;
    deliveryDays += days * qty;
    revisions += revs * qty;
  }
  if (!validAmount(subtotal)) throw new Error("Total melebihi batas");
  const { fee, net } = calcCommission(subtotal, input.commissionPercent);
  return { subtotal, total: subtotal, commission: fee, sellerNet: net, deliveryDays, revisions };
}

// ============ Revisi ============
export function revisionQuota(o: { included: number; used: number }) {
  return { total: o.included, used: o.used, left: Math.max(0, o.included - o.used) };
}

/** Revisi hanya boleh diminta selama kuota masih ada; selebihnya butuh add-on revisi yang menambah `included`. */
export function canRequestRevision(o: { included: number; used: number }) {
  return revisionQuota(o).left > 0;
}

// ============ Status pesanan ============
export type ServiceOrderStage =
  | "awaiting_payment" | "payment_processing" | "paid" | "pending_seller_acceptance" | "in_progress"
  | "submitted" | "revision_requested" | "completed" | "cancel_requested" | "cancelled"
  | "disputed" | "refunded" | "partially_refunded";

export const SERVICE_STAGE_LABEL: Record<ServiceOrderStage, string> = {
  awaiting_payment: "Menunggu pembayaran",
  payment_processing: "Pembayaran diproses",
  paid: "Dibayar",
  pending_seller_acceptance: "Menunggu persetujuan penjual",
  in_progress: "Dikerjakan",
  submitted: "Hasil dikirim",
  revision_requested: "Revisi diminta",
  completed: "Selesai",
  cancel_requested: "Pembatalan diajukan",
  cancelled: "Dibatalkan",
  disputed: "Sengketa",
  refunded: "Dikembalikan",
  partially_refunded: "Dikembalikan sebagian",
};

/** Cermin `_service_stage_ok`. `paid` hanya dari pembayaran terverifikasi; refund hanya setelah konfirmasi provider. */
export const SERVICE_STAGE_TRANSITIONS: Record<ServiceOrderStage, ServiceOrderStage[]> = {
  awaiting_payment: ["payment_processing", "paid", "cancelled"],
  payment_processing: ["paid", "awaiting_payment", "cancelled"],
  paid: ["pending_seller_acceptance", "in_progress", "refunded"],
  pending_seller_acceptance: ["in_progress", "cancelled", "refunded"],
  in_progress: ["submitted", "cancel_requested", "disputed"],
  submitted: ["completed", "revision_requested", "disputed"],
  revision_requested: ["submitted", "cancel_requested", "disputed"],
  cancel_requested: ["cancelled", "in_progress", "submitted", "revision_requested", "disputed", "refunded"],
  disputed: ["in_progress", "submitted", "revision_requested", "completed", "cancelled", "refunded", "partially_refunded"],
  cancelled: ["refunded", "partially_refunded"],
  completed: [],
  refunded: [],
  partially_refunded: [],
};

export function canStageMove(from: ServiceOrderStage, to: ServiceOrderStage) {
  return SERVICE_STAGE_TRANSITIONS[from].includes(to);
}

export type OrderParty = { buyer_id: string; seller_id: string };

export type OrderActionState = {
  stage: ServiceOrderStage;
  revisionsIncluded: number;
  revisionsUsed: number;
  hasReview: boolean;
  hasActiveDispute: boolean;
};

/** Siapa boleh melakukan apa pada pesanan jasa. Aturan sebenarnya ada di fungsi database. */
export function serviceOrderActions(o: OrderParty, s: OrderActionState, uid: string | null) {
  const buyer = !!uid && o.buyer_id === uid;
  const seller = !!uid && o.seller_id === uid;
  const working = s.stage === "in_progress" || s.stage === "revision_requested";
  return {
    pay: buyer && s.stage === "awaiting_payment",
    cancelUnpaid: buyer && s.stage === "awaiting_payment",
    accept: seller && s.stage === "pending_seller_acceptance",
    decline: seller && s.stage === "pending_seller_acceptance",
    submitWork: seller && working,
    approve: buyer && s.stage === "submitted" && !s.hasActiveDispute,
    requestRevision: buyer && s.stage === "submitted" && canRequestRevision({ included: s.revisionsIncluded, used: s.revisionsUsed }),
    buyExtraRevision: buyer && s.stage === "submitted" && !canRequestRevision({ included: s.revisionsIncluded, used: s.revisionsUsed }),
    requestCancel: (buyer || seller) && working,
    openDispute: (buyer || seller) && !s.hasActiveDispute && (working || s.stage === "submitted" || s.stage === "cancel_requested"),
    review: buyer && s.stage === "completed" && !s.hasReview,
  };
}
