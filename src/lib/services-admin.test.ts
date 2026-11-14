import { describe, expect, it } from "vitest";
import {
  MODERATION_RESULT, moderationActions, moderationEventLabel, moderationReasonError, type ModerationAction,
} from "./services-admin";
import { serviceOwnerMoveOk, type ServiceStatus } from "./services";

describe("aksi moderasi per status", () => {
  it("jasa menunggu moderasi bisa disetujui, ditolak, atau diminta perbaikan", () => {
    expect(moderationActions({ status: "pending_review", adminHold: false })).toEqual(["approve", "request_changes", "reject"]);
  });
  it("hanya jasa terbit yang bisa ditahan, dan hanya jasa ditahan yang bisa dibuka", () => {
    expect(moderationActions({ status: "published", adminHold: false })).toEqual(["hold"]);
    expect(moderationActions({ status: "paused", adminHold: true })).toEqual(["release"]);
    expect(moderationActions({ status: "paused", adminHold: false })).toEqual([]);
  });
  it("draft, ditolak, dan arsip tidak punya aksi moderasi", () => {
    for (const s of ["draft", "rejected", "archived"] as ServiceStatus[]) {
      expect(moderationActions({ status: s, adminHold: false })).toEqual([]);
    }
  });
  it("tahanan admin tidak bisa dilepas pemilik, tetapi aksi admin membukanya", () => {
    expect(serviceOwnerMoveOk("paused", "published", { moderated: false, adminHold: true, wasPublished: true })).toBe(false);
    const a: ModerationAction = "release";
    expect(MODERATION_RESULT[a]).toBe("published");
  });
});

describe("alasan moderasi", () => {
  it("persetujuan tidak butuh alasan", () => {
    expect(moderationReasonError("approve", "")).toBeNull();
  });
  it("tolak, minta perbaikan, tahan, dan buka tahanan wajib beralasan minimal 10 karakter", () => {
    for (const a of ["reject", "request_changes", "hold", "release"] as ModerationAction[]) {
      expect(moderationReasonError(a, "singkat")).not.toBeNull();
      expect(moderationReasonError(a, "   pendek   ")).not.toBeNull();
      expect(moderationReasonError(a, "Deskripsi tidak sesuai kebijakan")).toBeNull();
    }
  });
  it("catatan terlalu panjang ditolak", () => {
    expect(moderationReasonError("reject", "x".repeat(1001))).not.toBeNull();
    expect(moderationReasonError("approve", "x".repeat(1001))).not.toBeNull();
  });
});

describe("label riwayat", () => {
  it("aksi admin dan pengajuan punya label sendiri", () => {
    expect(moderationEventLabel({ action: "approve", from_status: "pending_review", to_status: "published" })).toBe("Disetujui admin");
    expect(moderationEventLabel({ action: "request_changes", from_status: "pending_review", to_status: "draft" })).toBe("Admin meminta perbaikan");
    expect(moderationEventLabel({ action: "submitted", from_status: "draft", to_status: "pending_review" })).toBe("Diajukan untuk moderasi");
    expect(moderationEventLabel({ action: "submitted", from_status: "draft", to_status: "published" })).toBe("Diterbitkan penjual");
  });
  it("perubahan lain menampilkan status asal dan tujuan", () => {
    expect(moderationEventLabel({ action: "status_change", from_status: "published", to_status: "paused" })).toBe("Status: Terbit → Dijeda");
  });
});
