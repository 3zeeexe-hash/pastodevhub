import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo, useAuth } from "@/lib/auth";
import { useRepo } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StateIcon } from "@/components/state-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo/issues/")({
  head: ({ params }) => ({
    meta: [
      { title: `Issues · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Daftar issue di ${params.username}/${params.repo}.` },
      { property: "og:title", content: `Issues · ${params.username}/${params.repo}` },
      { property: "og:description", content: `Laporan bug dan ide untuk ${params.repo}.` },
    ],
  }),
  component: IssuesPage,
});

function IssuesPage() {
  const { username, repo } = Route.useParams();
  const { user } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const [state, setState] = useState<"open" | "closed">("open");
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["issues", rd?.repo.id],
    enabled: !!rd,
    queryFn: async () => (await supabase.from("issues").select("id,number,title,state,created_at, author:profiles(username), issue_comments(count)").eq("repo_id", rd!.repo.id).order("number", { ascending: false })).data ?? [],
  });
  if (!rd) return null;
  const all = (data ?? []) as any[];
  const list = all.filter((i) => i.state === state && i.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari issue…" />
        {user ? <Button asChild><Link to="/$username/$repo/issues/new" params={{ username, repo }}>Issue baru</Link></Button>
          : <Button asChild variant="outline"><Link to="/auth">Masuk untuk buat issue</Link></Button>}
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-2.5 text-sm">
          {(["open", "closed"] as const).map((s) => (
            <button key={s} onClick={() => setState(s)} className={cn("flex items-center gap-1.5", state === s ? "font-semibold" : "text-muted-foreground hover:text-foreground")}>
              <StateIcon kind="issue" state={s} />{all.filter((i) => i.state === s).length} {s === "open" ? "Open" : "Closed"}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {list.map((i) => (
            <li key={i.id} className="flex gap-3 px-4 py-3 hover:bg-accent/40">
              <span className="pt-0.5"><StateIcon kind="issue" state={i.state} /></span>
              <div className="min-w-0 flex-1">
                <Link to="/$username/$repo/issues/$number" params={{ username, repo, number: String(i.number) }} className="font-semibold hover:text-link">{i.title}</Link>
                <p className="text-xs text-muted-foreground">#{i.number} dibuka {timeAgo(i.created_at)} oleh {i.author?.username}</p>
              </div>
              {(i.issue_comments?.[0]?.count ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{i.issue_comments[0].count}</span>}
            </li>
          ))}
          {list.length === 0 && <li className="p-10 text-center text-muted-foreground">Tidak ada issue {state === "open" ? "terbuka" : "tertutup"}.</li>}
        </ul>
      </div>
    </div>
  );
}
