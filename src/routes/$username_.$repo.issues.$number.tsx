import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo, useAuth } from "@/lib/auth";
import { useRepo, useRefreshRepo } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { StateBadge, StateIcon } from "@/components/state-badge";
import { SignInCta } from "@/components/sign-in-cta";
import { MdEditor } from "@/components/repo/md-editor";
import { ThreadComment, type ThreadItem } from "@/components/repo/thread";

export const Route = createFileRoute("/$username_/$repo/issues/$number")({
  head: ({ params }) => ({
    meta: [
      { title: `Issue #${params.number} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Issue #${params.number} di ${params.username}/${params.repo}.` },
      { property: "og:title", content: `Issue #${params.number} · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Diskusi issue #${params.number} di Pastodev.` },
    ],
  }),
  component: IssuePage,
});

function IssuePage() {
  const { username, repo, number } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const [body, setBody] = useState("");
  const key = ["issue", rd?.repo.id, number];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!rd && /^\d+$/.test(number),
    queryFn: async () => {
      const { data: issue } = await supabase.from("issues").select("*, author:profiles(username,avatar_url)").eq("repo_id", rd!.repo.id).eq("number", Number(number)).maybeSingle();
      if (!issue) return null;
      const { data: comments } = await supabase.from("issue_comments").select("*, author:profiles(username,avatar_url)").eq("issue_id", issue.id).order("created_at");
      return { issue: issue as any, comments: (comments ?? []) as ThreadItem[] };
    },
  });
  if (!rd) return null;
  if (isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!data) return <p className="text-muted-foreground">Issue tidak ditemukan.</p>;
  const { issue, comments } = data;
  const canManage = user && (user.id === issue.author_id || rd.isOwner);

  async function comment(close?: boolean) {
    if (body.trim()) {
      const { error } = await supabase.from("issue_comments").insert({ issue_id: issue.id, author_id: user!.id, body });
      if (error) { toast.error(error.message); return; }
    }
    if (close !== undefined) {
      const { error } = await supabase.from("issues").update({ state: close ? "closed" : "open", closed_at: close ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", issue.id);
      if (error) { toast.error(error.message); return; }
      refresh();
    }
    setBody("");
    qc.invalidateQueries({ queryKey: key });
  }
  async function delComment(id: string) {
    await supabase.from("issue_comments").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  }
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold md:text-3xl">{issue.title} <span className="font-normal text-muted-foreground">#{issue.number}</span></h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border pb-4 text-sm text-muted-foreground">
        <StateBadge kind="issue" state={issue.state} />
        <span><b className="text-foreground">{issue.author?.username}</b> membuka issue ini {timeAgo(issue.created_at)} · {comments.length} komentar</span>
      </div>
      <div className="mt-6 space-y-5">
        <ThreadComment item={issue} badge={issue.author_id === rd.repo.owner_id ? "Owner" : "Author"} />
        {comments.map((c) => <ThreadComment key={c.id} item={c} badge={c.author_id === rd.repo.owner_id ? "Owner" : undefined} onDelete={user?.id === c.author_id ? () => delComment(c.id) : undefined} />)}
        {issue.state === "closed" && issue.closed_at && (
          <p className="flex items-center gap-2 pl-12 text-sm text-muted-foreground"><StateIcon kind="issue" state="closed" /> Issue ditutup {timeAgo(issue.closed_at)}</p>
        )}
      </div>
      <div className="mt-8 border-t border-border pt-6">
        {user ? (
          <div className="space-y-3">
            <MdEditor value={body} onChange={setBody} placeholder="Tambahkan komentar…" />
            <div className="flex justify-end gap-2">
              {canManage && (
                <Button variant="outline" onClick={() => comment(issue.state === "open")}>
                  {issue.state === "open" ? (body.trim() ? "Tutup dengan komentar" : "Tutup issue") : "Buka kembali issue"}
                </Button>
              )}
              <Button disabled={!body.trim()} onClick={() => comment()}>Komentar</Button>
            </div>
          </div>
        ) : <SignInCta text="Masuk untuk ikut berdiskusi." />}
      </div>
      <p className="mt-6 text-sm"><Link to="/$username/$repo/issues" params={{ username, repo }} className="text-link hover:underline">← Semua issue</Link></p>
    </div>
  );
}
