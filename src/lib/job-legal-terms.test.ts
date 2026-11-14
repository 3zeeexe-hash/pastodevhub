import { describe, expect, it } from "vitest";
import { LEGAL_TERMS_MAX, LEGAL_TERMS_MIN, validateLegalTerms } from "./job-legal-terms";

const ok = "Hak cipta dan kode sumber menjadi milik client setelah lunas.";

describe("validateLegalTerms", () => {
  it("keduanya terisi cukup panjang valid", () => {
    expect(validateLegalTerms({ usageRights: ok, cancellationTerms: ok })).toEqual({});
  });
  it("kosong atau hanya spasi ditolak", () => {
    const e = validateLegalTerms({ usageRights: "", cancellationTerms: "     " });
    expect(e.usageRights).toMatch(/wajib diisi/);
    expect(e.cancellationTerms).toMatch(/wajib diisi/);
  });
  it("terlalu pendek ditolak, tepat batas minimum boleh", () => {
    expect(validateLegalTerms({ usageRights: "a".repeat(LEGAL_TERMS_MIN - 1), cancellationTerms: ok }).usageRights).toMatch(/minimal/);
    expect(validateLegalTerms({ usageRights: "a".repeat(LEGAL_TERMS_MIN), cancellationTerms: ok }).usageRights).toBeUndefined();
  });
  it("spasi di awal dan akhir tidak dihitung", () => {
    expect(validateLegalTerms({ usageRights: ` ${"a".repeat(LEGAL_TERMS_MIN - 1)} `, cancellationTerms: ok }).usageRights).toBeTruthy();
  });
  it("terlalu panjang ditolak", () => {
    expect(validateLegalTerms({ usageRights: ok, cancellationTerms: "a".repeat(LEGAL_TERMS_MAX + 1) }).cancellationTerms).toMatch(/maksimal/);
    expect(validateLegalTerms({ usageRights: ok, cancellationTerms: "a".repeat(LEGAL_TERMS_MAX) }).cancellationTerms).toBeUndefined();
  });
  it("setiap field dinilai sendiri", () => {
    const e = validateLegalTerms({ usageRights: ok, cancellationTerms: "" });
    expect(Object.keys(e)).toEqual(["cancellationTerms"]);
  });
});
