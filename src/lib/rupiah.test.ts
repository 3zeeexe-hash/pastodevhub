import { describe, expect, it } from "vitest";
import { formatRupiahInput, parseRupiah, rupiahDigits } from "./rupiah";

describe("format isian rupiah", () => {
  it("memberi pemisah ribuan dan awalan Rp", () => {
    expect(formatRupiahInput("1500000")).toBe("Rp 1.500.000");
    expect(formatRupiahInput("500")).toBe("Rp 500");
    expect(formatRupiahInput("1000")).toBe("Rp 1.000");
  });
  it("kosong tetap kosong", () => {
    expect(formatRupiahInput("")).toBe("");
    expect(formatRupiahInput("abc")).toBe("");
  });
  it("membuang karakter non-digit dan nol di depan", () => {
    expect(rupiahDigits("Rp 1.500.000")).toBe("1500000");
    expect(rupiahDigits("0012")).toBe("12");
    expect(rupiahDigits("0")).toBe("0");
  });
  it("memangkas angka yang terlalu panjang", () => {
    expect(rupiahDigits("1".repeat(20))).toHaveLength(12);
  });
  it("parseRupiah mengembalikan bilangan bulat", () => {
    expect(parseRupiah("Rp 2.000.000")).toBe(2_000_000);
    expect(parseRupiah("")).toBe(0);
    expect(parseRupiah("1.5")).toBe(15);
  });
});
