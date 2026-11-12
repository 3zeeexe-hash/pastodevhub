// Pesan langsung 1-lawan-1 (Fase 4). Tabel dm_* dan fungsi dm_* dibuat lewat docs/sql/0007_diskusi_fase4.sql.
import { db, fail, isMissingSchemaError } from "@/lib/feed-db";
import { dmBodyError } from "@/lib/feed-rules";

export const DM_NOT_READY = "Pesan langsung belum aktif di database. Minta admin menerapkan docs/sql/0007_diskusi_fase4.sql lewat Lovable.";

export type Conversation = {
  conversation_id: string;
  other_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_body: string;
  last_sender: string;
  last_at: string;
  unread: number;
};

export type DmMessage = { id: string; sender_id: string; body: string; created_at: string };
export type DmPartner = { id: string; username: string; display_name: string | null; avatar_url: string | null };

function dmError(error: { code?: string; message: string }): Error {
  return new Error(isMissingSchemaError(error) ? DM_NOT_READY : error.message);
}

export async function fetchInbox(): Promise<Conversation[]> {
  const { data, error } = await db.rpc("dm_inbox");
  if (error) throw dmError(error);
  return ((data ?? []) as (Omit<Conversation, "unread"> & { unread: number | string })[]).map((c) => ({ ...c, unread: Number(c.unread) }));
}

/** Jumlah percakapan yang punya pesan belum dibaca. 0 kalau belum masuk atau fiturnya belum ada. */
export async function fetchDmUnread(userId: string | undefined): Promise<number> {
  if (!userId) return 0;
  const { data, error } = await db.rpc("dm_unread_count");
  return error ? 0 : Number(data ?? 0);
}

/** Membuka (atau membuat) percakapan dengan seorang pengguna dan mengembalikan id percakapan. */
export async function startConversation(username: string): Promise<string> {
  const { data: profile, error: pe } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
  fail(pe);
  if (!profile) throw new Error("Pengguna tidak ditemukan.");
  const { data, error } = await db.rpc("dm_get_or_create", { _other: (profile as { id: string }).id });
  if (error) throw dmError(error);
  return data as string;
}

export async function fetchPartner(conversationId: string, userId: string): Promise<DmPartner | null> {
  const { data, error } = await db
    .from("dm_participants")
    .select("profile:profiles!dm_participants_user_id_fkey(id,username,display_name,avatar_url)")
    .eq("conversation_id", conversationId)
    .neq("user_id", userId)
    .maybeSingle();
  if (error) throw dmError(error);
  return ((data as { profile: DmPartner | null } | null)?.profile ?? null);
}

/** 150 pesan terakhir, urut dari yang terlama ke terbaru. */
export async function fetchMessages(conversationId: string): Promise<DmMessage[]> {
  const { data, error } = await db
    .from("dm_messages")
    .select("id,sender_id,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw dmError(error);
  return ((data ?? []) as DmMessage[]).reverse();
}

export async function sendMessage(userId: string, conversationId: string, body: string) {
  const bad = dmBodyError(body);
  if (bad) throw new Error(bad);
  const { error } = await db.from("dm_messages").insert({ conversation_id: conversationId, sender_id: userId, body: body.trim() });
  if (error) throw dmError(error);
}

export async function deleteMessage(id: string) {
  const { error } = await db.from("dm_messages").delete().eq("id", id);
  fail(error);
}

export async function markConversationRead(userId: string, conversationId: string) {
  const { error } = await db
    .from("dm_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  fail(error);
}
