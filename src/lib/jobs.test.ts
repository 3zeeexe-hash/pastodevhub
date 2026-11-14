import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS, activeFilterCount, budgetLabel, categoryFilterValues, jobCategoryLabel, parseSkills,
  sanitizeTerm, validateJobForm, type JobFormInput,
} from "./jobs";

const valid: JobFormInput = {
  title: "Website toko online batik",
  description: "Butuh website toko online lengkap dengan katalog, keranjang, dan pembayaran.",
  category: "web-development", skills: ["React"], jobType: "freelance", workMode: "remote", location: "",
  experience: "mid", paymentType: "fixed", min: 500_000, max: 2_000_000, deadline: "2027-01-01", positions: 1, requirements: "",
};
const today = "2026-11-13";

describe("kategori", () => {
  it("kategori lama tetap terbaca dan terfilter", () => {
    expect(jobCategoryLabel("website")).toBe("Web Development");
    expect(jobCategoryLabel("desain")).toBe("Graphic Design");
    expect(jobCategoryLabel("tidak-ada")).toBe("Other");
    expect(categoryFilterValues("web-development")).toEqual(["web-development", "website"]);
    expect(categoryFilterValues("other")).toEqual(expect.arrayContaining(["other", "plugin", "game", "lainnya"]));
  });
});

describe("validateJobForm", () => {
  it("form lengkap valid", () => {
    expect(validateJobForm(valid, today)).toEqual({});
  });
  it("menolak deadline di masa lalu, tetapi hari ini boleh", () => {
    expect(validateJobForm({ ...valid, deadline: "2026-11-12" }, today).deadline).toBeTruthy();
    expect(validateJobForm({ ...valid, deadline: "2026-11-13" }, today).deadline).toBeUndefined();
    expect(validateJobForm({ ...valid, deadline: "" }, today).deadline).toBeUndefined();
  });
  it("budget harus valid", () => {
    expect(validateJobForm({ ...valid, min: 0 }, today).budget).toBeTruthy();
    expect(validateJobForm({ ...valid, min: 3_000_000, max: 2_000_000 }, today).budget).toBeTruthy();
    expect(validateJobForm({ ...valid, min: 1000.5 }, today).budget).toBeTruthy();
  });
  it("hybrid/onsite wajib lokasi, remote tidak", () => {
    expect(validateJobForm({ ...valid, workMode: "onsite", location: "" }, today).location).toBeTruthy();
    expect(validateJobForm({ ...valid, workMode: "hybrid", location: "Madiun" }, today).location).toBeUndefined();
  });
  it("field wajib dan pilihan tidak dikenal ditolak", () => {
    const e = validateJobForm({ ...valid, title: "abc", description: "pendek", skills: [], jobType: "x", paymentType: "y", positions: 0 }, today);
    expect(Object.keys(e).sort()).toEqual(["description", "jobType", "paymentType", "positions", "skills", "title"]);
  });
});

describe("batas revisi lowongan", () => {
  it("tanpa batas (null/kosong) valid", () => {
    expect(validateJobForm({ ...valid, revisionLimit: null }, today)["revisionLimit"]).toBeUndefined();
    expect(validateJobForm({ ...valid }, today)["revisionLimit"]).toBeUndefined();
  });
  it("1–20 kali valid, di luar itu ditolak", () => {
    expect(validateJobForm({ ...valid, revisionLimit: 2 }, today)["revisionLimit"]).toBeUndefined();
    expect(validateJobForm({ ...valid, revisionLimit: 20 }, today)["revisionLimit"]).toBeUndefined();
    expect(validateJobForm({ ...valid, revisionLimit: 0 }, today)["revisionLimit"]).toBeTruthy();
    expect(validateJobForm({ ...valid, revisionLimit: 21 }, today)["revisionLimit"]).toBeTruthy();
    expect(validateJobForm({ ...valid, revisionLimit: 1.5 }, today)["revisionLimit"]).toBeTruthy();
  });
  it("tidak berlaku untuk lowongan per jam", () => {
    expect(validateJobForm({ ...valid, paymentType: "hourly", revisionLimit: 2 }, today)["revisionLimit"]).toBeTruthy();
  });
});

describe("pembantu", () => {
  it("parseSkills menghapus duplikat dan membatasi jumlah", () => {
    expect(parseSkills("React, react, ,Figma")).toEqual(["React", "Figma"]);
    expect(parseSkills(Array.from({ length: 20 }, (_, i) => `s${i}`).join(","))).toHaveLength(12);
  });
  it("sanitizeTerm membuang karakter filter PostgREST", () => {
    expect(sanitizeTerm("a,b(c)%d_e")).toBe("a b c d e");
  });
  it("activeFilterCount", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, category: "database", minBudget: 1000, location: " " })).toBe(2);
  });
  it("budgetLabel tetap seperti sebelumnya", () => {
    expect(budgetLabel(0, 0)).toBe("Nego");
  });
});
