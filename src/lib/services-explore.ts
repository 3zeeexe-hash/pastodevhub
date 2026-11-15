// GOBI SERVICES Fase 4: aturan murni untuk halaman jelajah jasa (filter, urutan, argumen RPC, format tampilan).
// Cermin dari docs/sql/gobi-services/004_gobi_services_marketplace.sql — database tetap penentu akhir.
import { validAmount } from "./work";

export const SORTS = ["newest", "popular", "rating", "price_asc", "price_desc"] as const;
export type ExploreSort = (typeof SORTS)[number];

export const SORT_LABEL: Record<ExploreSort, string> = {
  newest: "Terbaru",
  popular: "Terlaris",
  rating: "Rating tertinggi",
  price_asc: "Harga terendah",
  price_desc: "Harga tertinggi",
};

export const PAGE_SIZE = 24;
export const SECTION_SIZE = 8;

/** Pilihan batas waktu pengerjaan (hari). */
export const DAY_OPTIONS = [3, 7, 14, 30] as const;
/** Pilihan rating minimal. */
export const RATING_OPTIONS = [4, 3] as const;

/** Nilai filter berupa teks karena berasal dari isian formulir; dinormalkan oleh `buildExploreArgs`. */
export type ExploreFilters = {
  q: string;
  category: string;
  subcategory: string;
  minPrice: string;
  maxPrice: string;
  maxDays: string;
  minRating: string;
  verifiedOnly: boolean;
  favoritesOnly: boolean;
  sort: ExploreSort;
};

export const EMPTY_FILTERS: ExploreFilters = {
  q: "", category: "", subcategory: "", minPrice: "", maxPrice: "", maxDays: "", minRating: "",
  verifiedOnly: false, favoritesOnly: false, sort: "newest",
};

/** True bila pengguna sedang menyaring atau mengurutkan; kalau false, halaman menampilkan bagian kurasi. */
export function hasActiveFilters(f: ExploreFilters): boolean {
  return !!(f.q.trim() || f.category || f.subcategory || f.minPrice || f.maxPrice || f.maxDays || f.minRating
    || f.verifiedOnly || f.favoritesOnly || f.sort !== "newest");
}

function posInt(s: string, max: number): number | null {
  const d = s.replace(/\D/g, "");
  if (!d) return null;
  const n = Number(d);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;
}

/** Argumen untuk `service_explore`. Harga min > maks ditukar; angka tidak valid dibuang; teks pencarian dipotong 80 karakter. */
export function buildExploreArgs(f: ExploreFilters, page = 0, size = PAGE_SIZE) {
  let min = posInt(f.minPrice, 10_000_000_000);
  let max = posInt(f.maxPrice, 10_000_000_000);
  if (min !== null && !validAmount(min)) min = null;
  if (max !== null && !validAmount(max)) max = null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const rating = posInt(f.minRating, 5);
  const q = f.q.trim().slice(0, 80);
  return {
    _q: q || null,
    _category: f.category || null,
    _subcategory: f.category && f.subcategory ? f.subcategory : null,
    _min_price: min,
    _max_price: max,
    _max_days: posInt(f.maxDays, 365),
    _min_rating: rating,
    _verified_only: f.verifiedOnly,
    _favorites_only: f.favoritesOnly,
    _sort: (SORTS as readonly string[]).includes(f.sort) ? f.sort : "newest",
    _limit: size,
    _offset: Math.max(0, Math.floor(page)) * size,
  };
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return total > 0 ? Math.ceil(total / size) : 0;
}

/** "4.8 (12)" atau null bila belum ada ulasan. */
export function formatRating(avg: number, count: number): string | null {
  if (!count || count < 1) return null;
  return `${Number(avg).toFixed(1)} (${count})`;
}

/** Tautan jasa yang dibagikan. */
export function serviceShareUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, "")}/jasa/${id}`;
}

// ---- Bentuk data dari fungsi baca ----
export type ExploreOwner = { id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean };

export type ExploreRow = {
  id: string; title: string; summary: string; cover_url: string | null; price_from: number; delivery_days: number;
  category_slug: string | null; category_label: string | null; rating_avg: number; rating_count: number; orders_completed: number;
  created_at: string; is_favorite: boolean; owner: ExploreOwner;
};

export type ExploreResult = { total: number; rows: ExploreRow[] };

export type TopSeller = {
  id: string; username: string; display_name: string | null; avatar_url: string | null; headline: string | null; is_verified: boolean;
  services: number; orders_completed: number; reviews: number; rating: number;
};
