import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Star, GitFork, Lock, Code2, CircleDot, GitPullRequest, History, Settings, Github, BookMarked, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { AvatarMini } from "@/components/avatar-mini";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Repositori ${params.repo} oleh ${params.username} di Pastodev: kode, issue, dan pull request.` },
      { property: "og:title", content: `${params.username}/${params.repo}` },
      { property: "og:description", content: `Lihat kode ${params.repo} oleh ${params.username} di Pastodev.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepoLayout,
});

function RepoLayout() {
  const { username, repo } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data, isLoading } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const [forking, setForking] = useState(false);

  if (isLoading) return <main className="mx-auto max-w-7xl px-4 py-12 text-muted-foreground">Memuat repositori…</main>;
  if (!data) return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <BookMarked className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Repositori tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted-foreground">Repositori ini tidak ada atau bersifat private.</p>
    </main>
  );
  const { repo: r } = data;
  const base = `/${username}/${repo}`;
  const tabs = [
    { to: "/$username/$repo", label: "Code", icon: Code2, active: pathname === base || /\/(tree|blob|edit|new)(\/|$)/.test(pathname.slice(base.length)), count: null },
    { to: "/$username/$repo/issues", label: "Issues", icon: CircleDot, active: pathname.startsWith(`${base}/issues`), count: data.openIssues },
    { to: "/$username/$repo/pulls", label: "Pull requests", icon: GitPullRequest, active: pathname.startsWith(`${base}/pull`), count: data.openPrs },
    { to: "/$username/$repo/commits", label: "Commits", icon: History, active: pathname.startsWith(`${base}/commit`), count: data.commitCount },
    ...(data.isOwner ? [{ to: "/$username/$repo/ai", label: "AI", icon: Bot, active: pathname.startsWith(`${base}/ai`), count: null }] : []),
    ...(data.isOwner ? [{ to: "/$username/$repo/settings", label: "Settings", icon: Settings, active: pathname.startsWith(`${base}/settings`), count: null }] : []),
  ] as const;

  async function toggleStar() {
    if (!user) { toast("Masuk dulu untuk memberi bintang."); return; }
    const { error } = data!.starred
      ? await supabase.from("stars").delete().eq("repo_id", r.id).eq("user_id", user.id)
      : await supabase.from("stars").insert({ repo_id: r.id, user_id: user.id });
    if (error) toast.error(error.message);
    refresh();
  }
  async function fork() {
    if (!user || !profile) { toast("Masuk dulu untuk fork."); return; }
    if (data!.isOwner) { toast("Ini repositori kamu sendiri."); return; }
    setForking(true);
    try {
      const { data: existing } = await supabase.from("repositories").select("name").eq("owner_id", user.id).eq("forked_from", r.id).maybeSingle();
      if (existing) { navigate({ to: "/$username/$repo", params: { username: profile.username, repo: existing.name } }); return; }
      let name = r.name;
      const { data: clash } = await supabase.from("repositories").select("id").eq("owner_id", user.id).eq("name", name).maybeSingle();
      if (clash) name = `${name}-fork`;
      const { data: created, error } = await supabase.from("repositories").insert({
        owner_id: user.id, name, description: r.description, language: r.language, topics: r.topics, forked_from: r.id, is_private: false,
      }).select().single();
      if (error) throw error;
      if (data!.files.length) {
        await commitChanges({ repoId: created.id, authorId: user.id, message: `Fork dari ${username}/${r.name}`, changes: data!.files.map((f) => ({ path: f.path, type: "add" as const, after: f.content })), storeContent: false });
      }
      toast.success("Fork berhasil dibuat.");
      navigate({ to: "/$username/$repo", params: { username: profile.username, repo: name } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setForking(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border bg-header/40">
        <div className="mx-auto max-w-7xl px-4 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="flex min-w-0 items-center gap-2 font-mono text-lg md:text-xl">
              <AvatarMini name={username} url={data.owner.avatar_url} size={24} />
              <Link to="/$username" params={{ username }} className="text-link hover:underline">{username}</Link>
              <span className="text-muted-foreground">/</span>
              <Link to="/$username/$repo" params={{ username, repo }} className="truncate font-bold text-link hover:underline">{repo}</Link>
              <span className="rounded-full border border-border px-2 py-0.5 font-sans text-xs text-muted-foreground">{r.is_private ? <><Lock className="mr-1 inline size-3" />Private</> : "Public"}</span>
            </h1>
            <div className="ml-auto flex flex-wrap gap-2">
              {r.github_full_name && (
                <Button asChild size="sm" variant="outline"><a href={`https://github.com/${r.github_full_name}`} target="_blank" rel="noreferrer noopener"><Github /> GitHub</a></Button>
              )}
              <div className="flex">
                <Button size="sm" variant="secondary" className="rounded-r-none" onClick={fork} disabled={forking}><GitFork /> {forking ? "Membuat fork…" : "Fork"}</Button>
                <span className="flex items-center rounded-r-md border-l border-border bg-secondary px-2 font-mono text-xs">{data.forks}</span>
              </div>
              <div className="flex">
                <Button size="sm" variant="secondary" className="rounded-r-none" onClick={toggleStar}>
                  <Star className={data.starred ? "fill-star text-star" : ""} /> {data.starred ? "Starred" : "Star"}
                </Button>
                <span className="flex items-center rounded-r-md border-l border-border bg-secondary px-2 font-mono text-xs">{data.stars}</span>
              </div>
            </div>
          </div>
          {data.parent && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <GitFork className="size-3" /> fork dari{" "}
              <Link to="/$username/$repo" params={{ username: data.parent.owner.username, repo: data.parent.name }} className="text-link hover:underline">{data.parent.owner.username}/{data.parent.name}</Link>
              {data.isOwner && (
                <> · <Link to="/$username/$repo/pulls/new" params={{ username: data.parent.owner.username, repo: data.parent.name }} search={{ head: r.id }} className="text-link hover:underline">Kirim pull request</Link></>
              )}
            </p>
          )}
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link key={t.label} to={t.to} params={{ username, repo }}
                className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm", t.active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <t.icon className="size-4" />{t.label}
                {t.count !== null && t.count > 0 && <span className="rounded-full bg-secondary px-2 text-xs">{t.count}</span>}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}
