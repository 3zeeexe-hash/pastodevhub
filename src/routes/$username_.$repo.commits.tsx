import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, GitCommitHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { useRepo } from "@/lib/repo-data";
import { shortId } from "@/lib/repo";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/$username_/$repo/commits")({
  head: ({ params }) => ({
    meta: [
      { title: `Commits · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Riwayat commit ${params.username}/${params.repo}.` },
      { property: "og:title", content: `Commits · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Riwayat perubahan ${params.repo}.` },
    ],
  }),
  component: CommitsPage,
});

function CommitsPage() {
  const { username, repo } = Route.useParams();
  const { data: rd } = useRepo(username, repo);
  const { data, isLoading } = useQuery({
    queryKey: ["commits", rd?.repo.id],
    enabled: !!rd,
    queryFn: async () => (await supabase.from("commits").select("id,message,created_at, author:profiles(username,avatar_url)").eq("repo_id", rd!.repo.id).order("created_at", { ascending: false }).limit(300)).data ?? [],
  });
  if (!rd) return null;
  const groups = new Map<string, any[]>();
  for (const c of (data ?? []) as any[]) {
    const day = new Date(c.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    groups.set(day, [...(groups.get(day) ?? []), c]);
  }
  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold">Commits pada <span className="font-mono text-primary">{rd.repo.default_branch}</span></h2>
      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {data?.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">Belum ada commit.</p>}
      <div className="space-y-6">
        {[...groups.entries()].map(([day, list]) => (
          <div key={day}>
            <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><GitCommitHorizontal className="size-4" /> Commit pada {day}</p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to="/$username/$repo/commit/$id" params={{ username, repo, id: c.id }} className="block truncate font-semibold hover:text-link hover:underline">{c.message.split("\n")[0]}</Link>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><AvatarMini name={c.author?.username ?? "?"} url={c.author?.avatar_url} size={16} /><b>{c.author?.username}</b> commit {timeAgo(c.created_at)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="font-mono" onClick={() => { navigator.clipboard.writeText(c.id); toast.success("ID commit disalin"); }}><Copy /> {shortId(c.id)}</Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
