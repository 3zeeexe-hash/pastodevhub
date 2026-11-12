// Penemuan konten (Fase 3): peringkat "Untuk Kamu", post terpopuler, tagar trending, dan saran tagar.
import { db, isMissingSchemaError } from "@/lib/feed-db";

export type TrendingTag = { tag: string; posts: number; authors: number };

/**
 * Id post berurutan menurut skor (fungsi feed_ranked di database).
 * Mengembalikan null kalau fungsinya belum ada, supaya pemanggil bisa jatuh ke urutan terbaru.
 */
export async function fetchRankedIds(opts: { hours: number; limit: number; offset: number; personal: boolean }): Promise<string[] | null> {
  const { data, error } = await db.rpc("feed_ranked", {
    _hours: opts.hours,
    _limit: opts.limit,
    _offset: opts.offset,
    _personal: opts.personal,
  });
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as { post_id: string }[]).map((r) => r.post_id);
}

export async function fetchTrendingTags(hours = 48, limit = 10): Promise<TrendingTag[]> {
  const { data, error } = await db.rpc("feed_trending_tags", { _hours: hours, _limit: limit });
  if (error) return [];
  return ((data ?? []) as { tag: string; posts: number | string; authors: number | string }[]).map((r) => ({
    tag: r.tag,
    posts: Number(r.posts),
    authors: Number(r.authors),
  }));
}

export async function searchTags(q: string, limit = 8): Promise<{ tag: string; posts: number }[]> {
  if (!q.trim()) return [];
  const { data, error } = await db.rpc("feed_search_tags", { _q: q, _limit: limit });
  if (error) return [];
  return ((data ?? []) as { tag: string; posts: number | string }[]).map((r) => ({ tag: r.tag, posts: Number(r.posts) }));
}
