import { describe, expect, it } from "vitest";
import { average, bidVsBudget, pct, txStats, weeklyVolume } from "./admin-work-stats";

describe("pct & average", () => {
  it("membulatkan dan aman terhadap pembagi kosong", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 0)).toBe(0);
    expect(pct(null, 5)).toBe(0);
    expect(average([100, 200, 301])).toBe(200);
    expect(average([])).toBe(0);
  });
});

describe("bidVsBudget", () => {
  it("menilai penawaran terhadap anggaran", () => {
    expect(bidVsBudget(0, 100, 200).label).toMatch(/nego/i);
    expect(bidVsBudget(150, 100, 200).tone).toBe("ok");
    expect(bidVsBudget(300, 100, 200)).toEqual({ tone: "warn", label: "50% di atas anggaran" });
    expect(bidVsBudget(50, 100, 200)).toEqual({ tone: "info", label: "50% di bawah anggaran" });
    expect(bidVsBudget(50_000, 1_000_000, 2_000_000, true).label).toBe("Tarif per jam");
    expect(bidVsBudget(10, 0, 0).tone).toBe("neutral");
  });
});

describe("txStats", () => {
  it("hanya menghitung volume, komisi, dan escrow dari pesanan yang sudah dibayar", () => {
    const s = txStats([
      { amount: 100_000, paid_at: "2026-11-01T00:00:00Z", fee: 5_000, net: 95_000, escrow: "held", needsRefund: false },
      { amount: 50_000, paid_at: null, fee: 0, net: null, escrow: null, needsRefund: true },
    ]);
    expect(s).toMatchObject({ total: 2, paid: 1, unpaid: 1, volume: 100_000, commission: 5_000, net: 95_000, refund: 1, average: 100_000 });
    expect(s.escrow.held).toEqual({ n: 1, amount: 100_000 });
  });
});

describe("weeklyVolume", () => {
  const now = Date.parse("2026-11-16T00:00:00Z");
  const day = 86_400_000;
  it("mengelompokkan per 7 hari dan mengabaikan data di luar rentang", () => {
    const w = weeklyVolume(
      [
        { amount: 10, paid_at: new Date(now - day).toISOString() },
        { amount: 20, paid_at: new Date(now - 8 * day).toISOString() },
        { amount: 30, paid_at: new Date(now - 100 * day).toISOString() },
        { amount: 40, paid_at: null },
        { amount: 50, paid_at: new Date(now + day).toISOString() },
      ],
      8,
      now,
    );
    expect(w).toHaveLength(8);
    expect(w[7]).toMatchObject({ volume: 10, count: 1 });
    expect(w[6]).toMatchObject({ volume: 20, count: 1 });
    expect(w.reduce((s, b) => s + b.volume, 0)).toBe(30);
  });
});
