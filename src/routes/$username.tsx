import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookMarked, Star, MapPin, Link2, Building2, Users, CalendarDays, Package, Wrench, FolderKanban, Store, ExternalLink, BadgeCheck, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { RepoCard, type RepoCardData } from "@/components/repo-card";
import { ContributionGraph } from "@/components/contribution-graph";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { ProductCard, ServiceCard, PRODUCT_SELECT, SERVICE_SELECT, type ProductCardData, type ServiceCardData } from "@/components/market-cards";
import { parseLinks, safeUrl } from "@/lib/market";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";

type Tab = "overview" | "repos" | "stars" | "karya" | "jasa" | "portofolio";
const TABS: Tab[] = ["repos", "stars", "karya", "jasa", "portofolio"];

export const Route = createFileRoute("/$username")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s["tab"];
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  // Real title, description and structured data come from the database; the text below is the fallback.
  loader: ({ params }) => getSeoInfo({ data: { kind: "profile", id: params.username } }),
  staleTime: 300_000,
  head: ({ loaderData, params }) => seoHead(loaderData, { title: `${params.username} — Pastodev`, description: `Profil developer ${params.username} di Pastodev: repositori, bintang, dan kontribusi.` }),
  component: Profile,
});

const REPO_SELECT = "id,name,description,language,is_private,created_at,updated_at,forked_from,topics, owner:profiles!repositories_owner_id_fkey(username,avatar_url), stars(count)";

