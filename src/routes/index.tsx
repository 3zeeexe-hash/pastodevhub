import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookMarked, MessageSquare, GitCommitHorizontal, Github, GitPullRequest, CircleDot, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AvatarMini } from "@/components/avatar-mini";
import { RepoCard, type RepoCardData } from "@/components/repo-card";
import { brandMarkUrl } from "@/components/brand";
import { shortId } from "@/lib/repo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pastodev — Rumah kode developer Nusantara" },
      { name: "description", content: "Simpan kode di repositori, kelola issue & pull request, beri bintang, follow developer, dan sinkron dengan GitHub." },
      { property: "og:title", content: "Pastodev — Rumah kode developer Nusantara" },
      { property: "og:description", content: "Repositori, issue, pull request, dan sinkron GitHub untuk komunitas developer Indonesia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const REPO_SELECT = "id,name,description,language,is_private,created_at,updated_at,forked_from,topics, owner:profiles!repositories_owner_id_fkey(username,avatar_url), stars(count)";

function Index() {
  const { user, profile } = useAuth();
  const repos = useQuery({
    queryKey: ["repos", "trending"],
    queryFn: async () => {
      const { data } = await supabase.from("repositories").select(REPO_SELECT).eq("is_private", false).order("updated_at", { ascending: false }).limit(40);
      return ((data ?? []) as unknown as RepoCardData[]).sort((a, b) => (b.stars?.[0]?.count ?? 0) - (a.stars?.[0]?.count ?? 0)).slice(0, 12);
    },
  });
  const mine = useQuery({
    queryKey: ["repos", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("repositories").select("id,name,is_private").eq("owner_id", user!.id).order("updated_at", { ascending: false }).limit(15)).data ?? [],
  });
  const activity = useQuery({
    queryKey: ["activity", "commits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("commits")
        .select("id,message,created_at, author:profiles(username,avatar_url), repo:repositories!inner(name,is_private, owner:profiles!repositories_owner_id_fkey(username))")
        .eq("repo.is_private", false)
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as any[];
    },
  });
  const posts = useQuery({
    queryKey: ["posts", "latest"],
    queryFn: async () => (await supabase.from("posts").select("id,title,created_at, author:profiles(username)").order("created_at", { ascending: false }).limit(6)).data ?? [],
  });
  const devs = useQuery({
    queryKey: ["devs", "new"],
    queryFn: async () => (await supabase.from("profiles").select("username,display_name,avatar_url").order("created_at", { ascending: false }).limit(12)).data ?? [],
  });

  return (
    <main>
      {!user && (
        <section className="bg-hero relative overflow-hidden border-b border-border">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div>
              <p className="font-mono text-sm text-primary">$ git clone komunitas-nusantara</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
                Rumah kode untuk <span className="text-primary">developer Nusantara.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Buat repositori, kelola issue & pull request, fork proyek teman, dan sinkron dua arah dengan GitHub — semua dalam satu tempat.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-glow"><Link to="/auth">Gabung Pastodev</Link></Button>
                <Button asChild size="lg" variant="outline"><Link to="/explore">Jelajahi repositori</Link></Button>
              </div>
              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-sm">
                {[[BookMarked, "Repo & folder"], [GitPullRequest, "Pull request"], [Github, "Impor & ekspor GitHub"]].map(([Icon, label]: any) => (
                  <div key={label} className="rounded-lg border border-border bg-card/60 p-3"><Icon className="size-5 text-primary" /><p className="mt-2">{label}</p></div>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-64 md:w-80">
              <div className="bg-sun absolute inset-6 rounded-full opacity-30 blur-3xl" />
              <img src={brandMarkUrl} alt="Maskot Pastodev berblangkon" className="relative w-full rounded-full ring-2 ring-primary/40" />
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[260px_1fr_300px]">
        <aside className="order-2 space-y-6 lg:order-1">
          {user && profile ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Repositori kamu</h2>
                <Button asChild size="sm"><Link to="/new"><Plus /> Baru</Link></Button>
              </div>
              <ul className="space-y-1">
                {mine.data?.map((r) => (
                  <li key={r.id}>
                    <Link to="/$username/$repo" params={{ username: profile.username, repo: r.name }} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                      <AvatarMini name={profile.username} url={profile.avatar_url} size={18} />
                      <span className="truncate">{profile.username}/<b>{r.name}</b></span>
                    </Link>
                  </li>
                ))}
                {mine.data?.length === 0 && <li className="text-sm text-muted-foreground">Belum ada repositori.</li>}
              </ul>
              <Link to="/import" className="mt-3 flex items-center gap-2 text-sm text-link hover:underline"><Github className="size-4" /> Impor dari GitHub</Link>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="font-semibold">Baru di Pastodev?</p>
              <p className="mt-1 text-muted-foreground">Masuk untuk membuat repo dan mengimpor proyek GitHub kamu.</p>
              <Button asChild size="sm" className="mt-3 w-full"><Link to="/auth">Masuk / Daftar</Link></Button>
            </div>
          )}
          <div>
            <h2 className="mb-3 text-sm font-semibold">Developer baru</h2>
            <div className="flex flex-wrap gap-2">
              {devs.data?.map((d) => (
                <Link key={d.username} to="/$username" params={{ username: d.username }} title={d.username}><AvatarMini name={d.username} url={d.avatar_url} size={34} /></Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><BookMarked className="size-4 text-primary" /> Repositori populer</h2>
          <div className="space-y-3">
            {repos.isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
            {repos.data?.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">Belum ada repositori publik. Jadilah yang pertama!</p>}
            {repos.data?.map((r) => <RepoCard key={r.id} r={r} />)}
          </div>
        </section>

        <aside className="order-3 space-y-8">
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><GitCommitHorizontal className="size-4 text-primary" /> Aktivitas terbaru</h2>
            <ul className="space-y-3">
              {activity.data?.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <AvatarMini name={c.author?.username ?? "?"} url={c.author?.avatar_url} size={22} />
                  <div className="min-w-0">
                    <p className="truncate"><b>{c.author?.username}</b> <span className="text-muted-foreground">push ke</span>{" "}
                      <Link to="/$username/$repo" params={{ username: c.repo.owner.username, repo: c.repo.name }} className="text-link hover:underline">{c.repo.owner.username}/{c.repo.name}</Link></p>
                    <Link to="/$username/$repo/commit/$id" params={{ username: c.repo.owner.username, repo: c.repo.name, id: c.id }} className="block truncate text-xs text-muted-foreground hover:text-foreground">
                      <span className="font-mono">{shortId(c.id)}</span> {c.message} · {timeAgo(c.created_at)}
                    </Link>
                  </div>
                </li>
              ))}
              {activity.data?.length === 0 && <li className="text-sm text-muted-foreground">Belum ada aktivitas.</li>}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-primary" /> Diskusi terbaru</h2>
            <ul className="space-y-1">
              {posts.data?.map((p: any) => (
                <li key={p.id}><Link to="/discuss/$id" params={{ id: p.id }} className="block rounded-md p-2 hover:bg-accent"><span className="text-sm font-medium">{p.title}</span><span className="block text-xs text-muted-foreground">@{p.author?.username} · {timeAgo(p.created_at)}</span></Link></li>
              ))}
              {posts.data?.length === 0 && <li className="text-sm text-muted-foreground">Belum ada diskusi.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold"><CircleDot className="size-4 text-success" /> Tips</p>
            <p className="mt-1 text-muted-foreground">Fork repo teman, ubah kodenya, lalu kirim pull request — persis seperti di GitHub.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
