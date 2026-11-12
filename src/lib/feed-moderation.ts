// Moderasi Linimasa (Fase 4): sembunyikan/blokir akun, laporkan post, dan antrean laporan untuk admin.
import { db, fail } from "@/lib/feed-db";
import type { ReportReason } from "@/lib/feed-rules";

export type UserFilterKind = "mute" | "block";

export type UserFilter = {
  target_id: string;
  kind: UserFilterKind;
  created_at: string;
  profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

/** Id akun yang disenyapkan atau diblokir pembaca. Kosong kalau belum masuk atau tabelnya belum ada. */
export async function fetchHiddenAuthorIds(userId: string | undefined): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await db.from("feed_user_blocks").select("target_id").eq("user_id", userId).limit(200);
  if (error) return [];
  return ((data ?? []) as { target_id: string }[]).map((r) => r.target_id);
}

export async function fetchUserFilters(userId: string): Promise<UserFilter[]> {
  const { data, error } = await db
    .from("feed_user_blocks")
    .select("target_id,kind,created_at,profile:profiles!feed_user_blocks_target_id_fkey(username,display_name,avatar_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  fail(error);
  return (data ?? []) as UserFilter[];
}

/** kind = null menghapus senyap/blokir. Mengganti jenis kalau sudah ada. */
export async function setUserFilter(userId: string, targetId: string, kind: UserFilterKind | null) {
  const { error } = kind
    ? await db.from("feed_user_blocks").upsert({ user_id: userId, target_id: targetId, kind }, { onConflict: "user_id,target_id" })
    : await db.from("feed_user_blocks").delete().eq("user_id", userId).eq("target_id", targetId);
  fail(error);
}

// ---------- Laporan ----------

export async function submitReport(userId: string, postId: string, reason: ReportReason, note: string) {
  const { error } = await db.from("feed_reports").insert({ reporter_id: userId, post_id: postId, reason, note: note.trim() });
  if (error) throw new Error(error.code === "23505" ? "Kamu sudah melaporkan post ini." : error.message);
}

export type ReportStatus = "open" | "resolved" | "dismissed";

export type ReportRow = {
  id: string;
  post_id: string | null;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  action: string | null;
  snapshot: string;
  created_at: string;
  resolved_at: string | null;
  reporter: { username: string } | null;
  author: { username: string } | null;
};

export async function fetchReports(status: ReportStatus, limit = 100): Promise<ReportRow[]> {
  const { data, error } = await db
    .from("feed_reports")
    .select(
      "id,post_id,reason,note,status,action,snapshot,created_at,resolved_at," +
        "reporter:profiles!feed_reports_reporter_id_fkey(username),author:profiles!feed_reports_author_id_fkey(username)",
    )
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .limit(limit);
  fail(error);
  return (data ?? []) as ReportRow[];
}

export async function countOpenReports(): Promise<number> {
  const { count, error } = await db.from("feed_reports").select("id", { count: "exact", head: true }).eq("status", "open");
  return error ? 0 : (count ?? 0);
}

/**
 * Menutup semua laporan terbuka untuk satu post. Dengan `deletePost`, post dihapus sesudah laporannya ditandai
 * (laporan tetap tersimpan sebagai catatan karena post_id hanya dikosongkan saat post hilang).
 */
export async function resolveReportsForPost(opts: { postId: string; adminId: string; status: "resolved" | "dismissed"; deletePost: boolean }) {
  const { error } = await db
    .from("feed_reports")
    .update({
      status: opts.status,
      action: opts.deletePost ? "post_deleted" : opts.status === "dismissed" ? "dismissed" : "reviewed",
      resolved_by: opts.adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq("post_id", opts.postId)
    .eq("status", "open");
  fail(error);
  if (opts.deletePost) {
    const del = await db.from("feed_posts").delete().eq("id", opts.postId);
    fail(del.error);
  }
}
