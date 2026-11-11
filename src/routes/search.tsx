import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RepoCard, type RepoCardData } from "@/components/repo-card";
import { AvatarMini } from "@/components/avatar-mini";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { JobCard } from "@/components/job-card";
import { JOB_SELECT, type JobCardData } from "@/lib/jobs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SEARCH_TYPES } from "@/lib/search-types";

const searchSchema = z.object({ q: z.string().catch(""), type: z.enum(["repos", "users", "karya", "jobs"]).catch("repos") });

export const Route = createFileRoute("/search")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Cari — Pastodev" },
      { name: "description", content: "Cari repositori, developer, karya, dan lowongan freelance di Pastodev." },
      { property: "og:title", content: "Cari — Pastodev" },
      { property: "og:description", content: "Cari repositori, developer, karya, dan lowongan di Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const REPO_SELECT = "id,name,description,language,is_private,created_at,updated_at,forked_from,topics, owner:profiles!repositories_owner_id_fkey(username,avatar_url), stars(count)";

function SearchPage() {
  const { q, type } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const term = q.replace(/[%,()_]/g, " ").trim();
  const repos = useQuery({
    queryKey: ["search", "repos", term],
    enabled: type === "repos",
    queryFn: async () => {
      // "whatsapp web script" => every word must match somewhere (name, description, language, topics or README).
      const words = term.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean).slice(0, 5);
      let qb = supabase.from("repositories").select(REPO_SELECT).order("updated_at", { ascending: false }).limit(50);
      for (const w of words) qb = qb.or(`name.ilike.%${w}%,description.ilike.%${w}%,language.ilike.%${w}%,topics.cs.{${w}}`);
      const found = ((await qb).data ?? []) as unknown as RepoCardData[];
      if (!words.length) return found;
      // Also look inside README files, where people usually describe what the project does.
      let rb = supabase.from("repo_files").select("repo_id").ilike("path", "readme%");
      for (const w of words) rb = rb.ilike("content", `%${w}%`);
      const hits = ((await rb.limit(100)).data ?? []).map((x) => x.repo_id as string);
      const ids = [...new Set(hits)].filter((id) => !found.some((r) => r.id === id));
      if (!ids.length) return found;
      const more = ((await supabase.from("repositories").select(REPO_SELECT).in("id", ids).order("updated_at", { ascending: false }).limit(50)).data ?? []) as unknown as RepoCardData[];
      return [...found, ...more];
    },
  });
  const users = useQuery({
    queryKey: ["search", "users", term],
    enabled: type === "users",
    queryFn: async () => {
      let qb = supabase.from("profiles").select("username,display_name,avatar_url,bio,headline,skills,available_for_hire,location").eq("account_type", "developer").order("available_for_hire", { ascending: false }).limit(60);
      if (term) qb = qb.or(`username.ilike.%${term}%,display_name.ilike.%${term}%,headline.ilike.%${term}%`);
      return (await qb).data ?? [];
    },
  });
  const karya = useQuery({
    queryKey: ["search", "karya", term],
    enabled: type === "karya",
    queryFn: async () => {
      let qb = supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(60);
      if (term) qb = qb.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
      return ((await qb).data ?? []) as unknown as ProductCardData[];
    },
  });
  const jobs = useQuery({
    queryKey: ["search", "jobs", term],
    enabled: type === "jobs",
    queryFn: async () => {
      let qb = supabase.from("jobs").select(JOB_SELECT).order("created_at", { ascending: false }).limit(60);
      if (term) qb = qb.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      return ((await qb).data ?? []) as unknown as JobCardData[];
    },
  });
  const current = { repos, users, karya, jobs }[type];
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <form onSubmit={(e) => { e.preventDefault(); navigate({ search: { q: text, type } }); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari repositori, developer, karya, lowongan…" autoFocus className="h-12 pl-10 text-base" />
      </form>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {SEARCH_TYPES.map(([t, label, Icon]) => (
          <Link key={t} to="/search" search={{ q, type: t }} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm", type === t ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </div>
      <div className="mt-6">
        {type === "repos" && <div className="space-y-3">{repos.data?.map((r) => <RepoCard key={r.id} r={r} />)}</div>}
        {type === "users" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {users.data?.map((u) => (
              <Link key={u.username} to="/$username" params={{ username: u.username }} className="flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/60">
                <div className="flex items-center gap-3">
                  <AvatarMini name={u.username} url={u.avatar_url} size={48} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{u.display_name || u.username}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">@{u.username}{u.location ? ` · ${u.location}` : ""}</p>
                  </div>
                </div>
                {(u.headline || u.bio) && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{u.headline || u.bio}</p>}
                {u.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{u.skills.slice(0, 5).map((s: string) => <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{s}</span>)}</div>}
                {u.available_for_hire && <span className="mt-3 w-fit rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">Siap di-hire</span>}
              </Link>
            ))}
          </div>
        )}
        {type === "karya" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{karya.data?.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
        {type === "jobs" && <div className="grid gap-4 md:grid-cols-2">{jobs.data?.map((j) => <JobCard key={j.id} j={j} />)}</div>}
        {current.isLoading && <p className="text-center text-muted-foreground">Mencari…</p>}
        {!current.isLoading && (current.data?.length ?? 0) === 0 && <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Tidak ada hasil{q ? ` untuk “${q}”` : ""}.</p>}
      </div>
    </main>
  );
}
