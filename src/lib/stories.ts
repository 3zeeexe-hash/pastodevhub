import { supabase } from "@/integrations/supabase/client";

/** Story tampil 24 jam sejak dibuat, lalu hilang. Database juga menegakkan aturan ini (expires_at diisi server). */
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STORY_MAX_CHARS = 300;
/** Lama satu story tampil di penampil sebelum pindah ke berikutnya. */
export const STORY_DURATION_MS = 5000;

export const STORY_BGS = ["senja", "malam", "laut", "hutan", "mawar"] as const;
export type StoryBg = (typeof STORY_BGS)[number];
export const STORY_BG_CLASS: Record<StoryBg, string> = {
  senja: "story-senja", malam: "story-malam", laut: "story-laut", hutan: "story-hutan", mawar: "story-mawar",
};

export type Story = {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  bg: string;
  created_at: string;
  expires_at: string;
  author: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export type StoryGroup = {
  authorId: string;
  author: NonNullable<Story["author"]>;
  stories: Story[];
  /** Semua story di grup ini sudah dilihat. */
  seen: boolean;
  isMine: boolean;
};

export function storyExpiresAt(createdAt: string | Date): Date {
  return new Date(new Date(createdAt).getTime() + STORY_LIFETIME_MS);
}

export function isStoryActive(s: { created_at: string; expires_at?: string | null }, now: Date = new Date()): boolean {
  const end = s.expires_at ? new Date(s.expires_at) : storyExpiresAt(s.created_at);
  return end.getTime() > now.getTime() && storyExpiresAt(s.created_at).getTime() > now.getTime();
}

/** Sisa umur story untuk ditampilkan, misalnya "sisa 5 jam". */
export function storyTimeLeft(s: { created_at: string; expires_at?: string | null }, now: Date = new Date()): string {
  const end = s.expires_at ? new Date(s.expires_at) : storyExpiresAt(s.created_at);
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return "sudah berakhir";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `sisa ${h} jam`;
  return `sisa ${Math.max(1, Math.floor(ms / 60_000))} menit`;
}

/**
 * Kelompokkan story per penulis. Urutan: story saya dulu, lalu yang belum dilihat, lalu yang sudah dilihat.
 * Di dalam grup, story diurutkan dari yang paling lama supaya diputar berurutan. Story kedaluwarsa dibuang.
 */
export function groupStories(stories: Story[], seenIds: Set<string>, me: string | null, now: Date = new Date()): StoryGroup[] {
  const map = new Map<string, StoryGroup>();
  for (const s of stories) {
    if (!s.author || !isStoryActive(s, now)) continue;
    let g = map.get(s.author_id);
    if (!g) {
      g = { authorId: s.author_id, author: s.author, stories: [], seen: true, isMine: s.author_id === me };
      map.set(s.author_id, g);
    }
    g.stories.push(s);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.stories.sort((a, b) => a.created_at.localeCompare(b.created_at));
    g.seen = g.isMine || g.stories.every((s) => seenIds.has(s.id));
  }
  const latest = (g: StoryGroup) => g.stories[g.stories.length - 1]!.created_at;
  return groups.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.seen !== b.seen) return a.seen ? 1 : -1;
    return latest(b).localeCompare(latest(a));
  });
}

export async function fetchStoryGroups(me: string | null): Promise<StoryGroup[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("feed_stories")
    .select("id,author_id,body,image_url,bg,created_at,expires_at, author:profiles!feed_stories_author_id_fkey(username,display_name,avatar_url)")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const stories = (data ?? []) as unknown as Story[];
  let seen = new Set<string>();
  if (me && stories.length) {
    const v = await supabase.from("feed_story_views").select("story_id").eq("viewer_id", me).in("story_id", stories.map((s) => s.id));
    seen = new Set((v.data ?? []).map((r) => r.story_id));
  }
  return groupStories(stories, seen, me);
}

export async function createStory(me: string, input: { body: string; bg: StoryBg; imageUrl: string | null }) {
  const body = input.body.trim();
  if (!body && !input.imageUrl) throw new Error("Tulis sesuatu atau pilih gambar dulu.");
  if (body.length > STORY_MAX_CHARS) throw new Error(`Maksimal ${STORY_MAX_CHARS} huruf.`);
  const { error } = await supabase.from("feed_stories").insert({ author_id: me, body, bg: input.bg, image_url: input.imageUrl });
  if (error) throw error;
}

export async function deleteStory(id: string) {
  const { error } = await supabase.from("feed_stories").delete().eq("id", id);
  if (error) throw error;
}

export async function markStoryViewed(storyId: string, me: string) {
  await supabase.from("feed_story_views").upsert({ story_id: storyId, viewer_id: me }, { onConflict: "story_id,viewer_id", ignoreDuplicates: true });
}

export async function fetchStoryViewCount(storyId: string): Promise<number> {
  const { count } = await supabase.from("feed_story_views").select("story_id", { count: "exact", head: true }).eq("story_id", storyId);
  return count ?? 0;
}
