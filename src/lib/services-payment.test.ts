import { describe, expect, it } from "vitest";
import { canStageMove, SERVICE_STAGE_TRANSITIONS, type ServiceOrderStage } from "./services";
import {
  RECONCILE_LABEL, RECONCILE_URGENT, expectedStages, isStageConsistent, netAfterCommission, transactionStatus,
  type ReconcileCode,
} from "./services-payment";

describe("status transaksi", () => {
  it("lunas, menunggu, dan gagal", () => {
    expect(transactionStatus({ status: "paid", needs_refund: false, escrow_status: "held" })).toBe("paid");
    expect(transactionStatus({ status: "pending", needs_refund: false, escrow_status: null })).toBe("pending");
    for (const s of ["expired", "cancelled", "denied", "failed"] as const) {
      expect(transactionStatus({ status: s, needs_refund: false, escrow_status: null })).toBe("failed");
    }
    expect(transactionStatus({ status: "superseded", needs_refund: false, escrow_status: null })).toBe("superseded");
  });
  it("refund hanya dianggap selesai setelah escrow ditandai refund; sebelumnya 'perlu refund'", () => {
    expect(transactionStatus({ status: "paid", needs_refund: true, escrow_status: "frozen" })).toBe("refund_needed");
    expect(transactionStatus({ status: "paid", needs_refund: true, escrow_status: "refunded" })).toBe("refunded");
    expect(transactionStatus({ status: "paid", needs_refund: false, escrow_status: "refunded" })).toBe("refunded");
  });
});

describe("nilai bersih", () => {
  it("dikurangi komisi dan tidak pernah negatif", () => {
    expect(netAfterCommission(500_000, 25_000)).toBe(475_000);
    expect(netAfterCommission(1_000, 5_000)).toBe(0);
    expect(netAfterCommission(1_000, -50)).toBe(1_000);
  });
});

describe("kesesuaian stage dengan status pesanan lama", () => {
  it("status pesanan lama dipetakan ke stage yang masuk akal", () => {
    expect(isStageConsistent("awaiting_payment", "awaiting_payment")).toBe(true);
    expect(isStageConsistent("awaiting_payment", "payment_processing")).toBe(true);
    expect(isStageConsistent("in_progress", "in_progress")).toBe(true);
    expect(isStageConsistent("in_progress", "revision_requested")).toBe(true);
    expect(isStageConsistent("delivered", "submitted")).toBe(true);
    expect(isStageConsistent("completed", "completed")).toBe(true);
    expect(isStageConsistent("cancelled", "cancelled")).toBe(true);
  });
  it("pesanan dibayar tetapi stage masih menunggu pembayaran dianggap tertinggal", () => {
    expect(isStageConsistent("in_progress", "awaiting_payment")).toBe(false);
    expect(isStageConsistent("completed", "in_progress")).toBe(false);
    expect(isStageConsistent("delivered", "in_progress")).toBe(false);
  });
  it("status yang tidak dibandingkan selalu konsisten", () => {
    expect(expectedStages("requested")).toBeNull();
    expect(isStageConsistent("requested", "completed")).toBe(true);
  });
  it("setiap stage yang diharapkan benar-benar ada di mesin status", () => {
    const all = Object.keys(SERVICE_STAGE_TRANSITIONS) as ServiceOrderStage[];
    for (const status of ["awaiting_payment", "payment_review", "in_progress", "delivered", "completed", "cancelled"]) {
      const stages = expectedStages(status);
      expect(stages).not.toBeNull();
      for (const s of stages ?? []) expect(all).toContain(s);
    }
  });
});

describe("alur pembayaran penuh adalah rangkaian transisi yang sah", () => {
  const chain: ServiceOrderStage[] = [
    "awaiting_payment", "payment_processing", "paid", "in_progress", "submitted", "revision_requested", "submitted", "completed",
  ];
  it("setiap langkah diizinkan mesin status", () => {
    for (let i = 0; i < chain.length - 1; i++) expect(canStageMove(chain[i], chain[i + 1])).toBe(true);
  });
  it("pembayaran kedaluwarsa kembali ke menunggu pembayaran, dan lunas tidak bisa mundur", () => {
    expect(canStageMove("payment_processing", "awaiting_payment")).toBe(true);
    expect(canStageMove("in_progress", "payment_processing")).toBe(false);
    expect(canStageMove("in_progress", "awaiting_payment")).toBe(false);
  });
  it("tidak bisa melompat dari menunggu pembayaran ke dikerjakan atau selesai", () => {
    expect(canStageMove("awaiting_payment", "in_progress")).toBe(false);
    expect(canStageMove("awaiting_payment", "completed")).toBe(false);
  });
});

describe("rekonsiliasi", () => {
  it("setiap kode punya label dan masalah uang ditandai mendesak", () => {
    const codes = Object.keys(RECONCILE_LABEL) as ReconcileCode[];
    expect(codes).toHaveLength(8);
    for (const c of RECONCILE_URGENT) expect(RECONCILE_LABEL[c]).toBeTruthy();
    expect(RECONCILE_URGENT.has("stage_stale")).toBe(false);
    expect(RECONCILE_URGENT.has("needs_refund")).toBe(true);
  });
});
