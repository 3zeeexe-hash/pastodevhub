import { describe, expect, it } from "vitest";
import { canStageMove, SERVICE_STAGE_TRANSITIONS, type ServiceOrderStage } from "./services";
import {
  SELLER_GROUPS, composeDeliveryNote, declineErrors, dueState, revisionErrors, sellerGroup, submitWorkErrors, workflowPanel,
} from "./services-workflow";

describe("kelompok dashboard penjual", () => {
  it("pesanan yang belum dibayar tidak tampil ke penjual", () => {
    expect(sellerGroup("awaiting_payment")).toBeNull();
    expect(sellerGroup("payment_processing")).toBeNull();
  });
  it("pesanan yang menunggu keputusan atau revisi masuk 'perlu tindakan'", () => {
    expect(sellerGroup("pending_seller_acceptance")).toBe("needs_action");
    expect(sellerGroup("revision_requested")).toBe("needs_action");
  });
  it("kelompok lain", () => {
    expect(sellerGroup("in_progress")).toBe("working");
    expect(sellerGroup("submitted")).toBe("submitted");
    expect(sellerGroup("disputed")).toBe("issues");
    expect(sellerGroup("completed")).toBe("done");
    expect(sellerGroup("cancelled")).toBe("closed");
    expect(sellerGroup("refunded")).toBe("closed");
  });
  it("setiap stage yang dibayar punya kelompok yang valid", () => {
    for (const s of Object.keys(SERVICE_STAGE_TRANSITIONS) as ServiceOrderStage[]) {
      const g = sellerGroup(s);
      if (g !== null) expect(SELLER_GROUPS).toContain(g);
    }
  });
});

describe("tenggat", () => {
  const now = new Date(2026, 10, 17, 10, 0, 0);
  it("tanpa tenggat", () => {
    expect(dueState(null, now).kind).toBe("none");
    expect(dueState("bukan tanggal", now).kind).toBe("none");
  });
  it("hari ini, segera, aman, dan terlambat", () => {
    expect(dueState(new Date(2026, 10, 17, 23, 0).toISOString(), now)).toMatchObject({ kind: "today", days: 0 });
    expect(dueState(new Date(2026, 10, 19, 9, 0).toISOString(), now)).toMatchObject({ kind: "soon", days: 2, label: "Sisa 2 hari" });
    expect(dueState(new Date(2026, 10, 25, 9, 0).toISOString(), now)).toMatchObject({ kind: "ok", days: 8 });
    expect(dueState(new Date(2026, 10, 15, 9, 0).toISOString(), now)).toMatchObject({ kind: "overdue", days: -2, label: "Terlambat 2 hari" });
  });
});

describe("panel di halaman pesanan", () => {
  it("penjual memutuskan saat pesanan menunggu, mengirim hasil saat dikerjakan atau revisi", () => {
    expect(workflowPanel("pending_seller_acceptance", "seller").panel).toBe("decide");
    expect(workflowPanel("in_progress", "seller").panel).toBe("submit");
    expect(workflowPanel("revision_requested", "seller").panel).toBe("submit");
    expect(workflowPanel("submitted", "seller")).toEqual({ panel: "waiting", waitingFor: "pembeli" });
  });
  it("pembeli memeriksa hasil saat dikirim dan menunggu penjual di tahap lain", () => {
    expect(workflowPanel("submitted", "buyer").panel).toBe("review");
    expect(workflowPanel("pending_seller_acceptance", "buyer")).toEqual({ panel: "waiting", waitingFor: "penjual" });
    expect(workflowPanel("in_progress", "buyer")).toEqual({ panel: "waiting", waitingFor: "penjual" });
  });
  it("pembeli tidak pernah mendapat panel penjual dan sebaliknya; admin dan pihak lain tidak mendapat panel", () => {
    expect(workflowPanel("pending_seller_acceptance", "buyer").panel).not.toBe("decide");
    expect(workflowPanel("submitted", "seller").panel).not.toBe("review");
    expect(workflowPanel("submitted", "admin").panel).toBe("none");
    expect(workflowPanel("submitted", null).panel).toBe("none");
    expect(workflowPanel("completed", "seller").panel).toBe("none");
  });
  it("tindakan yang ditawarkan panel adalah transisi sah di mesin status", () => {
    expect(canStageMove("pending_seller_acceptance", "in_progress")).toBe(true);
    expect(canStageMove("pending_seller_acceptance", "cancelled")).toBe(true);
    expect(canStageMove("in_progress", "submitted")).toBe(true);
    expect(canStageMove("revision_requested", "submitted")).toBe(true);
    expect(canStageMove("submitted", "completed")).toBe(true);
    expect(canStageMove("submitted", "revision_requested")).toBe(true);
  });
});

describe("validasi kirim hasil", () => {
  const ok = { note: "Hasil sudah selesai, silakan dicek.", demoUrl: "https://demo.contoh.id", repoUrl: "", attachments: [] };
  it("catatan dan minimal satu tautan atau lampiran", () => {
    expect(submitWorkErrors(ok)).toEqual([]);
    expect(submitWorkErrors({ ...ok, demoUrl: "", repoUrl: "https://github.com/x/y" })).toEqual([]);
    expect(submitWorkErrors({ ...ok, demoUrl: "", attachments: [{ url: "https://x.id/a.png", name: "a" }] })).toEqual([]);
    expect(submitWorkErrors({ ...ok, demoUrl: "" })).toHaveLength(1);
    expect(submitWorkErrors({ ...ok, note: "singkat" })).toHaveLength(1);
  });
  it("tautan harus https", () => {
    expect(submitWorkErrors({ ...ok, demoUrl: "http://demo.id" })).toHaveLength(1);
    expect(submitWorkErrors({ ...ok, repoUrl: "javascript:alert(1)" })).toHaveLength(1);
  });
  it("maksimal 5 lampiran", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ url: `https://x.id/${i}`, name: "n" }));
    expect(submitWorkErrors({ ...ok, attachments: many })).toHaveLength(1);
  });
  it("catatan lama gabungan catatan dan tautan, maks 4000", () => {
    const note = composeDeliveryNote({ note: "Selesai", demoUrl: "https://d.id", repoUrl: "https://r.id", attachments: [{ url: "https://x.id/a", name: "" }, { url: "https://x.id/b", name: "Desain" }] });
    expect(note).toBe("Selesai\n\nDemo: https://d.id\n\nRepositori: https://r.id\nLampiran: https://x.id/a\nDesain: https://x.id/b");
    expect(composeDeliveryNote({ note: "x".repeat(5000), demoUrl: "", repoUrl: "", attachments: [] })).toHaveLength(4000);
  });
});

describe("validasi revisi dan penolakan", () => {
  it("revisi butuh catatan dan jatah tersisa", () => {
    expect(revisionErrors({ note: "Ganti warna tombol menjadi biru", used: 0, included: 2 })).toEqual([]);
    expect(revisionErrors({ note: "pendek", used: 0, included: 2 })).toHaveLength(1);
    expect(revisionErrors({ note: "Ganti warna tombol menjadi biru", used: 2, included: 2 })).toHaveLength(1);
    expect(revisionErrors({ note: "Ganti warna tombol menjadi biru", used: 0, included: 0 })).toHaveLength(1);
  });
  it("penolakan wajib beralasan", () => {
    expect(declineErrors("")).toHaveLength(1);
    expect(declineErrors("Jadwal penuh bulan ini")).toEqual([]);
    expect(declineErrors("x".repeat(1001))).toHaveLength(1);
  });
});
