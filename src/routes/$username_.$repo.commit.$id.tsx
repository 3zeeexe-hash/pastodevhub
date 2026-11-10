import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { useRepo } from "@/lib/repo-data";
import { diffStats, shortId, type Change } from "@/lib/repo";
import { AvatarMini } from "@/components/avatar-mini";
import { DiffView } from "@/components/diff-view";

export const Route = createFileRoute("/$username_/$repo/commit/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Commit ${params.id.slice(0, 7)} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Perubahan pada commit di ${params.username}/${params.repo}.` },
      { property: "og:title", content: `Commit · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Lihat perubahan commit di Pastodev.` },
    ],
  }),
  component: CommitPage,
});

function CommitPage() {
  const { username, repo, id } = Route.useParams();
  const { data: rd } = useRepo(username, repo);
  const { data, isLoading } = useQuery({
    queryKey: ["commit", id],
    enabled: !!rd && /^[0-9a-f-]{36}$/.test(id),
    queryFn: async () => (await supabase.from("commits").select("*, author:profiles(username,avatar_url)").eq("id", id).eq("repo_id", rd!.repo.id).maybeSingle()).data as any,
  });
  if (!rd) return null;
  if (isLoading) return <p className="text-muted-foreground">Memuat…</p>;
  if (!data) return <p className="text-muted-foreground">Commit tidak ditemukan.</p>;
  const changes = (data.changes ?? []) as Change[];
  const [title, ...rest] = String(data.message).split("\n");
  const stats = diffStats(changes);
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          {rest.join("\n").trim() && <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted-foreground">{rest.join("\n").trim()}</pre>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-2 text-sm">
          <AvatarMini name={data.author?.username ?? "?"} url={data.author?.avatar_url} size={20} />
          <Link to="/$username" params={{ username: data.author?.username ?? "" }} className="font-semibold hover:underline">{data.author?.username}</Link>
          <span className="text-muted-foreground">commit {timeAgo(data.created_at)}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">commit {shortId(data.id)}</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Menampilkan <b className="text-foreground">{changes.length} file berubah</b> dengan <span className="text-success">{stats.add} penambahan</span> dan <span className="text-destructive">{stats.del} penghapusan</span>.
      </p>
      <DiffView changes={changes} />
    </div>
  );
}
