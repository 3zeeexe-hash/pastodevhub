import { describe, expect, it } from "vitest";
import { evidenceItems, pickEscrow, safeHttpUrl, summarizeTx } from "./admin-work";

describe("safeHttpUrl", () => {
  it("menerima http dan https", () => {
    expect(safeHttpUrl("https://contoh.id/bukti.png")).toBe("https://contoh.id/bukti.png");
    expect(safeHttpUrl("http://contoh.id")).toBe("http://contoh.id/");
  });
  it("menolak skema berbahaya dan nilai bukan string", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeHttpUrl("bukan url")).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("evidenceItems", () => {
  it("mengembalikan kosong untuk data yang bukan larik", () => {
    expect(evidenceItems(null)).toEqual([]);
    expect(evidenceItems({ a: 1 })).toEqual([]);
  });
  it("menormalkan string dan objek, tautan berbahaya tidak jadi url", () => {
    const out = evidenceItems([
      "https://contoh.id/a",
      "catatan biasa",
      { name: "Tangkapan layar", url: "https://contoh.id/b.png" },
      { name: "Jahat", url: "javascript:alert(1)" },
    ]);
    expect(out[0]).toEqual({ label: "https://contoh.id/a", url: "https://contoh.id/a" });
    expect(out[1]).toEqual({ label: "catatan biasa", url: null });
    expect(out[2]).toEqual({ label: "Tangkapan layar", url: "https://contoh.id/b.png" });
    expect(out[3]).toEqual({ label: "Jahat", url: null });
  });
  it("membatasi jumlah bukti", () => {
    expect(evidenceItems(Array.from({ length: 80 }, (_, i) => `b${i}`))).toHaveLength(50);
  });
});

describe("pickEscrow", () => {
  it("menerima objek maupun larik", () => {
    expect(pickEscrow({ fee: 5000, net: 95000, status: "held" })).toEqual({ fee: 5000, net: 95000, status: "held" });
    expect(pickEscrow([{ fee: 1, net: 2, status: "released" }])).toEqual({ fee: 1, net: 2, status: "released" });
  });
  it("null jika tidak ada catatan escrow", () => {
    expect(pickEscrow(null)).toBeNull();
    expect(pickEscrow([])).toBeNull();
    expect(pickEscrow({ fee: 1 })).toBeNull();
  });
});

describe("summarizeTx", () => {
  it("hanya menghitung pesanan yang sudah dibayar untuk volume dan komisi", () => {
    const s = summarizeTx([
      { amount: 2_000_000, paid_at: "2026-11-01T00:00:00Z", fee: 100_000, needsRefund: false },
      { amount: 500_000, paid_at: null, fee: 25_000, needsRefund: false },
      { amount: 300_000, paid_at: "2026-11-02T00:00:00Z", fee: 15_000, needsRefund: true },
    ]);
    expect(s).toEqual({ volume: 2_300_000, commission: 115_000, paid: 2, refund: 1 });
  });
  it("nol untuk daftar kosong", () => {
    expect(summarizeTx([])).toEqual({ volume: 0, commission: 0, paid: 0, refund: 0 });
  });
});
