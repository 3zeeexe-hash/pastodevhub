import { describe, expect, it } from "vitest";
import {
  calcServiceOrderPricing, canRequestRevision, canStageMove, isPubliclyVisible, revisionQuota, serviceOrderActions,
  serviceOwnerMoveOk, startingPrice, validatePackages,
} from "./services";

describe("harga pesanan", () => {
  it("jasa Rp500.000 dengan komisi 5% = komisi Rp25.000, penjual Rp475.000", () => {
    const p = calcServiceOrderPricing({ packagePrice: 500_000, packageDays: 5, packageRevisions: 2, commissionPercent: 5 });
    expect(p).toMatchObject({ subtotal: 500_000, total: 500_000, commission: 25_000, sellerNet: 475_000, deliveryDays: 5, revisions: 2 });
  });
  it("add-on menambah harga, hari, dan revisi sesuai jumlahnya", () => {
    const p = calcServiceOrderPricing({
      packagePrice: 350_000, packageDays: 5, packageRevisions: 2, commissionPercent: 5,
      addons: [{ price: 100_000, quantity: 2, extraDays: 1 }, { price: 50_000, extraRevisions: 1 }],
    });
    expect(p.subtotal).toBe(600_000);
    expect(p.deliveryDays).toBe(7);
    expect(p.revisions).toBe(3);
    expect(p.commission + p.sellerNet).toBe(p.subtotal);
  });
  it("menolak harga, jumlah, atau komisi tidak valid", () => {
    expect(() => calcServiceOrderPricing({ packagePrice: 0, packageDays: 1, packageRevisions: 0, commissionPercent: 5 })).toThrow();
    expect(() => calcServiceOrderPricing({ packagePrice: 1000.5, packageDays: 1, packageRevisions: 0, commissionPercent: 5 })).toThrow();
    expect(() => calcServiceOrderPricing({ packagePrice: 1000, packageDays: 1, packageRevisions: 0, commissionPercent: 80 })).toThrow();
    expect(() => calcServiceOrderPricing({ packagePrice: 1000, packageDays: 1, packageRevisions: 0, commissionPercent: 5, addons: [{ price: 10, quantity: 11 }] })).toThrow();
    expect(() => calcServiceOrderPricing({ packagePrice: 1000, packageDays: 1, packageRevisions: 0, commissionPercent: 5, addons: [{ price: -5 }] })).toThrow();
  });
});

describe("paket", () => {
  const basic = { tier: "basic" as const, name: "Landing page sederhana", price: 150_000, delivery_days: 3, revisions: 1 };
  const standard = { tier: "standard" as const, name: "Landing page profesional", price: 350_000, delivery_days: 5, revisions: 2 };
  const premium = { tier: "premium" as const, name: "Company profile", price: 750_000, delivery_days: 7, revisions: 3 };
  it("contoh tiga paket dan satu paket valid", () => {
    expect(validatePackages([basic, standard, premium])).toEqual([]);
    expect(validatePackages([basic])).toEqual([]);
  });
  it("dua paket, tingkat ganda, atau paket tunggal bukan Basic ditolak", () => {
    expect(validatePackages([basic, standard]).length).toBeGreaterThan(0);
    expect(validatePackages([basic, { ...standard, tier: "basic" }, premium]).length).toBeGreaterThan(0);
    expect(validatePackages([standard]).length).toBeGreaterThan(0);
  });
  it("harga, hari, dan revisi divalidasi", () => {
    expect(validatePackages([{ ...basic, price: 0 }]).length).toBeGreaterThan(0);
    expect(validatePackages([{ ...basic, delivery_days: 0 }]).length).toBeGreaterThan(0);
    expect(validatePackages([{ ...basic, revisions: -1 }]).length).toBeGreaterThan(0);
    expect(validatePackages([{ ...basic, name: "  " }]).length).toBeGreaterThan(0);
  });
  it("harga mulai dari memakai paket aktif termurah", () => {
    expect(startingPrice([basic, standard, premium])).toBe(150_000);
    expect(startingPrice([{ price: 150_000, is_active: false }, { price: 350_000 }])).toBe(350_000);
    expect(startingPrice([])).toBeNull();
  });
});

