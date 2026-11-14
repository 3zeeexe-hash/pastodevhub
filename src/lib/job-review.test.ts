import { describe, expect, it } from "vitest";
import { acceptedMessage, normalizeModeration, slotsLeft } from "./job-review";

describe("slotsLeft", () => {
  it("menghitung sisa posisi: 5 posisi, 1 diterima, sisa 4", () => {
    expect(slotsLeft(5, 1)).toBe(4);
  });
  it("habis saat jumlah diterima sama dengan posisi", () => {
    expect(slotsLeft(5, 5)).toBe(0);
    expect(slotsLeft(1, 1)).toBe(0);
  });
  it("tidak pernah negatif", () => {
    expect(slotsLeft(2, 9)).toBe(0);
  });
  it("data kosong dianggap 1 posisi", () => {
    expect(slotsLeft(null, 0)).toBe(1);
    expect(slotsLeft(undefined, 0)).toBe(1);
  });
});

describe("normalizeModeration", () => {
  it("mengenali pending dan rejected", () => {
    expect(normalizeModeration("pending")).toBe("pending");
    expect(normalizeModeration("rejected")).toBe("rejected");
  });
  it("nilai lain atau kosong dianggap disetujui", () => {
    expect(normalizeModeration(null)).toBe("approved");
    expect(normalizeModeration(undefined)).toBe("approved");
    expect(normalizeModeration("approved")).toBe("approved");
  });
});

describe("acceptedMessage", () => {
  it("menyebut sisa posisi saat lowongan tetap dibuka", () => {
    expect(acceptedMessage(4)).toContain("sisa 4 posisi");
    expect(acceptedMessage(4)).toContain("tetap dibuka");
  });
  it("menyebut lowongan ditutup saat posisi terakhir terisi", () => {
    expect(acceptedMessage(0)).toContain("ditutup");
  });
});
