// Daftar percakapan kerja (obrolan lamaran): satu percakapan per lamaran, lengkap dengan pesan terakhir dan jumlah belum dibaca.
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";

type Person = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type AppRow = {
  id: string;
  status: string;
  developer_id: string;
  created_at: string;
  job: { id: string; title: string; client_id: string } | null;
  developer: { username: string; display_name: string | null; avatar_url: string | null } | null;
};
type LastMsg = { application_id: string; body: string; created_at: string; sender_id: string };

export type WorkConversation = {
  id: string;
  jobId: string | null;
  jobTitle: string;
  otherName: string;
  otherUsername: string | null;
  otherAvatar: string | null;
  lastBody: string | null;
  lastSender: string | null;
  lastAt: string;
  unread: number;
};

const SELECT = "id,status,developer_id,created_at,job:jobs!inner(id,title,client_id), developer:profiles!job_applications_developer_id_fkey(username,display_name,avatar_url)";

export async function fetchWorkConversations(uid: string): Promise<WorkConversation[]> {
  const [asDev, asClient] = await Promise.all([
    looseDb.from("job_applications").select(SELECT).eq("developer_id", uid).neq("status", "withdrawn"),
    looseDb.from("job_applications").select(SELECT).eq("job.client_id", uid).neq("status", "withdrawn"),
  ]);
  if (asDev.error) throw new Error(errMsg(asDev.error));
  if (asClient.error) throw new Error(errMsg(asClient.error));
  const map = new Map<string, AppRow>();
  for (const r of [...(asDev.data ?? []), ...(asClient.data ?? [])] as unknown as AppRow[]) map.set(r.id, r);
  const rows = [...map.values()];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Kalau aku pelamar, lawan bicaraku adalah client lowongan itu.
  const clientIds = [...new Set(rows.filter((r) => r.developer_id === uid && r.job).map((r) => r.job!.client_id))];
  const clients = new Map<string, Person>();
  if (clientIds.length) {
    const p = await looseDb.from("profiles").select("id,username,display_name,avatar_url").in("id", clientIds);
    if (!p.error) for (const x of (p.data ?? []) as Person[]) clients.set(x.id, x);
  }

  const last = new Map<string, LastMsg>();
  const m = await looseDb.from("job_messages").select("application_id,body,created_at,sender_id").in("application_id", ids).order("created_at", { ascending: false }).limit(1000);
  if (!m.error) for (const r of (m.data ?? []) as LastMsg[]) if (!last.has(r.application_id)) last.set(r.application_id, r);

  // read_at ada setelah SQL 002; jika belum, penanda belum dibaca tidak ditampilkan.
  const unread: Record<string, number> = {};
  const u = await looseDb.from("job_messages").select("application_id").in("application_id", ids).is("read_at", null).neq("sender_id", uid);
  if (!u.error) for (const r of (u.data ?? []) as { application_id: string }[]) unread[r.application_id] = (unread[r.application_id] ?? 0) + 1;

  return rows
    .map((r): WorkConversation => {
      const iAmDeveloper = r.developer_id === uid;
      const client = r.job ? clients.get(r.job.client_id) : undefined;
      const other = iAmDeveloper ? client : r.developer;
      const lm = last.get(r.id);
      return {
        id: r.id,
        jobId: r.job?.id ?? null,
        jobTitle: r.job?.title ?? "Lowongan",
        otherName: other?.display_name || other?.username || (iAmDeveloper ? "Client" : "Pelamar"),
        otherUsername: other?.username ?? null,
        otherAvatar: other?.avatar_url ?? null,
        lastBody: lm?.body ?? null,
        lastSender: lm?.sender_id ?? null,
        lastAt: lm?.created_at ?? r.created_at,
        unread: unread[r.id] ?? 0,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
