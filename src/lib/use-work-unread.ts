// GOBI WORK: data bersama untuk notifikasi dan obrolan kerja (dipakai header, menu samping, chat mengambang, dan halaman kerja).
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { workRpc } from "@/lib/work-db";

// ============ Notifikasi ============
export type WorkNotif = { id: number; kind: string; title: string; link: string | null; read_at: string | null; created_at: string };
export type NotifGroup = "lamaran" | "kontrak" | "pembayaran" | "pesan" | "lainnya";
export type NotifTone = "ok" | "bad" | "info";

export const GROUP_LABEL: Record<NotifGroup, string> = {
  lamaran: "Lamaran & lowongan",
  kontrak: "Kontrak & pekerjaan",
  pembayaran: "Pembayaran",
  pesan: "Pesan",
  lainnya: "Lainnya",
};

const GROUP_OF: Record<string, NotifGroup> = {
  application_new: "lamaran", application_viewed: "lamaran", application_stage: "lamaran", application_accepted: "lamaran",
  application_rejected: "lamaran", application_withdrawn: "lamaran", job_new: "lamaran", job_approved: "lamaran", job_rejected: "lamaran", job_closed: "lamaran",
  contract_new: "kontrak", contract_approved: "kontrak", contract_rejected: "kontrak", contract_cancelled: "kontrak",
  milestone_started: "kontrak", work_submitted: "kontrak", revision_requested: "kontrak", work_approved: "kontrak",
  dispute_update: "kontrak", review_received: "kontrak",
  payment_received: "pembayaran", payout_processing: "pembayaran",
  message: "pesan",
};

/** Mengelompokkan jenis notifikasi supaya bisa disaring dan diberi ikon yang sesuai. */
export function notifGroup(kind: string): NotifGroup {
  const known = GROUP_OF[kind];
  if (known) return known;
  if (kind.startsWith("application_") || kind.startsWith("job_")) return "lamaran";
  if (kind.startsWith("contract_") || kind.startsWith("milestone_") || kind.startsWith("work_")) return "kontrak";
  return "lainnya";
}

const BAD = new Set(["application_rejected", "job_rejected", "contract_rejected", "contract_cancelled", "revision_requested", "dispute_update", "application_withdrawn", "job_closed"]);
const OK = new Set(["application_accepted", "job_approved", "contract_approved", "work_approved", "payment_received", "payout_processing", "review_received"]);
export function notifTone(kind: string): NotifTone {
  return BAD.has(kind) ? "bad" : OK.has(kind) ? "ok" : "info";
}

export async function fetchWorkNotifs(limit: number): Promise<WorkNotif[]> {
  const { data, error } = await looseDb.from("work_notifications").select("id,kind,title,link,read_at,created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(errMsg(error));
  return (data ?? []) as WorkNotif[];
}

export function useWorkNotifs(limit: number) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["work-notifs", limit], queryFn: () => fetchWorkNotifs(limit), enabled: !!user, refetchInterval: 60_000 });
}

async function countUnread(table: "work_notifications" | "job_messages", uid?: string): Promise<number> {
  let q = looseDb.from(table).select("id", { count: "exact", head: true }).is(table === "work_notifications" ? "read_at" : "read_at", null);
  if (table === "job_messages" && uid) q = q.neq("sender_id", uid);
  const r = await q;
  return r.error ? 0 : r.count ?? 0;
}

export function useWorkNotifUnread(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["work-unread-notifs", user?.id ?? null], queryFn: () => countUnread("work_notifications"), enabled: !!user && enabled, refetchInterval: 60_000 });
}

export function useWorkChatUnread(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["work-chat-unread", user?.id ?? null], queryFn: () => countUnread("job_messages", user!.id), enabled: !!user && enabled, refetchInterval: 30_000 });
}

/** Menandai satu notifikasi dibaca. Fungsi ini ada setelah SQL 006; sebelum itu gagal diam-diam dan "Tandai semua dibaca" tetap bisa dipakai. */
export async function markWorkNotifRead(id: number) {
  try { await workRpc("work_mark_notification_read", { _id: id }); } catch { /* SQL 006 belum dijalankan */ }
}

export function refreshWorkNotifs(qc: QueryClient) {
  return Promise.all(["work-notifs", "work-unread-notifs", "work-stats"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

// ============ Obrolan kerja ============
export type WorkConv = {
  id: string; status: string; developer_id: string; created_at: string;
  job: { id: string; title: string; client_id: string } | null;
  developer: { username: string; display_name: string | null } | null;
};
const CONV_SELECT = "id,status,developer_id,created_at,job:jobs!inner(id,title,client_id), developer:profiles!job_applications_developer_id_fkey(username,display_name)";

/** Semua obrolan lamaran milik pengguna (sebagai pelamar maupun sebagai pemilik lowongan), terbaru dulu, beserta jumlah pesan belum dibaca. */
export async function fetchWorkConversations(uid: string) {
  const [asDev, asClient] = await Promise.all([
    looseDb.from("job_applications").select(CONV_SELECT).eq("developer_id", uid).neq("status", "withdrawn"),
    looseDb.from("job_applications").select(CONV_SELECT).eq("job.client_id", uid).neq("status", "withdrawn"),
  ]);
  if (asDev.error) throw new Error(errMsg(asDev.error));
  if (asClient.error) throw new Error(errMsg(asClient.error));
  const map = new Map<string, WorkConv>();
  for (const r of [...(asDev.data ?? []), ...(asClient.data ?? [])] as unknown as WorkConv[]) map.set(r.id, r);
  const unread: Record<string, number> = {};
  // read_at ada setelah SQL 002; jika belum, penanda belum dibaca tidak ditampilkan.
  const u = await looseDb.from("job_messages").select("application_id").is("read_at", null).neq("sender_id", uid);
  if (!u.error) for (const r of (u.data ?? []) as { application_id: string }[]) unread[r.application_id] = (unread[r.application_id] ?? 0) + 1;
  return { rows: [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)), unread };
}

/** Nama lawan bicara dari sudut pandang pengguna. */
export function otherPartyName(c: WorkConv, uid: string) {
  return c.developer_id === uid ? "Client" : c.developer?.display_name || c.developer?.username || "Pelamar";
}
