import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Change, RepoFile } from "@/lib/repo";

export type RepoRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  language: string | null;
  is_private: boolean;
  default_branch: string;
  topics: string[];
  homepage: string | null;
  forked_from: string | null;
  github_full_name: string | null;
  created_at: string;
  updated_at: string;
};

/** Loads every file of a repo, paging past the 1000-row API default. */
export async function fetchAllFiles(repoId: string): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("repo_files").select("*").eq("repo_id", repoId).order("path").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as RepoFile[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const repoKey = (username: string, repo: string) => ["repo", username, repo];

export function useRepo(username: string, repo: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...repoKey(username, repo), user?.id ?? "anon"],
    queryFn: async () => {
      const { data: owner } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("username", username).maybeSingle();
      if (!owner) return null;
      const { data: r } = await supabase.from("repositories").select("*").eq("owner_id", owner.id).eq("name", repo).maybeSingle();
      if (!r) return null;
      const [files, stars, mine, forks, parent, lastCommit, commitCount, openIssues, openPrs] = await Promise.all([
        fetchAllFiles(r.id),
        supabase.from("stars").select("*", { count: "exact", head: true }).eq("repo_id", r.id),
        user ? supabase.from("stars").select("repo_id").eq("repo_id", r.id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("repositories").select("*", { count: "exact", head: true }).eq("forked_from", r.id),
        r.forked_from
          ? supabase.from("repositories").select("id,name, owner:profiles!repositories_owner_id_fkey(username)").eq("id", r.forked_from).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("commits").select("id,message,created_at, author:profiles(username,avatar_url)").eq("repo_id", r.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("commits").select("*", { count: "exact", head: true }).eq("repo_id", r.id),
        supabase.from("issues").select("*", { count: "exact", head: true }).eq("repo_id", r.id).eq("state", "open"),
        supabase.from("pull_requests").select("*", { count: "exact", head: true }).eq("repo_id", r.id).eq("state", "open"),
      ]);
      return {
        repo: r as RepoRow,
        owner,
        files,
        stars: stars.count ?? 0,
        starred: !!mine.data,
        forks: forks.count ?? 0,
        parent: parent.data as { id: string; name: string; owner: { username: string } } | null,
        lastCommit: lastCommit.data as { id: string; message: string; created_at: string; author: { username: string; avatar_url: string | null } } | null,
        commitCount: commitCount.count ?? 0,
        openIssues: openIssues.count ?? 0,
        openPrs: openPrs.count ?? 0,
        isOwner: user?.id === owner.id,
      };
    },
  });
}
export type RepoData = NonNullable<ReturnType<typeof useRepo>["data"]>;

export function useRefreshRepo(username: string, repo: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: repoKey(username, repo) });
}

/**
 * Writes a set of file changes to a repo and records them as one commit.
 * Runs as the signed-in user; database rules only allow the repo owner.
 * `storeContent=false` keeps huge imports from duplicating every file into history.
 */
export async function commitChanges(opts: {
  repoId: string;
  authorId: string;
  message: string;
  changes: Change[];
  storeContent?: boolean;
  onProgress?: (done: number, total: number) => void;
}) {
  const { repoId, authorId, message, changes, storeContent = true, onProgress } = opts;
  const upserts = changes.filter((c) => c.type !== "delete");
  const deletes = changes.filter((c) => c.type === "delete").map((c) => c.path);
  const total = upserts.length + deletes.length;
  let done = 0;
  for (let i = 0; i < upserts.length; i += 50) {
    const chunk = upserts.slice(i, i + 50).map((c) => ({ repo_id: repoId, path: c.path, content: c.after ?? "", updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("repo_files").upsert(chunk, { onConflict: "repo_id,path" });
    if (error) throw new Error(error.message);
    done += chunk.length;
    onProgress?.(done, total);
  }
  for (let i = 0; i < deletes.length; i += 100) {
    const chunk = deletes.slice(i, i + 100);
    const { error } = await supabase.from("repo_files").delete().eq("repo_id", repoId).in("path", chunk);
    if (error) throw new Error(error.message);
    done += chunk.length;
    onProgress?.(done, total);
  }
  const stored = storeContent && changes.length <= 200
    ? changes
    : changes.map((c) => ({ path: c.path, type: c.type }));
  const { data, error } = await supabase.from("commits").insert({ repo_id: repoId, author_id: authorId, message, changes: stored as never }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
