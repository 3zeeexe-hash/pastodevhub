import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { GitMerge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo, useAuth } from "@/lib/auth";
import { commitChanges, fetchAllFiles, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { computeChanges, diffStats } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { StateBadge } from "@/components/state-badge";
import { SignInCta } from "@/components/sign-in-cta";
import { DiffView } from "@/components/diff-view";
import { MdEditor } from "@/components/repo/md-editor";
import { ThreadComment, type ThreadItem } from "@/components/repo/thread";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo/pulls/$number")({
  head: ({ params }) => ({
    meta: [
      { title: `Pull request #${params.number} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Pull request #${params.number} di ${params.username}/${params.repo}.` },
      { property: "og:title", content: `PR #${params.number} · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Tinjau perubahan pull request #${params.number}.` },
    ],
  }),
  component: PullPage,
});

function PullPage() {
  const { username, repo, number } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const [tab, setTab] = useState<"conversation" | "files">("conversation");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["pull", rd?.repo.id, number];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!rd && /^\d+$/.test(number),
    queryFn: async () => {
      const { data: pr } = await supabase.from("pull_requests").select("*, author:profiles(username,avatar_url), head:repositories!pull_requests_head_repo_id_fkey(id,name, owner:profiles!repositories_owner_id_fkey(username))").eq("repo_id", rd!.repo.id).eq("number", Number(number)).maybeSingle();
      if (!pr) return null;
      const { data: comments } = await supabase.from("pr_comments").select("*, author:profiles(username,avatar_url)").eq("pr_id", pr.id).order("created_at");
      return { pr: pr as any, comments: (comments ?? []) as ThreadItem[] };
    },
  });
  const diff = useQuery({
    queryKey: ["pr-diff", data?.pr.id, rd?.files.length, rd?.lastCommit?.id],
    enabled: !!data && data.pr.state === "open" && !!data.pr.head,
    queryFn: async () => computeChanges(rd!.files, await fetchAllFiles(data!.pr.head.id)),
  });
  if (!rd) return null;
  if (isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!data) return <p className="text-muted-foreground">Pull request tidak ditemukan.</p>;
  const { pr, comments } = data;
  const changes = diff.data ?? [];
  const stats = diffStats(changes);
  const headLabel = pr.head ? `${pr.head.owner.username}/${pr.head.name}` : "fork terhapus";

  async function comment() {
    const { error } = await supabase.from("pr_comments").insert({ pr_id: pr.id, author_id: user!.id, body });
    if (error) { toast.error(error.message); return; }
    setBody("");
    qc.invalidateQueries({ queryKey: key });
  }
  async function setState(state: "open" | "closed") {
    const { error } = await supabase.from("pull_requests").update({ state, updated_at: new Date().toISOString() }).eq("id", pr.id);
    if (error) toast.error(error.message);
    refresh();
    qc.invalidateQueries({ queryKey: key });
  }
  async function merge() {
    if (!changes.length) { toast("Tidak ada perubahan untuk di-merge."); return; }
    if (!confirm(`Merge ${changes.length} perubahan file ke ${username}/${repo}?`)) return;
    setBusy(true);
    try {
      await commitChanges({ repoId: rd!.repo.id, authorId: user!.id, message: `Merge pull request #${pr.number} dari ${headLabel}\n\n${pr.title}`, changes });
      const { error } = await supabase.from("pull_requests").update({ state: "merged", merged_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", pr.id);
      if (error) throw error;
      toast.success("Pull request berhasil di-merge.");
      await refresh();
      qc.invalidateQueries({ queryKey: key });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold md:text-3xl">{pr.title} <span className="font-normal text-muted-foreground">#{pr.number}</span></h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border pb-4 text-sm text-muted-foreground">
        <StateBadge kind="pr" state={pr.state} />
        <span><b className="text-foreground">{pr.author?.username}</b> ingin merge dari <span className="rounded bg-secondary px-1.5 font-mono text-xs text-foreground">{headLabel}</span> ke <span className="rounded bg-secondary px-1.5 font-mono text-xs text-foreground">{username}/{repo}</span></span>
      </div>
      <nav className="mt-4 flex gap-1 border-b border-border">
        {(["conversation", "files"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("border-b-2 px-3 py-2 text-sm", tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground")}>
            {t === "conversation" ? `Percakapan (${comments.length})` : `File berubah${pr.state === "open" ? ` (${changes.length})` : ""}`}
          </button>
        ))}
      </nav>
      {tab === "conversation" ? (
        <div className="mt-6 space-y-5">
          <ThreadComment item={pr} badge="Author" />
          {comments.map((c) => <ThreadComment key={c.id} item={c} badge={c.author_id === rd.repo.owner_id ? "Owner" : undefined} />)}
          {pr.state === "open" && rd.isOwner && (
            <div className="rounded-lg border border-success/50 bg-card p-4">
              <p className="flex items-center gap-2 font-semibold"><GitMerge className="size-5 text-success" />{changes.length ? "Siap untuk di-merge" : diff.isLoading ? "Memeriksa perubahan…" : "Tidak ada perubahan"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{changes.length} file · <span className="text-success">+{stats.add}</span> <span className="text-destructive">−{stats.del}</span></p>
              <div className="mt-3 flex gap-2">
                <Button onClick={merge} disabled={busy || !changes.length}>{busy ? "Merging…" : "Merge pull request"}</Button>
                <Button variant="outline" onClick={() => setState("closed")}>Tutup</Button>
              </div>
            </div>
          )}
          {pr.state === "merged" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><GitMerge className="size-4 text-merged" /> Di-merge {timeAgo(pr.merged_at)}. <Link to="/$username/$repo/commits" params={{ username, repo }} className="text-link hover:underline">Lihat commit</Link></p>}
          {pr.state === "closed" && (user?.id === pr.author_id || rd.isOwner) && <Button variant="outline" onClick={() => setState("open")}>Buka kembali</Button>}
          <div className="border-t border-border pt-6">
            {user ? (
              <div className="space-y-3">
                <MdEditor value={body} onChange={setBody} placeholder="Tinggalkan komentar…" />
                <div className="flex justify-end"><Button disabled={!body.trim()} onClick={comment}>Komentar</Button></div>
              </div>
            ) : <SignInCta text="Masuk untuk berkomentar." />}
          </div>
        </div>
      ) : (
        <div className="mt-6">
          {pr.state !== "open" ? <p className="text-sm text-muted-foreground">Pull request sudah {pr.state === "merged" ? "di-merge — lihat commit merge di riwayat" : "ditutup"}.</p>
            : diff.isLoading ? <p className="text-sm text-muted-foreground">Membandingkan…</p> : <DiffView changes={changes} />}
        </div>
      )}
    </div>
  );
}
