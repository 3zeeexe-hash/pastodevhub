import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { GitPullRequest } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo, useAuth } from "@/lib/auth";
import { useRepo } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { StateIcon } from "@/components/state-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo/pulls/")({
  head: ({ params }) => ({
    meta: [
      { title: `Pull requests · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Pull request untuk ${params.username}/${params.repo}.` },
      { property: "og:title", content: `Pull requests · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Kontribusi kode untuk ${params.repo}.` },
    ],
  }),
  component: PullsPage,
});

function PullsPage() {
  const { username, repo } = Route.useParams();
  const { user } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const [state, setState] = useState<"open" | "closed">("open");
  const { data } = useQuery({
    queryKey: ["pulls", rd?.repo.id],
    enabled: !!rd,
    queryFn: async () => (await supabase.from("pull_requests").select("id,number,title,state,created_at,merged_at, author:profiles(username)").eq("repo_id", rd!.repo.id).order("number", { ascending: false })).data ?? [],
  });
  if (!rd) return null;
  const all = (data ?? []) as any[];
  const list = all.filter((p) => (state === "open" ? p.state === "open" : p.state !== "open"));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Fork repositori ini, ubah kodenya, lalu kirim pull request.</p>
        {user && <Button asChild className="ml-auto"><Link to="/$username/$repo/pulls/new" params={{ username, repo }} search={{}}>Pull request baru</Link></Button>}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-2.5 text-sm">
          {(["open", "closed"] as const).map((s) => (
            <button key={s} onClick={() => setState(s)} className={cn("flex items-center gap-1.5", state === s ? "font-semibold" : "text-muted-foreground hover:text-foreground")}>
              <GitPullRequest className="size-4" />{all.filter((p) => (s === "open" ? p.state === "open" : p.state !== "open")).length} {s === "open" ? "Open" : "Closed"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {list.map((p) => (
            <li key={p.id} className="flex gap-3 px-4 py-3 hover:bg-accent/40">
              <span className="pt-0.5"><StateIcon kind="pr" state={p.state} /></span>
              <div className="min-w-0 flex-1">
                <Link to="/$username/$repo/pulls/$number" params={{ username, repo, number: String(p.number) }} className="font-semibold hover:text-link">{p.title}</Link>
                <p className="text-xs text-muted-foreground">#{p.number} {p.state === "merged" ? `di-merge ${timeAgo(p.merged_at)}` : `dibuka ${timeAgo(p.created_at)}`} oleh {p.author?.username}</p>
              </div>
            </li>
          ))}
          {list.length === 0 && <li className="p-10 text-center text-muted-foreground">Tidak ada pull request {state === "open" ? "terbuka" : "tertutup"}.</li>}
        </ul>
      </div>
    </div>
  );
}
