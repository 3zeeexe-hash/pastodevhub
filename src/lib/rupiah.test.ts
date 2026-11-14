import { describe, expect, it } from "vitest";
import { formatRupiahInput, parseRupiah } from "./rupiah";
import { validateJobForm, type JobFormInput } from "./jobs";

describe("parseRupiah", () => {
  it("membaca berbagai format rupiah", () => {
    expect(parseRupiah("5000000")).toBe(5_000_000);
    expect(parseRupiah("5.000.000")).toBe(5_000_000);
    expect(parseRupiah("Rp 5.000.000")).toBe(5_000_000);
    expect(parseRupiah("Rp5,000,000")).toBe(5_000_000);
    expect(parseRupiah("rp. 2.500.000")).toBe(2_500_000);
    expect(parseRupiah("5.000.000,00")).toBe(5_000_000);
  });
  it("0 untuk kosong atau tanpa angka", () => {
    expect(parseRupiah("")).toBe(0);
    expect(parseRupiah("Rp")).toBe(0);
    expect(parseRupiah("abc")).toBe(0);
  });
});

describe("formatRupiahInput", () => {
  it("memberi titik ribuan saat mengetik", () => {
    expect(formatRupiahInput("5")).toBe("5");
    expect(formatRupiahInput("5000")).toBe("5.000");
    expect(formatRupiahInput("5000000")).toBe("5.000.000");
    expect(formatRupiahInput("5.000.0000")).toBe("50.000.000");
  });
  it("membuang karakter bukan angka dan nol di depan", () => {
    expect(formatRupiahInput("Rp 1a2b3")).toBe("123");
    expect(formatRupiahInput("007")).toBe("7");
    expect(formatRupiahInput("")).toBe("");
  });
  it("membatasi 12 digit", () => {
    expect(formatRupiahInput("1234567890123456").replace(/\./g, "")).toHaveLength(12);
  });
  it("hasil format selalu bisa dibaca balik", () => {
    expect(parseRupiah(formatRupiahInput("2500000"))).toBe(2_500_000);
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
