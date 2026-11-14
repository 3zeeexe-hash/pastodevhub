import { describe, expect, it } from "vitest";
import { formatRupiahInput, parseRupiah, rupiahDigits } from "./rupiah";
import { validateJobForm, type JobFormInput } from "./jobs";

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

describe("validateJobForm dengan isian rupiah berformat (regresi bug budget)", () => {
  const base: JobFormInput = {
    title: "Website toko online", description: "Deskripsi kebutuhan proyek yang cukup panjang untuk lolos validasi.", category: "web-development",
    skills: ["React"], jobType: "freelance", workMode: "remote", location: "", experience: "mid", paymentType: "fixed",
    min: 0, max: 0, deadline: "", positions: 1, requirements: "",
  };
  it("budget \"1.000.000\" sampai \"Rp 3.000.000\" valid", () => {
    const e = validateJobForm({ ...base, min: parseRupiah("1.000.000"), max: parseRupiah("Rp 3.000.000") });
    expect(e.budget).toBeUndefined();
  });
  it("budget kosong tetap ditolak", () => {
    expect(validateJobForm({ ...base, min: parseRupiah(""), max: parseRupiah("") }).budget).toBeDefined();
  });
  it("maksimum di bawah minimum ditolak", () => {
    expect(validateJobForm({ ...base, min: parseRupiah("3.000.000"), max: parseRupiah("1.000.000") }).budget).toMatch(/di bawah/);
  });
});
