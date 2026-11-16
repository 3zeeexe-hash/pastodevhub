import { describe, expect, it } from "vitest";
import { WORK_SEEN_KEY, bucketByDay, dayLabel, deltaPct, increases, lastDays, lastTwo, monthLabel, pct, readSeen, rpCompact, sumCounts } from "@/lib/admin-work-activity";

describe("admin work activity helpers", () => {
  it("builds the last N local days ending today", () => {
    const days = lastDays(3, new Date(2026, 10, 16, 15, 0));
    expect(days).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
  });
  it("crosses month boundaries", () => {
    expect(lastDays(2, new Date(2026, 11, 1))).toEqual(["2026-11-30", "2026-12-01"]);
  });
  it("buckets timestamps per day and ignores junk or out-of-range values", () => {
    const days = lastDays(3, new Date(2026, 10, 16));
    const at = (d: number, h = 10) => new Date(2026, 10, d, h).toISOString();
    expect(bucketByDay([at(14), at(16), at(16, 22), at(1), "bukan tanggal", null, undefined], days)).toEqual([1, 0, 2]);
  });
  it("computes percentage change with a safe fallback", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(10, null)).toBeNull();
  });
  it("picks the last two entries", () => {
    expect(lastTwo([1, 2, 3])).toEqual({ cur: 3, prev: 2 });
    expect(lastTwo([1])).toEqual({ cur: 1, prev: null });
    expect(lastTwo([])).toEqual({ cur: null, prev: null });
  });
  it("formats rupiah compactly", () => {
    expect(rpCompact(0)).toBe("Rp 0");
    expect(rpCompact(950)).toBe("Rp 950");
    expect(rpCompact(1500)).toBe("Rp 1,5 rb");
    expect(rpCompact(2_340_000)).toBe("Rp 2,3 jt");
    expect(rpCompact(3_000_000_000)).toBe("Rp 3 M");
  });
  it("labels months and days in Indonesian", () => {
    expect(monthLabel("2026-11")).toBe("Nov 26");
    expect(monthLabel("2026-05")).toBe("Mei 26");
    expect(monthLabel("rusak")).toBe("rusak");
    expect(dayLabel("2026-08-09")).toBe("9 Agu");
  });
  it("computes percentages and guards against zero", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBeNull();
  });
  it("sums counts", () => {
    expect(sumCounts({ a: 1, b: 2, c: 0 })).toBe(3);
    expect(sumCounts({ a: Number.NaN, b: 2 })).toBe(2);
  });
  it("reports only increases, and never on the first poll", () => {
    const a = { reports: 1, disputes: 2, jobs: 0 };
    expect(increases(null, a)).toEqual([]);
    expect(increases(a, { reports: 3, disputes: 2, jobs: 1 })).toEqual([{ key: "reports", by: 2 }, { key: "jobs", by: 1 }]);
    expect(increases(a, { reports: 0, disputes: 1, jobs: 0 })).toEqual([]);
  });
  it("reads the seen time, creating it when missing", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(readSeen(store, 1000)).toBe(1000);
    expect(mem.get(WORK_SEEN_KEY)).toBe("1000");
    expect(readSeen(store, 9999)).toBe(1000);
    expect(readSeen(null, 5)).toBe(5);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readSeen(broken, 7)).toBe(7);
  });
});
