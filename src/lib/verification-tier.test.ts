import { describe, expect, it } from "vitest";
import { TIER_META, VERIFIED_TIERS, asTier } from "./verification-tier";

describe("asTier", () => {
  it("mengenali tiga tingkat centang", () => {
    expect(asTier("verified")).toBe("verified");
    expect(asTier("official")).toBe("official");
    expect(asTier("owner")).toBe("owner");
  });

  it("menganggap nilai lain sebagai tanpa tingkat", () => {
    expect(asTier(null)).toBeNull();
    expect(asTier(undefined)).toBeNull();
    expect(asTier("")).toBeNull();
    expect(asTier("admin")).toBeNull();
    expect(asTier(true)).toBeNull();
  });
});

describe("TIER_META", () => {
  it("punya warna berbeda untuk setiap tingkat: biru, hijau, merah", () => {
    expect(VERIFIED_TIERS.map((t) => TIER_META[t].colorName)).toEqual(["biru", "hijau", "merah"]);
    expect(new Set(VERIFIED_TIERS.map((t) => TIER_META[t].fill)).size).toBe(3);
  });
});
