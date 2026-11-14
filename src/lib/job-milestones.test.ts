import { describe, expect, it } from "vitest";
import {
  emptyPlan, milestoneProgress, milestoneTone, parsePlan, planPercentTotal, planToJson, splitByPercent, validatePlan, type PlanDraft,
} from "./job-milestones";

const row = (title: string, percent: string, description = ""): PlanDraft => ({ title, description, percent });

describe("validatePlan", () => {
  it("bawaan form (dua baris 50%) valid setelah nama diisi", () => {
    const rows = emptyPlan();
    expect(Object.keys(validatePlan(rows))).toContain("milestone-0-title");
    rows[0].title = "Desain"; rows[1].title = "Pengembangan";
    expect(validatePlan(rows)).toEqual({});
  });
  it("minimal dua milestone", () => {
    expect(validatePlan([row("Satu tahap", "100")]).milestones).toMatch(/minimal 2/);
  });
  it("total bobot harus tepat 100", () => {
    expect(validatePlan([row("Desain", "40"), row("Kode", "40")]).milestones).toMatch(/80%/);
    expect(validatePlan([row("Desain", "60"), row("Kode", "50")]).milestones).toMatch(/110%/);
    expect(validatePlan([row("Desain", "30"), row("Kode", "70")])).toEqual({});
  });
  it("bobot harus bilangan bulat 1-100", () => {
    for (const bad of ["", "0", "-5", "12.5", "abc", "101"]) {
      expect(validatePlan([row("Desain", bad), row("Kode", "50")])["milestone-0-percent"]).toBeTruthy();
    }
  });
  it("nama 3-120 karakter dan maksimal 10 milestone", () => {
    expect(validatePlan([row("ab", "50"), row("Kode", "50")])["milestone-0-title"]).toBeTruthy();
    expect(validatePlan([row("x".repeat(121), "50"), row("Kode", "50")])["milestone-0-title"]).toBeTruthy();
    const eleven = Array.from({ length: 11 }, (_, i) => row(`Tahap ${i + 1}`, i === 10 ? "10" : "9"));
    expect(validatePlan(eleven).milestones).toMatch(/Maksimal 10/);
  });
});

describe("rencana -> JSON", () => {
  it("memangkas spasi dan mengubah bobot jadi angka", () => {
    expect(planToJson([row("  Desain ", "30", " layout "), row("Kode", "70")])).toEqual([
      { title: "Desain", description: "layout", percent: 30 }, { title: "Kode", description: "", percent: 70 },
    ]);
    expect(planPercentTotal([row("a", "30"), row("b", "")])).toBe(30);
  });
  it("parsePlan membuang entri rusak", () => {
    expect(parsePlan(null)).toEqual([]);
    expect(parsePlan("x")).toEqual([]);
    expect(parsePlan([{ title: "Desain", percent: 40 }, { percent: 60 }, null, { title: " ", percent: 10 }, { title: "Kode", percent: "60", description: 5 }]))
      .toEqual([{ title: "Desain", description: "", percent: 40 }, { title: "Kode", description: "", percent: 60 }]);
  });
});

describe("splitByPercent", () => {
  it("jumlahnya selalu sama dengan total; sisa ke milestone terakhir", () => {
    expect(splitByPercent(1_000_000, [30, 70])).toEqual([300_000, 700_000]);
    const parts = splitByPercent(1_000_001, [33, 33, 34]);
    expect(parts).toEqual([330_000, 330_000, 340_001]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(1_000_001);
  });
  it("nilai terkecil (Rp1.000) tetap positif untuk bobot 1%", () => {
    const parts = splitByPercent(1000, [1, 99]);
    expect(parts).toEqual([10, 990]);
  });
});

describe("progres milestone", () => {
  it("menghitung dari nilai yang disetujui atau diteruskan, mengabaikan yang dibatalkan", () => {
    const p = milestoneProgress([
      { amount: 300_000, status: "released" }, { amount: 200_000, status: "approved" },
      { amount: 500_000, status: "in_progress" }, { amount: 999_999, status: "cancelled" },
    ]);
    expect(p).toMatchObject({ total: 3, done: 2, released: 1, percent: 50, complete: false });
  });
  it("lengkap bila semua selesai; kosong = 0%", () => {
    expect(milestoneProgress([{ amount: 1000, status: "released" }])).toMatchObject({ percent: 100, complete: true });
    expect(milestoneProgress([])).toMatchObject({ total: 0, percent: 0, complete: false });
  });
  it("nada tiap status", () => {
    expect(milestoneTone("pending")).toBe("todo");
    expect(milestoneTone("awaiting_payment")).toBe("active");
    expect(milestoneTone("submitted")).toBe("active");
    expect(milestoneTone("approved")).toBe("done");
    expect(milestoneTone("disputed")).toBe("bad");
  });
});
