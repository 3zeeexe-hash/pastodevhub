import { describe, expect, it } from "vitest";
import { commissionFor, parseCommissionInput } from "./work-commission";

describe("parseCommissionInput", () => {
  it("menerima angka 0–30 dengan koma atau titik", () => {
    expect(parseCommissionInput("5")).toBe(5);
    expect(parseCommissionInput(" 7,5 ")).toBe(7.5);
    expect(parseCommissionInput("12.25")).toBe(12.25);
    expect(parseCommissionInput("0")).toBe(0);
    expect(parseCommissionInput("30")).toBe(30);
  });
  it("menolak di luar batas atau format salah", () => {
    expect(parseCommissionInput("31")).toBeNull();
    expect(parseCommissionInput("-1")).toBeNull();
    expect(parseCommissionInput("5.123")).toBeNull();
    expect(parseCommissionInput("lima")).toBeNull();
    expect(parseCommissionInput("")).toBeNull();
    expect(parseCommissionInput("100")).toBeNull();
  });
});

describe("commissionFor", () => {
  it("contoh master prompt: Rp2.000.000 pada 5% = Rp100.000", () => {
    expect(commissionFor(2_000_000, 5)).toBe(100_000);
    expect(2_000_000 - commissionFor(2_000_000, 5)).toBe(1_900_000);
  });
  it("membulatkan ke rupiah terdekat", () => {
    expect(commissionFor(1_001, 7.5)).toBe(75);
  });
  it("nol untuk masukan tidak valid", () => {
    expect(commissionFor(0, 5)).toBe(0);
    expect(commissionFor(-10, 5)).toBe(0);
    expect(commissionFor(1000, Number.NaN)).toBe(0);
  });
});
