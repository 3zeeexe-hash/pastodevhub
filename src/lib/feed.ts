// Linimasa Diskusi ala X: tipe, pembantu teks, dan fungsi data (Supabase).
// Tabel feed_* dibuat lewat docs/sql/0005-0007 dan belum ada di types.ts (file otomatis),
// jadi klien di-cast ke any di satu tempat (feed-db.ts).
import { db, fail } from "@/lib/feed-db";
import { fetchRankedIds } from "@/lib/feed-discover";
import { fetchPostExtras, type AutopostInfo, type PollData } from "@/lib/feed-extras";
import { fetchHiddenAuthorIds } from "@/lib/feed-moderation";
import { searchWords } from "@/lib/feed-rules";

export type { AutopostInfo, PollData } from "@/lib/feed-extras";

export const MAX_POST_LENGTH = 500;
export const PAGE_SIZE = 20;

export type FeedKind = "post" | "reply" | "repost" | "quote";
export type FeedAuthor = { username: string; display_name: string | null; avatar_url: string | null };
export type ViewerState = { liked: boolean; bookmarked: boolean; reposted: boolean };

export type FeedPostBase = {
  id: string;
  author_id: string;
  kind: FeedKind;
  body: string;
  parent_id: string | null;
  ref_id: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  created_at: string;
  author: FeedAuthor;
};
/** Yang melekat pada post untuk pembaca ini: status suka/simpan, polling, dan asal otomatis dari repo. */
export type PostMeta = { viewer: ViewerState; poll: PollData | null; autopost: AutopostInfo | null };
export type FeedPost = FeedPostBase &
  PostMeta & {
    ref: (FeedPostBase & PostMeta) | null;
  };

export type FeedQuery =
  | { tab: "all" }
  | { tab: "forYou" }
  | { tab: "trending" }
  | { tab: "following" }
  | { tab: "tag"; tag: string }
  | { tab: "search"; q: string }
  | { tab: "bookmarks" }
  | { tab: "user"; authorId: string };

export type FeedPage = { items: FeedPost[]; next: string | null };

// ---------- Teks: hashtag, mention, link, kode ----------

export type Token =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string; tag: string }
  | { type: "mention"; value: string; username: string }
  | { type: "url"; value: string; href: string }
  | { type: "code"; value: string }
  | { type: "codeblock"; value: string; lang: string };

// Aturan sama dengan trigger di database (0005): hashtag tidak didahului huruf/angka/_/&, mention tidak didahului @ / .
const HASHTAG_RE = /(?<![\p{L}\p{N}_/&])#([\p{L}\p{N}_]{1,50})/gu;
const MENTION_RE = /(?<![\p{L}\p{N}_@/.])@([\p{L}\p{N}_-]{1,39})/gu;
const INLINE_RE = /(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])|(?<![\p{L}\p{N}_/&])#([\p{L}\p{N}_]{1,50})|(?<![\p{L}\p{N}_@/.])@([\p{L}\p{N}_-]{1,39})/gu;

export function extractHashtags(body: string): string[] {
  return [...new Set([...body.matchAll(HASHTAG_RE)].map((m) => (m[1] as string).toLowerCase()))];
}

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => (m[1] as string).toLowerCase()))];
}

function tokenizePlain(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: "text", value: text.slice(last, i) });
    if (m[1]) out.push({ type: "url", value: m[1], href: m[1] });
    else if (m[2]) out.push({ type: "hashtag", value: m[0], tag: m[2].toLowerCase() });
    else if (m[3]) out.push({ type: "mention", value: m[0], username: m[3] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function tokenizeInline(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const i = m.index ?? 0;
    if (i > last) out.push(...tokenizePlain(text.slice(last, i)));
    out.push({ type: "code", value: m[1] as string });
    last = i + m[0].length;
  }
  if (last < text.length) out.push(...tokenizePlain(text.slice(last)));
  return out;
}

/** Memecah isi post jadi potongan yang bisa dirender: teks, #hashtag, @mention, link, `kode`, dan blok ```kode```. */
export function tokenizeBody(body: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of body.matchAll(/```([\p{L}\p{N}_+-]*)\n?([\s\S]*?)```/gu)) {
    const i = m.index ?? 0;
    if (i > last) out.push(...tokenizeInline(body.slice(last, i)));
    out.push({ type: "codeblock", lang: (m[1] as string) || "", value: (m[2] as string).replace(/\n$/, "") });
    last = i + m[0].length;
  }
  if (last < body.length) out.push(...tokenizeInline(body.slice(last)));
  return out;
}

