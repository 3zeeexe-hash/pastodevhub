import { describe, expect, it } from "vitest";
import {
  cleanPollOptions, dedupeById, dmBodyError, isPollOpen, MAX_DM_LENGTH, pollPercents, pollTimeLeft,
  reportReasonLabel, searchWords, validatePoll,
} from "@/lib/feed-rules";

describe("validatePoll", () => {
  it("menerima polling yang lengkap", () => {
    expect(validatePoll("Framework favorit?", ["React", "Vue", ""], 24)).toBeNull();
  });
  it("menolak pertanyaan kosong, pilihan kurang, kembar, atau kepanjangan", () => {
    expect(validatePoll("  ", ["a", "b"], 24)).toMatch(/pertanyaan/i);
    expect(validatePoll("Q", ["a", "  "], 24)).toMatch(/minimal 2/i);
    expect(validatePoll("Q", ["a", "A"], 24)).toMatch(/tidak boleh sama/i);
    expect(validatePoll("Q", ["a", "x".repeat(41)], 24)).toMatch(/40 karakter/);
    expect(validatePoll("Q", ["1", "2", "3", "4", "5"], 24)).toMatch(/maksimal 4/i);
  });
  it("menolak durasi di luar daftar dan pertanyaan lebih dari 500 karakter", () => {
    expect(validatePoll("Q", ["a", "b"], 5)).toMatch(/durasi/i);
    expect(validatePoll("x".repeat(501), ["a", "b"], 24)).toMatch(/500/);
  });
  it("cleanPollOptions memangkas dan membuang yang kosong", () => {
    expect(cleanPollOptions([" a ", "", "  ", "b"])).toEqual(["a", "b"]);
  });
});

describe("pollPercents", () => {
  it("jumlahnya selalu 100 kalau ada suara", () => {
    expect(pollPercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(pollPercents([2, 1])).toEqual([67, 33]);
    expect(pollPercents([5, 0, 0, 0])).toEqual([100, 0, 0, 0]);
  });
  it("semua 0 kalau belum ada suara", () => {
    expect(pollPercents([0, 0])).toEqual([0, 0]);
  });
});

describe("waktu polling", () => {
  const now = Date.parse("2026-11-12T00:00:00Z");
  it("menyebut sisa waktu dengan satuan yang pas", () => {
    expect(pollTimeLeft("2026-11-12T00:12:00Z", now)).toBe("12 menit lagi");
    expect(pollTimeLeft("2026-11-12T03:30:00Z", now)).toBe("3 jam lagi");
    expect(pollTimeLeft("2026-11-15T00:00:00Z", now)).toBe("3 hari lagi");
    expect(pollTimeLeft("2026-11-11T23:59:00Z", now)).toBe("Berakhir");
  });
  it("isPollOpen mengikuti batas waktu", () => {
    expect(isPollOpen("2026-11-12T00:00:01Z", now)).toBe(true);
    expect(isPollOpen("2026-11-12T00:00:00Z", now)).toBe(false);
  });
});

describe("searchWords", () => {
  it("huruf kecil, buang simbol berbahaya, tanpa duplikat", () => {
    expect(searchWords("React, (Next.js) %_ react #Tips @budi")).toEqual(["react", "nextjs", "tips", "budi"]);
  });
  it("membatasi 5 kata dan mengembalikan kosong untuk teks kosong", () => {
    expect(searchWords("a b c d e f g")).toHaveLength(5);
    expect(searchWords("   ")).toEqual([]);
    expect(searchWords("%%%")).toEqual([]);
  });
  it("mempertahankan huruf non-Latin", () => {
    expect(searchWords("pemrograman béta")).toEqual(["pemrograman", "béta"]);
  });
});

describe("dedupeById", () => {
  it("membuang id kembar dan menjaga urutan", () => {
    expect(dedupeById([{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("pesan dan laporan", () => {
  it("dmBodyError", () => {
    expect(dmBodyError("  ")).toMatch(/kosong/i);
    expect(dmBodyError("x".repeat(MAX_DM_LENGTH + 1))).toMatch(/maksimal/i);
    expect(dmBodyError("halo")).toBeNull();
  });
  it("reportReasonLabel", () => {
    expect(reportReasonLabel("spam")).toMatch(/spam/i);
    expect(reportReasonLabel("tidak-dikenal")).toBe("tidak-dikenal");
  });
});