describe("status jasa", () => {
  const open = { moderated: false, adminHold: false, wasPublished: false };
  it("jasa terbit tapi tidak aktif, atau aktif tapi belum terbit, tidak tampil", () => {
    expect(isPubliclyVisible({ status: "published", is_active: true })).toBe(true);
    expect(isPubliclyVisible({ status: "published", is_active: false })).toBe(false);
    expect(isPubliclyVisible({ status: "draft", is_active: true })).toBe(false);
    expect(isPubliclyVisible({ status: "pending_review", is_active: true })).toBe(false);
  });
  it("dengan moderasi, pemilik tidak bisa menerbitkan langsung dari draft atau ditolak", () => {
    expect(serviceOwnerMoveOk("draft", "published", open)).toBe(true);
    expect(serviceOwnerMoveOk("draft", "published", { ...open, moderated: true })).toBe(false);
    expect(serviceOwnerMoveOk("draft", "pending_review", { ...open, moderated: true })).toBe(true);
    expect(serviceOwnerMoveOk("rejected", "published", open)).toBe(false);
    expect(serviceOwnerMoveOk("pending_review", "published", open)).toBe(false);
  });
  it("jasa ditahan admin tidak bisa dibuka pemilik; jasa yang dijeda sendiri bisa dibuka lagi", () => {
    expect(serviceOwnerMoveOk("paused", "published", { ...open, adminHold: true, wasPublished: true })).toBe(false);
    expect(serviceOwnerMoveOk("paused", "archived", { ...open, adminHold: true })).toBe(false);
    expect(serviceOwnerMoveOk("paused", "published", { moderated: true, adminHold: false, wasPublished: true })).toBe(true);
    expect(serviceOwnerMoveOk("paused", "published", { moderated: true, adminHold: false, wasPublished: false })).toBe(false);
  });
});

describe("status pesanan", () => {
  it("pembayaran dan refund tidak bisa dilompati", () => {
    expect(canStageMove("awaiting_payment", "paid")).toBe(true);
    expect(canStageMove("awaiting_payment", "in_progress")).toBe(false);
    expect(canStageMove("awaiting_payment", "refunded")).toBe(false);
    expect(canStageMove("in_progress", "completed")).toBe(false);
    expect(canStageMove("submitted", "completed")).toBe(true);
    expect(canStageMove("cancelled", "refunded")).toBe(true);
  });
  it("status akhir tidak bisa berubah lagi", () => {
    expect(canStageMove("completed", "in_progress")).toBe(false);
    expect(canStageMove("refunded", "completed")).toBe(false);
    expect(canStageMove("partially_refunded", "refunded")).toBe(false);
  });
  it("sengketa bisa kembali ke alur kerja atau berakhir dengan refund", () => {
    expect(canStageMove("in_progress", "disputed")).toBe(true);
    expect(canStageMove("disputed", "partially_refunded")).toBe(true);
    expect(canStageMove("disputed", "submitted")).toBe(true);
  });
});

describe("revisi", () => {
  it("kuota habis menolak revisi", () => {
    expect(revisionQuota({ included: 2, used: 1 })).toEqual({ total: 2, used: 1, left: 1 });
    expect(canRequestRevision({ included: 2, used: 1 })).toBe(true);
    expect(canRequestRevision({ included: 2, used: 2 })).toBe(false);
    expect(canRequestRevision({ included: 0, used: 0 })).toBe(false);
  });
});

describe("hak aksi pesanan", () => {
  const o = { buyer_id: "b1", seller_id: "s1" };
  const base = { stage: "submitted" as const, revisionsIncluded: 1, revisionsUsed: 0, hasReview: false, hasActiveDispute: false };
  it("hanya pembeli yang menyetujui dan meminta revisi", () => {
    expect(serviceOrderActions(o, base, "b1").approve).toBe(true);
    expect(serviceOrderActions(o, base, "s1").approve).toBe(false);
    expect(serviceOrderActions(o, base, "orang-lain").approve).toBe(false);
    expect(serviceOrderActions(o, base, null).approve).toBe(false);
    expect(serviceOrderActions(o, base, "b1").requestRevision).toBe(true);
  });
  it("kuota revisi habis: pembeli ditawari add-on revisi, bukan revisi gratis", () => {
    const a = serviceOrderActions(o, { ...base, revisionsUsed: 1 }, "b1");
    expect(a.requestRevision).toBe(false);
    expect(a.buyExtraRevision).toBe(true);
  });
  it("sengketa aktif menahan persetujuan; ulasan hanya setelah selesai dan sekali", () => {
    expect(serviceOrderActions(o, { ...base, hasActiveDispute: true }, "b1").approve).toBe(false);
    expect(serviceOrderActions(o, { ...base, stage: "completed" }, "b1").review).toBe(true);
    expect(serviceOrderActions(o, { ...base, stage: "completed", hasReview: true }, "b1").review).toBe(false);
    expect(serviceOrderActions(o, { ...base, stage: "in_progress" }, "b1").review).toBe(false);
  });
  it("penjual menerima pesanan dan mengirim hasil sesuai tahap", () => {
    expect(serviceOrderActions(o, { ...base, stage: "pending_seller_acceptance" }, "s1").accept).toBe(true);
    expect(serviceOrderActions(o, { ...base, stage: "pending_seller_acceptance" }, "b1").accept).toBe(false);
    expect(serviceOrderActions(o, { ...base, stage: "in_progress" }, "s1").submitWork).toBe(true);
    expect(serviceOrderActions(o, { ...base, stage: "revision_requested" }, "s1").submitWork).toBe(true);
    expect(serviceOrderActions(o, { ...base, stage: "awaiting_payment" }, "s1").submitWork).toBe(false);
  });
});