function Profile() {
  const { username } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["profile", username, user?.id],
    queryFn: async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (!p) return null;
      const since = new Date(Date.now() - 366 * 86400000).toISOString();
      const [repos, followers, following, mine, commits, starred, readme, products, services, portfolio] = await Promise.all([
        supabase.from("repositories").select(REPO_SELECT).eq("owner_id", p.id).order("updated_at", { ascending: false }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", p.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id),
        user ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("commits").select("created_at").eq("author_id", p.id).gte("created_at", since).limit(5000),
        supabase.from("stars").select(`created_at, repo:repositories(${REPO_SELECT})`).eq("user_id", p.id).order("created_at", { ascending: false }),
        // Profile README: a repo named like the user, as on GitHub.
        supabase.from("repositories").select("id, repo_files(path,content)").eq("owner_id", p.id).eq("name", p.username).eq("is_private", false).maybeSingle(),
        supabase.from("products").select(PRODUCT_SELECT).eq("owner_id", p.id).eq("is_published", true).order("created_at", { ascending: false }).limit(60),
        supabase.from("services").select(SERVICE_SELECT).eq("owner_id", p.id).eq("is_active", true).order("created_at", { ascending: false }).limit(60),
        supabase.from("portfolio_items").select("*").eq("owner_id", p.id).order("position").order("created_at", { ascending: false }).limit(60),
      ]);
      const readmeFile = ((readme.data as any)?.repo_files ?? []).find((f: any) => /^readme\.md$/i.test(f.path));
      return {
        p,
        repos: (repos.data ?? []) as unknown as RepoCardData[],
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        isFollowing: !!mine.data,
        commitDates: (commits.data ?? []).map((c) => c.created_at),
        starred: ((starred.data ?? []) as any[]).map((s) => s.repo).filter(Boolean) as RepoCardData[],
        readme: readmeFile?.content as string | undefined,
        products: (products.data ?? []) as unknown as ProductCardData[],
        services: (services.data ?? []) as unknown as ServiceCardData[],
        portfolio: portfolio.data ?? [],
      };
    },
  });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!data) return <main className="mx-auto max-w-6xl px-4 py-12">Developer tidak ditemukan.</main>;
  const { p } = data;
  const isMe = user?.id === p.id;
  const isDev = p.account_type === "developer";
  const links = parseLinks(p.links);

  async function toggleFollow() {
    if (!user) { toast("Masuk dulu untuk follow."); return; }
    const { error } = data!.isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", p.id)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: p.id });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", username] });
  }
  const sorted = [...data.repos].sort((a, b) => (b.stars?.[0]?.count ?? 0) - (a.stars?.[0]?.count ?? 0));
  const filtered = data.repos.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  const cardCls = "overflow-hidden rounded-2xl border border-border bg-card shadow-sm";

  return (
    <div>
      {/* Sampul: gradasi biru tua dengan cahaya oranye dan biru, garis batik oranye di dasar. Sama dengan banner beranda. */}
      <div className="relative h-36 overflow-hidden bg-header-gradient sm:h-48">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-primary/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/4 size-72 rounded-full bg-navy-soft/70 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 top-6 size-40 rounded-full bg-primary-glow/20 blur-2xl" />
        <div aria-hidden className="batik-line absolute inset-x-0 bottom-0" />
      </div>

      <main className="mx-auto grid max-w-7xl items-start gap-8 px-4 pb-10 md:grid-cols-[300px_1fr]">
        <aside className="-mt-16 sm:-mt-24">
          {/* Foto profil: cincin gradasi oranye, menumpang di atas sampul */}
          <div className="relative w-fit rounded-full bg-sun p-1 shadow-xl ring-4 ring-background">
            <div className="rounded-full bg-card p-1"><AvatarMini name={p.username} url={p.avatar_url} size={168} /></div>
          </div>

          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-md">
            <h1 className="flex items-center gap-1.5 text-2xl font-bold leading-tight">
              <span className="min-w-0 break-words">{p.display_name || p.username}</span>
              <VerifiedBadge username={p.username} verified={(p as unknown as { is_verified?: boolean }).is_verified} size={22} />
            </h1>
            <p className="font-mono text-lg text-muted-foreground">{p.username}</p>
            {p.headline && <p className="mt-2 font-medium">{p.headline}</p>}
            {isDev && p.available_for_hire && <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"><BadgeCheck className="size-3.5" /> Terbuka untuk proyek</p>}
            {p.bio && <p className="mt-3 text-sm">{p.bio}</p>}
            {(p.skills?.length ?? 0) > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((sk) => <span key={sk} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-orange-ink">{sk}</span>)}</div>
            )}
            {isDev && (
              <Button asChild className="mt-4 w-full"><Link to="/toko/$username" params={{ username: p.username }}><Store /> Kunjungi toko</Link></Button>
            )}
            {isMe ? (
              <Button asChild variant="secondary" className="mt-3 w-full"><Link to="/settings">Edit profil</Link></Button>
            ) : (
              <>
                <Button className="mt-3 w-full" variant={data.isFollowing ? "secondary" : "default"} onClick={toggleFollow}>{data.isFollowing ? "Berhenti follow" : "Follow"}</Button>
                {user && <Button asChild variant="outline" className="mt-2 w-full"><Link to="/discuss/pesan" search={{ u: p.username }}><Mail /> Kirim pesan</Link></Button>}
              </>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/10 px-3 py-1 text-navy"><Users className="size-4" /><b>{data.followers}</b> followers</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-orange-ink"><b>{data.following}</b> following</span>
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm text-muted-foreground [&>li>svg]:shrink-0 [&>li>svg]:text-primary">
              {p.company && <li className="flex items-center gap-2"><Building2 className="size-4" />{p.company}</li>}
              {p.location && <li className="flex items-center gap-2"><MapPin className="size-4" />{p.location}</li>}
              {p.website && <li className="flex items-center gap-2"><Link2 className="size-4" /><a href={p.website} target="_blank" rel="noreferrer noopener" className="truncate text-link hover:underline">{p.website.replace(/^https?:\/\//, "")}</a></li>}
              {links.map((l) => <li key={l.url} className="flex items-center gap-2"><ExternalLink className="size-4" /><a href={l.url} target="_blank" rel="noreferrer noopener" className="truncate text-link hover:underline">{l.label || l.url.replace(/^https?:\/\//, "")}</a></li>)}
              <li className="flex items-center gap-2"><CalendarDays className="size-4" />Bergabung {new Date(p.created_at).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</li>
            </ul>
          </div>
        </aside>

        <section className="min-w-0 md:mt-6">
          <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm">
            {([["overview", "Ringkasan", null], ["repos", "Repositori", data.repos.length], ["stars", "Bintang", data.starred.length],
              ...(isDev ? ([["karya", "Karya", data.products.length], ["jasa", "Jasa", data.services.length], ["portofolio", "Portofolio", data.portfolio.length]] as const) : [])] as const).map(([t, label, n]) => (
              <Link key={t} to="/$username" params={{ username }} search={t === "overview" ? {} : { tab: t }}
                className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition", tab === t ? "bg-navy text-white shadow-sm [&>svg]:text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                {t === "repos" ? <BookMarked className="size-4" /> : t === "stars" ? <Star className="size-4" /> : t === "karya" ? <Package className="size-4" /> : t === "jasa" ? <Wrench className="size-4" /> : t === "portofolio" ? <FolderKanban className="size-4" /> : null}{label}
                {n !== null && <span className={cn("rounded-full px-2 text-xs font-bold", tab === t ? "bg-primary text-primary-foreground" : "bg-secondary")}>{n}</span>}
              </Link>
            ))}
          </nav>
          {tab === "overview" && (
            <div className="space-y-6">
              {data.readme && <div className={cn(cardCls, "border-t-4 border-t-primary p-6")}><p className="mb-3 font-mono text-xs text-muted-foreground">{p.username} / README.md</p><Markdown>{data.readme}</Markdown></div>}
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-4 w-1 rounded-full bg-primary" />Repositori populer</h2>
                <div className="grid gap-3 md:grid-cols-2">{sorted.slice(0, 6).map((r) => <RepoCard key={r.id} r={r} showOwner={false} />)}</div>
                {data.repos.length === 0 && <p className="text-sm text-muted-foreground">Belum ada repositori.</p>}
              </div>
              <ContributionGraph dates={data.commitDates} />
            </div>
          )}
          {tab === "repos" && (
            <div>
              <div className="mb-4 flex gap-2">
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Cari repositori…" />
                {isMe && <Button asChild><Link to="/new"><BookMarked /> Baru</Link></Button>}
              </div>
              <div className="space-y-3">{filtered.map((r) => <RepoCard key={r.id} r={r} showOwner={false} />)}</div>
              {filtered.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada repositori.</p>}
            </div>
          )}
          {tab === "karya" && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.products.map((x) => <ProductCard key={x.id} p={x} />)}
              {data.products.length === 0 && <p className="text-sm text-muted-foreground">Belum ada karya.</p>}
            </div>
          )}
          {tab === "jasa" && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.services.map((x) => <ServiceCard key={x.id} s={x} />)}
              {data.services.length === 0 && <p className="text-sm text-muted-foreground">Belum membuka jasa.</p>}
            </div>
          )}
          {tab === "portofolio" && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.portfolio.map((it) => (
                <div key={it.id} className={cardCls}>
                  {it.image_url && <img src={it.image_url} alt="" className="aspect-video w-full object-cover" />}
                  <div className="p-3">
                    <p className="font-semibold">{it.title}</p>
                    {it.description && <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{it.description}</p>}
                    {safeUrl(it.link_url) && <a href={safeUrl(it.link_url)!} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-sm text-link hover:underline"><ExternalLink className="size-3.5" /> Lihat proyek</a>}
                  </div>
                </div>
              ))}
              {data.portfolio.length === 0 && <p className="text-sm text-muted-foreground">Belum ada portofolio.</p>}
            </div>
          )}
          {tab === "stars" && (
            <div className="space-y-3">
              {data.starred.map((r) => <RepoCard key={r.id} r={r} />)}
              {data.starred.length === 0 && <p className="text-sm text-muted-foreground">Belum memberi bintang.</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
