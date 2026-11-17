import { describe, expect, it } from "vitest";
import { SERVICE_STAGE_TRANSITIONS, canStageMove, type ServiceOrderStage } from "./services";
import {
  BUYER_GROUPS, BUYER_STAGE_HINT, REVIEW_COMMENT_MAX, buyerGroup, canLeaveReview, canReplyReview, cancelReasonErrors, cancelUi, replyErrors, reviewErrors,
} from "./services-buyer";

describe("kelompok dashboard pembeli", () => {
  it("menunggu pembayaran dan hasil yang menunggu diperiksa adalah tindakan pembeli", () => {
    expect(buyerGroup("awaiting_payment")).toBe("needs_action");
    expect(buyerGroup("submitted")).toBe("needs_action");
  });
  it("kelompok lain", () => {
    expect(buyerGroup("payment_processing")).toBe("working");
    expect(buyerGroup("pending_seller_acceptance")).toBe("working");
    expect(buyerGroup("in_progress")).toBe("working");
    expect(buyerGroup("revision_requested")).toBe("working");
    expect(buyerGroup("cancel_requested")).toBe("issues");
    expect(buyerGroup("disputed")).toBe("issues");
    expect(buyerGroup("completed")).toBe("done");
    expect(buyerGroup("cancelled")).toBe("closed");
    expect(buyerGroup("refunded")).toBe("closed");
    expect(buyerGroup("partially_refunded")).toBe("closed");
  });
  it("setiap stage punya kelompok yang valid (pembeli melihat semua stage miliknya)", () => {
    for (const s of Object.keys(SERVICE_STAGE_TRANSITIONS) as ServiceOrderStage[]) expect(BUYER_GROUPS).toContain(buyerGroup(s));
  });
  it("stage yang butuh tindakan atau berjalan punya keterangan", () => {
    for (const s of ["awaiting_payment", "pending_seller_acceptance", "in_progress", "submitted", "cancel_requested"] as const) expect(BUYER_STAGE_HINT[s]).toBeTruthy();
  });
});

describe("tampilan pembatalan", () => {
  const buyer = "u-buyer";
  const seller = "u-seller";
  it("sebelum diterima: hanya pembeli yang bisa membatalkan (penjual memakai Tolak)", () => {
    expect(cancelUi("pending_seller_acceptance", "buyer", null, buyer)).toBe("request");
    expect(cancelUi("pending_seller_acceptance", "seller", null, seller)).toBe("none");
  });
  it("saat dikerjakan atau revisi: kedua pihak bisa mengajukan", () => {
    for (const st of ["in_progress", "revision_requested"] as const) {
      expect(cancelUi(st, "buyer", null, buyer)).toBe("request");
      expect(cancelUi(st, "seller", null, seller)).toBe("request");
    }
  });
  it("setelah diajukan: peminta menunggu, pihak lawan menjawab", () => {
    expect(cancelUi("cancel_requested", "buyer", buyer, buyer)).toBe("waiting");
    expect(cancelUi("cancel_requested", "seller", buyer, seller)).toBe("respond");
    expect(cancelUi("cancel_requested", "buyer", seller, buyer)).toBe("respond");
    expect(cancelUi("cancel_requested", "seller", null, seller)).toBe("none");
  });
  it("tidak ada pembatalan setelah hasil dikirim, selesai, atau untuk orang lain", () => {
    for (const st of ["submitted", "completed", "cancelled", "disputed", "awaiting_payment"] as const) expect(cancelUi(st, "buyer", null, buyer)).toBe("none");
    expect(cancelUi("in_progress", null, null, "orang-lain")).toBe("none");
    expect(cancelUi("in_progress", "buyer", null, null)).toBe("none");
  });
  it("transisi yang dipakai pembatalan sah di mesin status", () => {
    expect(canStageMove("pending_seller_acceptance", "cancelled")).toBe(true);
    expect(canStageMove("in_progress", "cancel_requested")).toBe(true);
    expect(canStageMove("revision_requested", "cancel_requested")).toBe(true);
    expect(canStageMove("cancel_requested", "cancelled")).toBe(true);
    expect(canStageMove("cancel_requested", "in_progress")).toBe(true);
    expect(canStageMove("cancel_requested", "revision_requested")).toBe(true);
  });
  it("alasan pembatalan 10 sampai 1000 karakter", () => {
    expect(cancelReasonErrors("pendek")).toHaveLength(1);
    expect(cancelReasonErrors("Kebutuhan berubah total")).toEqual([]);
    expect(cancelReasonErrors("x".repeat(1001))).toHaveLength(1);
  });
});

describe("ulasan", () => {
  it("pembeli memberi ulasan sekali setelah selesai", () => {
    expect(canLeaveReview("completed", "buyer", false)).toBe(true);
    expect(canLeaveReview("completed", "buyer", true)).toBe(false);
    expect(canLeaveReview("submitted", "buyer", false)).toBe(false);
    expect(canLeaveReview("completed", "seller", false)).toBe(false);
    expect(canLeaveReview(null, "buyer", false)).toBe(false);
  });
  it("penjual membalas sekali dan hanya bila ada ulasan", () => {
    expect(canReplyReview("seller", true, false)).toBe(true);
    expect(canReplyReview("seller", true, true)).toBe(false);
    expect(canReplyReview("seller", false, false)).toBe(false);
    expect(canReplyReview("buyer", true, false)).toBe(false);
  });
  it("nilai harus bilangan bulat 1 sampai 5, komentar opsional maks 1000", () => {
    expect(reviewErrors({ rating: 5, comment: "" })).toEqual([]);
    expect(reviewErrors({ rating: 1, comment: "Kurang sesuai" })).toEqual([]);
    expect(reviewErrors({ rating: 0, comment: "" })).toHaveLength(1);
    expect(reviewErrors({ rating: 6, comment: "" })).toHaveLength(1);
    expect(reviewErrors({ rating: 3.5, comment: "" })).toHaveLength(1);
    expect(reviewErrors({ rating: 4, comment: "x".repeat(REVIEW_COMMENT_MAX + 1) })).toHaveLength(1);
  });
  it("balasan 2 sampai 1000 karakter", () => {
    expect(replyErrors("")).toHaveLength(1);
    expect(replyErrors("Terima kasih")).toEqual([]);
    expect(replyErrors("x".repeat(1001))).toHaveLength(1);
  });
});
