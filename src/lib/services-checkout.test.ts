import { describe, expect, it } from "vitest";
import {
  checkoutErrors, checkoutPreview, clampQty, customRequestErrors, normalizeReferences, selectionToPayload, todayISO, validReferenceUrl,
  type CheckoutAddon, type CheckoutPackage, type CustomRequestForm,
} from "./services-checkout";

const pkg: CheckoutPackage = { id: "p1", name: "Landing page profesional", price: 350_000, delivery_days: 5, revisions: 2 };
const pages: CheckoutAddon = { id: "a1", name: "Halaman tambahan", price: 100_000, extra_days: 1, extra_revisions: 0 };
const rev: CheckoutAddon = { id: "a2", name: "Revisi tambahan", price: 50_000, extra_days: 0, extra_revisions: 1 };

describe("pratinjau biaya", () => {
  it("hanya paket bila tidak ada add-on", () => {
    const p = checkoutPreview(pkg, [pages, rev], {});
    expect(p.total).toBe(350_000);
    expect(p.deliveryDays).toBe(5);
    expect(p.revisions).toBe(2);
    expect(p.lines).toHaveLength(1);
  });
  it("add-on menambah harga, hari, dan revisi sesuai jumlah", () => {
    const p = checkoutPreview(pkg, [pages, rev], { a1: 2, a2: 1 });
    expect(p.total).toBe(350_000 + 200_000 + 50_000);
    expect(p.deliveryDays).toBe(7);
    expect(p.revisions).toBe(3);
    expect(p.lines.map((l) => l.lineTotal)).toEqual([350_000, 200_000, 50_000]);
  });
  it("add-on yang tidak ada di daftar diabaikan (tidak bisa menyelundupkan harga)", () => {
    const p = checkoutPreview(pkg, [pages], { ghost: 3 });
    expect(p.total).toBe(350_000);
  });
});

describe("pilihan add-on", () => {
  it("jumlah dibatasi 0–10 dan dibulatkan ke bawah", () => {
    expect(clampQty(-4)).toBe(0);
    expect(clampQty(3.9)).toBe(3);
    expect(clampQty(99)).toBe(10);
    expect(clampQty(Number.NaN)).toBe(0);
  });
  it("payload hanya memuat add-on yang dipilih", () => {
    expect(selectionToPayload({ a1: 2, a2: 0, a3: -1 })).toEqual([{ id: "a1", quantity: 2 }]);
    expect(selectionToPayload({})).toEqual([]);
  });
});

describe("lampiran referensi", () => {
  it("hanya tautan https tanpa spasi", () => {
    expect(validReferenceUrl("https://contoh.id/a.png")).toBe(true);
    expect(validReferenceUrl("http://contoh.id/a.png")).toBe(false);
    expect(validReferenceUrl("javascript:alert(1)")).toBe(false);
    expect(validReferenceUrl("https://contoh.id/a b")).toBe(false);
    expect(validReferenceUrl("")).toBe(false);
  });
  it("dinormalkan: duplikat dan tautan buruk dibuang, maksimal 5", () => {
    const list = [
      { url: " https://x.id/1 ", name: " satu " },
      { url: "https://x.id/1", name: "dobel" },
      { url: "ftp://x.id/2", name: "buruk" },
      ...Array.from({ length: 8 }, (_, i) => ({ url: `https://x.id/n${i}`, name: "n" })),
    ];
    const out = normalizeReferences(list);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ url: "https://x.id/1", name: "satu" });
  });
});

describe("validasi checkout", () => {
  it("kebutuhan minimal 10 karakter dan ketentuan wajib disetujui", () => {
    expect(checkoutErrors({ brief: "pendek", acceptTerms: false })).toHaveLength(2);
    expect(checkoutErrors({ brief: "Website company profile 5 halaman", acceptTerms: true })).toEqual([]);
    expect(checkoutErrors({ brief: "x".repeat(5001), acceptTerms: true })).toHaveLength(1);
  });
});

describe("permintaan khusus", () => {
  const ok: CustomRequestForm = { title: "Integrasi API pembayaran", description: "Butuh integrasi payment gateway ke toko online saya.", budget: "", deadline: "", note: "" };
  const now = new Date(2026, 10, 15);
  it("form lengkap valid; budget dan deadline opsional", () => {
    expect(customRequestErrors(ok, now)).toEqual([]);
  });
  it("judul, deskripsi, dan catatan dibatasi panjangnya", () => {
    expect(customRequestErrors({ ...ok, title: "abc" }, now)).toHaveLength(1);
    expect(customRequestErrors({ ...ok, description: "terlalu pendek" }, now)).toHaveLength(1);
    expect(customRequestErrors({ ...ok, note: "x".repeat(1001) }, now)).toHaveLength(1);
  });
  it("budget minimal Rp1.000", () => {
    expect(customRequestErrors({ ...ok, budget: "500" }, now)).toHaveLength(1);
    expect(customRequestErrors({ ...ok, budget: "Rp 1.500.000" }, now)).toEqual([]);
  });
  it("deadline tidak boleh lampau dan maksimal 2 tahun", () => {
    expect(customRequestErrors({ ...ok, deadline: "2026-11-14" }, now)).toHaveLength(1);
    expect(customRequestErrors({ ...ok, deadline: "2026-11-15" }, now)).toEqual([]);
    expect(customRequestErrors({ ...ok, deadline: "2029-01-01" }, now)).toHaveLength(1);
    expect(customRequestErrors({ ...ok, deadline: "besok" }, now)).toHaveLength(1);
  });
  it("format tanggal lokal", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
