import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS, PAGE_SIZE, buildExploreArgs, formatRating, hasActiveFilters, pageCount, serviceShareUrl, type ExploreFilters,
} from "./services-explore";

const f = (patch: Partial<ExploreFilters>): ExploreFilters => ({ ...EMPTY_FILTERS, ...patch });

describe("filter jelajah", () => {
  it("tanpa filter dan urutan terbaru dianggap tidak aktif", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(f({ q: "   " }))).toBe(false);
  });
  it("pencarian, kategori, harga, rating, favorit, atau urutan lain mengaktifkan filter", () => {
    for (const patch of [{ q: "web" }, { category: "logo" }, { minPrice: "1" }, { maxDays: "7" }, { minRating: "4" }, { verifiedOnly: true }, { favoritesOnly: true }, { sort: "popular" as const }]) {
      expect(hasActiveFilters(f(patch))).toBe(true);
    }
  });
});

describe("argumen service_explore", () => {
  it("nilai kosong menjadi null dan halaman pertama mulai dari 0", () => {
    const a = buildExploreArgs(EMPTY_FILTERS);
    expect(a).toMatchObject({ _q: null, _category: null, _subcategory: null, _min_price: null, _max_price: null, _max_days: null, _min_rating: null, _sort: "newest", _limit: PAGE_SIZE, _offset: 0 });
  });
  it("harga diambil dari digit, min > maks ditukar", () => {
    const a = buildExploreArgs(f({ minPrice: "Rp 500.000", maxPrice: "100.000" }));
    expect(a._min_price).toBe(100_000);
    expect(a._max_price).toBe(500_000);
  });
  it("angka tidak valid dibuang", () => {
    const a = buildExploreArgs(f({ minPrice: "abc", maxPrice: "0", maxDays: "9999", minRating: "9" }));
    expect(a._min_price).toBeNull();
    expect(a._max_price).toBeNull();
    expect(a._max_days).toBeNull();
    expect(a._min_rating).toBeNull();
  });
  it("subkategori hanya dikirim bersama kategori", () => {
    expect(buildExploreArgs(f({ subcategory: "wordpress" }))._subcategory).toBeNull();
    expect(buildExploreArgs(f({ category: "website-development", subcategory: "wordpress" }))._subcategory).toBe("wordpress");
  });
  it("urutan tidak dikenal kembali ke terbaru dan teks dipotong 80 karakter", () => {
    expect(buildExploreArgs(f({ sort: "ngawur" as never }))._sort).toBe("newest");
    expect(buildExploreArgs(f({ q: "x".repeat(200) }))._q).toHaveLength(80);
  });
  it("offset mengikuti halaman", () => {
    expect(buildExploreArgs(EMPTY_FILTERS, 2)._offset).toBe(2 * PAGE_SIZE);
    expect(buildExploreArgs(EMPTY_FILTERS, -3)._offset).toBe(0);
  });
});

describe("tampilan", () => {
  it("jumlah halaman", () => {
    expect(pageCount(0)).toBe(0);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
  it("rating hanya tampil bila ada ulasan", () => {
    expect(formatRating(4.8, 12)).toBe("4.8 (12)");
    expect(formatRating(0, 0)).toBeNull();
  });
  it("tautan bagikan", () => {
    expect(serviceShareUrl("https://pastodev.test/", "abc")).toBe("https://pastodev.test/jasa/abc");
  });
});
