import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ArrowRight, Briefcase, MessageSquare, Package, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { brandMarkUrl } from "@/components/brand";
import { JobCard } from "@/components/job-card";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { JOB_SELECT, type JobCardData } from "@/lib/jobs";
import { SEARCH_TYPES } from "@/routes/search";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pastodev — Komunitas developer Nusantara" },
      { name: "description", content: "Cari developer, lowongan freelance, karya digital, dan diskusi bersama komunitas developer Indonesia." },
      { property: "og:title", content: "Pastodev — Komunitas developer Nusantara" },
      { property: "og:description", content: "Temukan developer, lowongan, karya, dan diskusi di satu komunitas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type SearchType = (typeof SEARCH_TYPES)[number][0];
type DevRow = { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[]; available_for_hire: boolean };
type PostRow = { id: string; title: string; created_at: string; author: { username: string; avatar_url: string | null } | null; comments: { count: number }[] };

function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<SearchType>("users");

  const jobs = useQuery({
    queryKey: ["home", "jobs"],
    queryFn: async () => ((await supabase.from("jobs").select(JOB_SELECT).eq("status", "open").order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as JobCardData[],
  });
  const devs = useQuery({
    queryKey: ["home", "devs"],
    queryFn: async () =>
      ((await supabase.from("profiles").select("username,display_name,avatar_url,headline,skills,available_for_hire").eq("account_type", "developer")
        .order("available_for_hire", { ascending: false }).order("created_at", { ascending: false }).limit(8)).data ?? []) as DevRow[],
  });
  const karya = useQuery({
    queryKey: ["home", "karya"],
    queryFn: async () => ((await supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as ProductCardData[],
  });
  const posts = useQuery({
    queryKey: ["home", "posts"],
    queryFn: async () => ((await supabase.from("posts").select("id,title,created_at, author:profiles(username,avatar_url), comments(count)").order("created_at", { ascending: false }).limit(6)).data ?? []) as unknown as PostRow[],
  });

  function search(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: "/search", search: { q: q.trim(), type } });
  }

  return (
    <main>
      <section className="bg-hero relative overflow-hidden border-b border-border">
        <div className="batik-line pointer-events-none absolute inset-x-0 bottom-0 h-1 opacity-60" />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-14 text-center md:py-20">
          <img src={brandMarkUrl} alt="Maskot Pastodev berblangkon" className="size-20 rounded-full ring-2 ring-primary/50 md:size-24" />
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            Komunitas developer <span className="text-primary">Nusantara</span>
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground md:text-lg">Temukan developer, lowongan freelance, karya siap pakai, dan teman diskusi.</p>

          <form onSubmit={search} role="search" className="mt-8 w-full max-w-2xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari developer, proyek, karya, lowongan…"
                aria-label="Kata kunci pencarian"
                className="h-14 rounded-xl border-primary/40 bg-card pl-12 pr-28 text-base shadow-glow md:h-16 md:text-lg"
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 md:h-11">Cari</Button>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SEARCH_TYPES.map(([t, label, Icon]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={cn("flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition", type === t ? "border-primary bg-primary text-primary-foreground" : "bg-card/60 hover:bg-accent")}
                >
                  <Icon className="size-4" />{label}
                </button>
              ))}
            </div>
          </form>

          {!user && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg"><Link to="/auth">Gabung komunitas</Link></Button>
              <Button asChild size="lg" variant="outline"><Link to="/explore">Lihat proyek</Link></Button>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-12">
        <HomeSection icon={<Briefcase className="size-5 text-primary" />} title="Lowongan terbaru" more={<Link to="/lowongan">Semua lowongan</Link>}>
          <Grid loading={jobs.isLoading} empty={jobs.data?.length === 0} emptyText="Belum ada lowongan dibuka." className="md:grid-cols-2">
            {jobs.data?.map((j) => <JobCard key={j.id} j={j} />)}
          </Grid>
        </HomeSection>

        <HomeSection icon={<Users className="size-5 text-primary" />} title="Developer" more={<Link to="/search" search={{ q: "", type: "users" }}>Semua developer</Link>}>
          <Grid loading={devs.isLoading} empty={devs.data?.length === 0} emptyText="Belum ada developer terdaftar." className="sm:grid-cols-2 lg:grid-cols-4">
            {devs.data?.map((d) => (
              <Link key={d.username} to="/$username" params={{ username: d.username }} className="flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/60">
                <div className="flex items-center gap-3">
                  <AvatarMini name={d.username} url={d.avatar_url} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.display_name || d.username}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">@{d.username}</p>
                  </div>
                </div>
                {d.headline && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{d.headline}</p>}
                {d.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{d.skills.slice(0, 4).map((s) => <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{s}</span>)}</div>}
                {d.available_for_hire && <span className="mt-3 w-fit rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">Siap di-hire</span>}
              </Link>
            ))}
          </Grid>
        </HomeSection>

        <HomeSection icon={<Package className="size-5 text-primary" />} title="Karya terbaru" more={<Link to="/katalog">Lihat katalog</Link>}>
          <Grid loading={karya.isLoading} empty={karya.data?.length === 0} emptyText="Belum ada karya." className="sm:grid-cols-2 lg:grid-cols-4">
            {karya.data?.map((p) => <ProductCard key={p.id} p={p} />)}
          </Grid>
        </HomeSection>

        <HomeSection icon={<MessageSquare className="size-5 text-primary" />} title="Diskusi" more={<Link to="/discuss">Semua diskusi</Link>}>
          <Grid loading={posts.isLoading} empty={posts.data?.length === 0} emptyText="Belum ada diskusi. Mulai yang pertama!" className="md:grid-cols-2">
            {posts.data?.map((p) => (
              <Link key={p.id} to="/discuss/$id" params={{ id: p.id }} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/60">
                <AvatarMini name={p.author?.username ?? "?"} url={p.author?.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium">{p.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">@{p.author?.username} · {timeAgo(p.created_at)}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{p.comments?.[0]?.count ?? 0}</span>
              </Link>
            ))}
          </Grid>
        </HomeSection>
      </div>
    </main>
  );
}

function HomeSection({ icon, title, more, children }: { icon: ReactNode; title: string; more: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">{icon}{title}</h2>
        <span className="flex items-center gap-1 text-sm text-link hover:underline">{more}<ArrowRight className="size-4" /></span>
      </div>
      {children}
    </section>
  );
}

function Grid({ loading, empty, emptyText, className, children }: { loading: boolean; empty: boolean; emptyText: string; className?: string; children: ReactNode }) {
  if (loading) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (empty) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">{emptyText}</p>;
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