// ---------- Ambil data ----------

const AUTHOR = "author:profiles!feed_posts_author_id_fkey(username,display_name,avatar_url)";
const BASE = "id,author_id,kind,body,parent_id,ref_id,like_count,reply_count,repost_count,created_at";
// Post yang dikutip/di-repost TIDAK di-embed (self-join feed_posts -> feed_posts). Embed itu bergantung pada relasi
// di schema cache PostgREST dan gagal dengan "Could not find a relationship between 'feed_posts' and 'feed_posts'"
// kalau cache basi. Sebagai gantinya, `attachRefs` mengambilnya lewat satu query terpisah.
const POST_SELECT = `${BASE},${AUTHOR}`;

type RawPost = FeedPostBase & { ref: FeedPostBase | null };

/** Menempelkan post yang dikutip/di-repost (kolom ref_id) ke tiap baris, dengan satu query tambahan bila perlu. */
async function attachRefs(rows: FeedPostBase[]): Promise<RawPost[]> {
  const refIds = [...new Set(rows.map((r) => r.ref_id).filter((x): x is string => !!x))];
  const refs = new Map<string, FeedPostBase>();
  if (refIds.length) {
    const res = await db.from("feed_posts").select(POST_SELECT).in("id", refIds);
    fail(res.error);
    for (const p of (res.data ?? []) as FeedPostBase[]) refs.set(p.id, p);
  }
  return rows.map((r) => ({ ...r, ref: r.ref_id ? (refs.get(r.ref_id) ?? null) : null }));
}

const NO_VIEWER: ViewerState = { liked: false, bookmarked: false, reposted: false };

async function withViewer(rows: RawPost[], userId: string | undefined): Promise<FeedPost[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.ref ? [r.id, r.ref.id] : [r.id])))];
  // Polling dan penanda auto-post dimuat bersamaan; fetchPostExtras tidak pernah melempar galat.
  const extrasPromise = fetchPostExtras(ids, userId);
  let liked = new Set<string>();
  let marked = new Set<string>();
  let reposted = new Set<string>();
  if (userId && ids.length) {
    const [l, b, r] = await Promise.all([
      db.from("feed_likes").select("post_id").eq("user_id", userId).in("post_id", ids),
      db.from("feed_bookmarks").select("post_id").eq("user_id", userId).in("post_id", ids),
      db.from("feed_posts").select("ref_id").eq("author_id", userId).eq("kind", "repost").in("ref_id", ids),
    ]);
    liked = new Set((l.data ?? []).map((x: { post_id: string }) => x.post_id));
    marked = new Set((b.data ?? []).map((x: { post_id: string }) => x.post_id));
    reposted = new Set((r.data ?? []).map((x: { ref_id: string }) => x.ref_id));
  }
  const extras = await extrasPromise;
  const metaOf = (id: string): PostMeta => ({
    viewer: userId ? { liked: liked.has(id), bookmarked: marked.has(id), reposted: reposted.has(id) } : NO_VIEWER,
    poll: extras.polls.get(id) ?? null,
    autopost: extras.autoposts.get(id) ?? null,
  });
  return rows.map((r) => ({
    ...r,
    ...metaOf(r.id),
    ref: r.ref ? { ...r.ref, ...metaOf(r.ref.id) } : null,
  }));
}

/** Syarat "bukan dari akun yang disenyapkan/diblokir" untuk query post. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withoutHidden(query: any, hidden: string[]) {
  return hidden.length ? query.not("author_id", "in", `(${hidden.join(",")})`) : query;
}

const FOR_YOU_HOURS = 336;
const TRENDING_HOURS = 72;

/**
 * Halaman berperingkat ("Untuk Kamu" dan "Tren"). Kursornya adalah offset (angka dalam bentuk teks).
 * null = belum bisa diperingkat (fungsi database belum ada, kursor bukan angka, atau belum ada post sama sekali).
 */
