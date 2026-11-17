import { describe, expect, it } from "vitest";
import type { OrderAction } from "./market";
import { LEGACY_FLOW_ACTIONS, isLegacyFlowHidden, pageActions, showWorkflowPanel } from "./services-order-page";

const sellerInProgress: OrderAction[] = ["deliver"];
const buyerDelivered: OrderAction[] = ["complete", "revise"];
const buyerRequested: OrderAction[] = ["cancel"];

describe("tombol alur lama di halaman pesanan", () => {
  it("pesanan paket: kirim hasil, selesai, dan revisi lama disembunyikan", () => {
    const f = { kind: "service" as const, isPackage: true, loading: false };
    expect(pageActions(sellerInProgress, f)).toEqual([]);
    expect(pageActions(buyerDelivered, f)).toEqual([]);
    expect(pageActions(["deliver", "complete", "revise", "cancel", "pay"], f)).toEqual(["cancel", "pay"]);
  });

  it("selama status paket belum diketahui, pesanan jasa tidak menampilkan tombol lama", () => {
    const f = { kind: "service" as const, isPackage: undefined, loading: true };
    expect(pageActions(sellerInProgress, f)).toEqual([]);
    expect(pageActions(buyerDelivered, f)).toEqual([]);
  });

  it("pesanan jasa lama (bukan paket) tetap memakai alur lama", () => {
    const f = { kind: "service" as const, isPackage: false, loading: false };
    expect(pageActions(sellerInProgress, f)).toEqual(sellerInProgress);
    expect(pageActions(buyerDelivered, f)).toEqual(buyerDelivered);
  });

  it("bila pemeriksaan paket gagal, tombol lama tetap ada (database yang menolak bila ternyata paket)", () => {
    const f = { kind: "service" as const, isPackage: undefined, loading: false };
    expect(pageActions(buyerDelivered, f)).toEqual(buyerDelivered);
  });

  it("pembelian karya tidak terpengaruh, bahkan saat kueri paket masih memuat", () => {
    expect(pageActions(buyerDelivered, { kind: "product", isPackage: undefined, loading: true })).toEqual(buyerDelivered);
    expect(pageActions(sellerInProgress, { kind: "product", isPackage: true, loading: false })).toEqual(sellerInProgress);
  });

  it("aksi selain alur lama tidak pernah disaring", () => {
    const f = { kind: "service" as const, isPackage: true, loading: false };
    expect(pageActions(buyerRequested, f)).toEqual(buyerRequested);
    expect(pageActions(["accept", "decline", "verify"], f)).toEqual(["accept", "decline", "verify"]);
  });

  it("daftar aksi lama persis tiga fungsi yang dijaga trigger SQL 007", () => {
    expect([...LEGACY_FLOW_ACTIONS].sort()).toEqual(["complete", "deliver", "revise"]);
    expect(isLegacyFlowHidden({ kind: "service", isPackage: true, loading: false })).toBe(true);
    expect(isLegacyFlowHidden({ kind: "service", isPackage: false, loading: false })).toBe(false);
  });
});

describe("panel alur pengerjaan", () => {
  it("hanya tampil untuk pesanan jasa yang terbukti pesanan paket", () => {
    expect(showWorkflowPanel({ kind: "service", isPackage: true })).toBe(true);
    expect(showWorkflowPanel({ kind: "service", isPackage: false })).toBe(false);
    expect(showWorkflowPanel({ kind: "service", isPackage: undefined })).toBe(false);
    expect(showWorkflowPanel({ kind: "product", isPackage: true })).toBe(false);
  });
});
