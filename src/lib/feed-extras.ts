// Tambahan di atas post (Fase 3-4): polling dan penanda "post otomatis dari repo".
// Semua pembacaan bersifat lunak: kalau tabelnya belum dibuat (SQL 0006/0007 belum diterapkan),
// hasilnya kosong dan linimasa tetap jalan seperti biasa.
import { db, fail } from "@/lib/feed-db";

export type PollData = {
  options: string[];
  endsAt: string;
  /** Jumlah suara per pilihan, sejajar dengan `options`. */
  counts: number[];
  total: number;
  /** Indeks pilihan yang dipilih pembaca, atau null kalau belum memilih. */
  myVote: number | null;
};

export type AutopostInfo = { repoPath: string; commitId: string | null };

export type PostExtras = { polls: Map<string, PollData>; autoposts: Map<string, AutopostInfo> };

type PollRow = { post_id: string; options: string[]; ends_at: string };
type AutopostRow = {
  post_id: string;
  commit_id: string | null;
  repo: { name: string; owner: { username: string } | null } | null;
};

export async function fetchPostExtras(ids: string[], userId: string | undefined): Promise<PostExtras> {
  const out: PostExtras = { polls: new Map(), autoposts: new Map() };
  if (!ids.length) return out;
  try {
    const [pollsRes, autoRes] = await Promise.all([
      db.from("feed_polls").select("post_id,options,ends_at").in("post_id", ids),
      db
        .from("feed_autoposts")
        .select("post_id,commit_id,repo:repositories(name,owner:profiles!repositories_owner_id_fkey(username))")
        .in("post_id", ids),
    ]);

    for (const a of (autoRes.error ? [] : (autoRes.data ?? [])) as AutopostRow[]) {
      const owner = a.repo?.owner?.username;
      if (!a.repo || !owner) continue;
      out.autoposts.set(a.post_id, { repoPath: `${owner}/${a.repo.name}`, commitId: a.commit_id });
    }

    const pollRows = (pollsRes.error ? [] : (pollsRes.data ?? [])) as PollRow[];
    if (pollRows.length) {
      const pollIds = pollRows.map((p) => p.post_id);
      const [results, mine] = await Promise.all([
        db.rpc("feed_poll_results", { _post_ids: pollIds }),
        userId
          ? db.from("feed_poll_votes").select("post_id,option_idx").eq("user_id", userId).in("post_id", pollIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const counts = new Map<string, number[]>();
      for (const p of pollRows) counts.set(p.post_id, p.options.map(() => 0));
      for (const r of (results.error ? [] : (results.data ?? [])) as { post_id: string; option_idx: number; votes: number | string }[]) {
        const arr = counts.get(r.post_id);
        if (arr && r.option_idx >= 0 && r.option_idx < arr.length) arr[r.option_idx] = Number(r.votes);
      }
      const votes = new Map<string, number>();
      for (const v of (mine.error ? [] : (mine.data ?? [])) as { post_id: string; option_idx: number }[]) votes.set(v.post_id, v.option_idx);
      for (const p of pollRows) {
        const c = counts.get(p.post_id) ?? [];
        out.polls.set(p.post_id, {
          options: p.options,
          endsAt: p.ends_at,
          counts: c,
          total: c.reduce((a, b) => a + b, 0),
          myVote: votes.get(p.post_id) ?? null,
        });
      }
    }
  } catch {
    // Jaringan putus atau tabel belum ada: tampilkan post tanpa tambahan.
  }
  return out;
}

// ---------- Aksi polling ----------

export async function createPoll(input: { body: string; options: string[]; hours: number }): Promise<string> {
  const { data, error } = await db.rpc("feed_create_poll", { _body: input.body.trim(), _options: input.options, _hours: input.hours });
  fail(error);
  return data as string;
}

export async function votePoll(userId: string, postId: string, optionIdx: number) {
  const { error } = await db.from("feed_poll_votes").insert({ post_id: postId, user_id: userId, option_idx: optionIdx });
  if (error) throw new Error(error.code === "23505" ? "Kamu sudah memilih di polling ini." : error.message);
}

// ---------- Posting otomatis dari repo ----------

/** true = aktif, false = mati, null = fitur belum tersedia di database. */
export async function fetchAutopostEnabled(repoId: string): Promise<boolean | null> {
  const { data, error } = await db.from("feed_autopost_repos").select("repo_id").eq("repo_id", repoId).maybeSingle();
  if (error) return null;
  return !!data;
}

export async function setAutopost(userId: string, repoId: string, on: boolean) {
  const { error } = on
    ? await db.from("feed_autopost_repos").upsert({ repo_id: repoId, user_id: userId }, { onConflict: "repo_id", ignoreDuplicates: true })
    : await db.from("feed_autopost_repos").delete().eq("repo_id", repoId);
  fail(error);
}