async function fetchRankedPage(q: { tab: "forYou" | "trending" }, userId: string | undefined, before: string | undefined, limit: number): Promise<FeedPage | null> {
  const personal = q.tab === "forYou";
  const offset = before === undefined ? 0 : Number(before);
  if (!Number.isInteger(offset) || offset < 0) return null;
  const ids = await fetchRankedIds({ hours: personal ? FOR_YOU_HOURS : TRENDING_HOURS, limit, offset, personal });
  if (ids === null) return null;
  if (!ids.length) return offset === 0 ? null : { items: [], next: null };
  const [res, hidden] = await Promise.all([db.from("feed_posts").select(POST_SELECT).in("id", ids), fetchHiddenAuthorIds(userId)]);
  fail(res.error);
  const byId = new Map<string, RawPost>((await attachRefs((res.data ?? []) as FeedPostBase[])).map((p) => [p.id, p]));
  const rows = ids.map((id) => byId.get(id)).filter((p): p is RawPost => !!p && !hidden.includes(p.author_id));
  return { items: await withViewer(rows, userId), next: ids.length === limit ? String(offset + limit) : null };
}

export async function fetchFeed(q: FeedQuery, userId: string | undefined, before?: string, limit = PAGE_SIZE): Promise<FeedPage> {
  let rows: RawPost[] = [];
  let next: string | null = null;

  if (q.tab === "bookmarks") {
    if (!userId) return { items: [], next: null };
    let bq = db.from("feed_bookmarks").select("post_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (before) bq = bq.lt("created_at", before);
    const marks = await bq;
    fail(marks.error);
    const list = (marks.data ?? []) as { post_id: string; created_at: string }[];
    if (list.length) {
      const posts = await db.from("feed_posts").select(POST_SELECT).in("id", list.map((x) => x.post_id));
      fail(posts.error);
      const byId = new Map<string, RawPost>((await attachRefs((posts.data ?? []) as FeedPostBase[])).map((p) => [p.id, p]));
      rows = list.map((x) => byId.get(x.post_id)).filter((p): p is RawPost => !!p);
      next = list.length === limit ? (list[list.length - 1] as { created_at: string }).created_at : null;
    }
    return { items: await withViewer(rows, userId), next };
  }

  if (q.tab === "forYou" || q.tab === "trending") {
    const ranked = await fetchRankedPage(q, userId, before, limit);
    if (ranked) return ranked;
    // Peringkat belum tersedia: Tren kosong, "Untuk Kamu" memakai urutan terbaru (kursor waktu bila sudah berpindah halaman).
    if (q.tab === "trending") return { items: [], next: null };
    return fetchFeed({ tab: "all" }, userId, before !== undefined && Number.isNaN(Number(before)) ? before : undefined, limit);
  }

  let pq = db.from("feed_posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(limit);
  if (before) pq = pq.lt("created_at", before);

  if (q.tab === "user") {
    pq = pq.neq("kind", "reply").eq("author_id", q.authorId);
  } else {
    // Linimasa, Mengikuti, tagar, dan pencarian tidak menampilkan akun yang disenyapkan atau diblokir.
    pq = withoutHidden(pq, await fetchHiddenAuthorIds(userId));
    if (q.tab === "all") {
      pq = pq.neq("kind", "reply");
    } else if (q.tab === "following") {
      if (!userId) return { items: [], next: null };
      const f = await db.from("follows").select("following_id").eq("follower_id", userId).limit(1000);
      fail(f.error);
      const ids = [userId, ...(f.data ?? []).map((x: { following_id: string }) => x.following_id)];
      pq = pq.neq("kind", "reply").in("author_id", ids);
    } else if (q.tab === "tag") {
      const tags = await db.from("feed_hashtags").select("post_id").eq("tag", q.tag.toLowerCase()).order("created_at", { ascending: false }).limit(500);
      fail(tags.error);
      const ids = (tags.data ?? []).map((x: { post_id: string }) => x.post_id);
      if (!ids.length) return { items: [], next: null };
      pq = pq.in("id", ids);
    } else if (q.tab === "search") {
      const words = searchWords(q.q);
      if (!words.length) return { items: [], next: null };
      pq = pq.neq("kind", "repost");
      // `_` adalah wildcard di ILIKE; searchWords sudah membuang % dan karakter lain yang berbahaya.
      for (const w of words) pq = pq.ilike("body", `%${w.replace(/_/g, "\\_")}%`);
    }
  }

  const res = await pq;
  fail(res.error);
  rows = await attachRefs((res.data ?? []) as FeedPostBase[]);
  next = rows.length === limit ? (rows[rows.length - 1] as RawPost).created_at : null;
  return { items: await withViewer(rows, userId), next };
}

export async function fetchPost(id: string, userId: string | undefined): Promise<FeedPost | null> {
  const res = await db.from("feed_posts").select(POST_SELECT).eq("id", id).maybeSingle();
  fail(res.error);
  if (!res.data) return null;
  return (await withViewer(await attachRefs([res.data as FeedPostBase]), userId))[0] ?? null;
}

export async function fetchReplies(id: string, userId: string | undefined): Promise<FeedPost[]> {
  const hidden = await fetchHiddenAuthorIds(userId);
  const res = await withoutHidden(db.from("feed_posts").select(POST_SELECT).eq("parent_id", id), hidden).order("created_at", { ascending: true }).limit(200);
  fail(res.error);
  return withViewer(await attachRefs((res.data ?? []) as FeedPostBase[]), userId);
}

// ---------- Aksi ----------

export async function createPost(userId: string, input: { kind: "post" | "reply" | "quote"; body: string; parentId?: string; refId?: string }) {
  const { error } = await db.from("feed_posts").insert({
    author_id: userId,
    kind: input.kind,
    body: input.body.trim(),
    parent_id: input.parentId ?? null,
    ref_id: input.refId ?? null,
  });
  fail(error);
}

export async function deletePost(id: string) {
  const { error } = await db.from("feed_posts").delete().eq("id", id);
  fail(error);
}

export async function setLike(userId: string, postId: string, on: boolean) {
  const { error } = on
    ? await db.from("feed_likes").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await db.from("feed_likes").delete().eq("post_id", postId).eq("user_id", userId);
  fail(error);
}

export async function setBookmark(userId: string, postId: string, on: boolean) {
  const { error } = on
    ? await db.from("feed_bookmarks").upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
    : await db.from("feed_bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
  fail(error);
}

export async function setRepost(userId: string, refId: string, on: boolean) {
  const { error } = on
    ? await db.from("feed_posts").insert({ author_id: userId, kind: "repost", body: "", ref_id: refId })
    : await db.from("feed_posts").delete().eq("author_id", userId).eq("kind", "repost").eq("ref_id", refId);
  fail(error);
}

// ---------- Notifikasi ----------

export type NotificationType = "like" | "reply" | "mention" | "follow" | "repost" | "quote";
export type FeedNotification = {
  id: string;
  type: NotificationType;
  post_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: FeedAuthor;
  post: { id: string; body: string; kind: FeedKind } | null;
};

export async function fetchNotifications(userId: string, limit = 60): Promise<FeedNotification[]> {
  const res = await db
    .from("feed_notifications")
    .select("id,type,post_id,read_at,created_at,actor:profiles!feed_notifications_actor_id_fkey(username,display_name,avatar_url),post:feed_posts!feed_notifications_post_id_fkey(id,body,kind)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(res.error);
  return (res.data ?? []) as FeedNotification[];
}

/** 0 kalau tabel belum ada atau belum masuk, supaya header tidak error. */
export async function fetchUnreadCount(userId: string): Promise<number> {
  const res = await db.from("feed_notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return res.error ? 0 : (res.count ?? 0);
}

export async function markNotificationsRead(userId: string) {
  const { error } = await db.from("feed_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  fail(error);
}
