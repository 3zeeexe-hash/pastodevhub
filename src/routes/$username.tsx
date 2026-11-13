import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BookMarked, Star, MapPin, Link2, Building2, Users, CalendarDays, Package, Wrench, FolderKanban, Store, ExternalLink, BadgeCheck, Mail,
  Settings, LayoutDashboard, Receipt, MessageSquare, LogOut, ChevronRight, Copy, Crown, ArrowRight, Clock, TrendingUp, UserPlus,
} from "lucide-react";
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

/** Kartu putih membulat yang dipakai di seluruh halaman profil. */
const CARD = "rounded-3xl border border-border bg-card shadow-sm";
/** Baris menu akun: kotak ikon oranye muda, label, panah. */
const MENU_ROW = "group flex w-full items-center gap-4 rounded-xl px-2 py-2.5 text-left text-base font-medium transition hover:bg-accent";
const CHIP = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold";

function IconBox({ children }: { children: React.ReactNode }) {
  return <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&>svg]:size-5">{children}</span>;
}

function StatTile({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className={cn(CARD, "flex items-center gap-3 p-4")}>
      <IconBox><Icon /></IconBox>
      <div className="min-w-0">
        <p className="text-xl font-extrabold leading-none">{value.toLocaleString("id-ID")}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Profil bergaya dasbor: sampul biru bergelombang, panel membulat yang menumpuk di atasnya, foto bercincin oranye,
 * kartu identitas + menu akun, tab berbentuk pil, lalu kartu ringkasan. HP: satu kolom. Layar lebar (lg): kolom kiri
 * berisi identitas dan menu, kolom kanan berisi tab dan isi.
 */
function Profile() {
  const { username } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const verified = !!(p as unknown as { is_verified?: boolean }).is_verified;
  const links = parseLinks(p.links);
  const profileComplete = !!(p.avatar_url && p.bio && p.headline);

  async function toggleFollow() {
    if (!user) { toast("Masuk dulu untuk follow."); return; }
    const { error } = data!.isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", p.id)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: p.id });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", username] });
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${p.username}`);
      toast.success("Tautan profil disalin");
    } catch { toast.error("Tidak bisa menyalin tautan"); }
  }
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const sorted = [...data.repos].sort((a, b) => (b.stars?.[0]?.count ?? 0) - (a.stars?.[0]?.count ?? 0));
  const filtered = data.repos.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  const totalStars = data.repos.reduce((n, r) => n + (r.stars?.[0]?.count ?? 0), 0);
  const lastCommit = data.commitDates.reduce<number>((m, d) => Math.max(m, Date.parse(d) || 0), 0);
  const joined = new Date(p.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const primaryBtn = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-sun px-5 text-base font-bold text-primary-foreground shadow-glow transition hover:brightness-105 active:scale-[0.99]";
  const softBtn = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-secondary px-5 text-base font-medium text-secondary-foreground transition hover:bg-accent";

  return (
    <div className="overflow-x-clip">
      {/* Sampul bergelombang: biru tua ke biru, cahaya oranye di pojok */}
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-navy-deep via-navy-mid to-navy-soft sm:h-60">
        <svg aria-hidden viewBox="0 0 1440 320" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <path d="M0 120C200 40 420 220 720 130S1220 20 1440 90V0H0Z" className="fill-white/5" />
          <path d="M0 250C260 150 520 300 860 210S1300 150 1440 200V320H0Z" className="fill-navy-soft/60" />
          <path d="M0 300C320 230 640 330 960 270S1320 240 1440 270V320H0Z" className="fill-primary/25" />
        </svg>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-primary/35 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 size-56 rounded-full bg-navy-soft/70 blur-3xl" />
      </div>

      {/* Panel terang membulat yang menumpuk di atas sampul */}
      <div className="relative -mt-14 rounded-t-[2.5rem] bg-background pb-12">
        <main className="mx-auto grid max-w-7xl items-start gap-6 px-4 sm:px-6 lg:grid-cols-[23rem_1fr] lg:gap-8">
          <aside className="min-w-0">
            {/* Foto: cincin gradasi oranye, separuh di atas sampul */}
            <div className="relative z-10 -mt-20 w-fit rounded-full bg-sun p-1.5 shadow-xl ring-4 ring-background">
              <div className="rounded-full bg-card p-1.5"><AvatarMini name={p.username} url={p.avatar_url} size={156} /></div>
            </div>

            <div className={cn(CARD, "mt-5 p-5 shadow-md")}>
              <h1 className="flex items-center gap-2 text-3xl font-extrabold leading-tight tracking-tight">
                <span className="min-w-0 break-words">{p.display_name || p.username}</span>
                <VerifiedBadge username={p.username} verified={verified} size={26} />
              </h1>
              <p className="mt-1 flex items-center gap-2 font-mono text-base font-semibold text-muted-foreground">
                <span className="min-w-0 truncate">@{p.username}</span>
                <button type="button" onClick={copyLink} aria-label="Salin tautan profil" title="Salin tautan profil" className="rounded-md p-1 transition hover:bg-accent hover:text-foreground"><Copy className="size-4" /></button>
              </p>
              {p.headline && <p className="mt-3 text-lg font-bold leading-snug">{p.headline}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {verified ? (
                  <span className={cn(CHIP, "bg-success/15 text-success")}><BadgeCheck className="size-5" /> Verified Account <BadgeCheck className="size-5" /></span>
                ) : isMe ? (
                  <Link to="/verifikasi" className={cn(CHIP, "bg-primary/15 text-orange-ink hover:bg-primary/25")}><BadgeCheck className="size-5" /> Verifikasi akun <ChevronRight className="size-4" /></Link>
                ) : null}
              </div>

              <p className="mt-4 text-lg font-bold">Peran</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={cn(CHIP, "bg-primary/15 text-orange-ink")}><Crown className="size-4 text-primary" /> {isDev ? "Developer" : p.account_type === "client" ? "Client" : "Member"}</span>
                <span className={cn(CHIP, "bg-success/12 text-success")}><span className="size-2.5 rounded-full bg-success" /> {isDev && p.available_for_hire ? "Terbuka untuk proyek" : "Aktif"}</span>
              </div>
              <p className="mt-3 flex items-center gap-2.5 rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm font-semibold text-orange-ink"><CalendarDays className="size-5 shrink-0" /> Bergabung sejak : {joined}</p>

              {p.bio && <p className="mt-4 text-sm leading-relaxed">{p.bio}</p>}
              {(p.skills?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((sk) => <span key={sk} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-orange-ink">{sk}</span>)}</div>
              )}

              {/* Aksi utama */}
              <div className="mt-5 space-y-3">
                {isMe ? (
                  <>
                    <Link to="/dashboard" className={primaryBtn}>Buka dasbor <ArrowRight className="size-5" /></Link>
                    {isDev && <Link to="/toko/$username" params={{ username: p.username }} className={softBtn}><Store className="size-5" /> Kunjungi toko</Link>}
                    <button type="button" onClick={signOut} className={cn(softBtn, "text-muted-foreground")}><LogOut className="size-5" /> Logout</button>
                  </>
                ) : (
                  <>
                    {data.isFollowing
                      ? <button type="button" onClick={toggleFollow} className={softBtn}>Berhenti follow</button>
                      : <button type="button" onClick={toggleFollow} className={primaryBtn}><UserPlus className="size-5" /> Follow</button>}
                    {user && <Link to="/discuss/pesan" search={{ u: p.username }} className={softBtn}><Mail className="size-5" /> Kirim pesan</Link>}
                    {isDev && <Link to="/toko/$username" params={{ username: p.username }} className={softBtn}><Store className="size-5" /> Kunjungi toko</Link>}
                  </>
                )}
              </div>

              {/* Menu akun (hanya pemilik profil) */}
              {isMe && (
                <nav aria-label="Menu akun" className="mt-5 space-y-0.5 border-t border-border pt-4">
                  <Link to="/settings" className={MENU_ROW}>
                    <IconBox><Settings /></IconBox>
                    <span className="flex-1">Pengaturan Akun</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", profileComplete ? "bg-primary/15 text-orange-ink" : "bg-destructive/10 text-destructive")}>{profileComplete ? "✓ Lengkap" : "Lengkapi"}</span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                  <Link to="/dashboard" className={MENU_ROW}>
                    <IconBox><LayoutDashboard /></IconBox>
                    <span className="flex-1">{isDev ? "Studio" : "Dasbor"}</span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                  <Link to="/pesanan" className={MENU_ROW}>
                    <IconBox><Receipt /></IconBox>
                    <span className="flex-1">Riwayat Transaksi</span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                  <Link to="/discuss/pesan" search={{}} className={MENU_ROW}>
                    <IconBox><MessageSquare /></IconBox>
                    <span className="flex-1">Pesan</span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                  <button type="button" onClick={signOut} className={MENU_ROW}>
                    <IconBox><LogOut /></IconBox>
                    <span className="flex-1">Keluar dari akun</span>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </button>
                </nav>
              )}

              {(p.company || p.location || p.website || links.length > 0) && (
                <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground [&>li>svg]:shrink-0 [&>li>svg]:text-primary">
                  {p.company && <li className="flex items-center gap-2"><Building2 className="size-4" />{p.company}</li>}
                  {p.location && <li className="flex items-center gap-2"><MapPin className="size-4" />{p.location}</li>}
                  {p.website && <li className="flex items-center gap-2"><Link2 className="size-4" /><a href={p.website} target="_blank" rel="noreferrer noopener" className="truncate text-link hover:underline">{p.website.replace(/^https?:\/\//, "")}</a></li>}
                  {links.map((l) => <li key={l.url} className="flex items-center gap-2"><ExternalLink className="size-4" /><a href={l.url} target="_blank" rel="noreferrer noopener" className="truncate text-link hover:underline">{l.label || l.url.replace(/^https?:\/\//, "")}</a></li>)}
                </ul>
              )}
            </div>
          </aside>

          <section className="min-w-0 lg:pt-6">
            {/* Tab berbentuk pil */}
            <nav aria-label="Bagian profil" className="mb-5 flex gap-2 overflow-x-auto pb-1">
              {([["overview", "Ringkasan", null], ["repos", "Repositori", data.repos.length], ["stars", "Bintang", data.starred.length],
                ...(isDev ? ([["karya", "Karya", data.products.length], ["jasa", "Jasa", data.services.length], ["portofolio", "Portofolio", data.portfolio.length]] as const) : [])] as const).map(([t, label, n]) => (
                <Link key={t} to="/$username" params={{ username }} search={t === "overview" ? {} : { tab: t }}
                  className={cn("flex h-12 shrink-0 items-center gap-2 rounded-full px-5 text-base font-medium transition", tab === t ? "bg-navy text-white shadow-md [&>svg]:text-white" : "border border-border bg-card text-foreground hover:bg-accent [&>svg]:text-navy-soft")}>
                  {t === "overview" ? <TrendingUp className="size-5" /> : t === "repos" ? <BookMarked className="size-5" /> : t === "stars" ? <Star className="size-5" /> : t === "karya" ? <Package className="size-5" /> : t === "jasa" ? <Wrench className="size-5" /> : <FolderKanban className="size-5" />}{label}
                  {n !== null && <span className={cn("rounded-full px-2 text-xs font-bold", tab === t ? "bg-primary text-primary-foreground" : "bg-secondary")}>{n}</span>}
                </Link>
              ))}
            </nav>

            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className={cn(CARD, "p-5")}>
                    <div className="flex items-center gap-3">
                      <IconBox><TrendingUp /></IconBox>
                      <h2 className="flex-1 text-lg font-bold">Ringkasan Akun</h2>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">Total bintang repositori</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3">
                      <span className="text-4xl font-extrabold tracking-tight">{totalStars.toLocaleString("id-ID")}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-sm font-bold text-success"><TrendingUp className="size-4" /> {data.repos.length} repositori</span>
                    </div>
                  </div>
                  <div className={cn(CARD, "flex items-center gap-3 p-5")}>
                    <IconBox><Clock /></IconBox>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold">Aktivitas Terbaru</h2>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={cn("size-2.5 shrink-0 rounded-full", lastCommit ? "bg-success" : "bg-grey-300")} />
                        {lastCommit
                          ? `Terakhir commit: ${new Date(lastCommit).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                          : "Belum ada aktivitas commit"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile icon={Users} label="Followers" value={data.followers} />
                  <StatTile icon={UserPlus} label="Following" value={data.following} />
                  <StatTile icon={Star} label="Bintang diberi" value={data.starred.length} />
                  {isDev ? <StatTile icon={Package} label="Karya" value={data.products.length} /> : <StatTile icon={BookMarked} label="Repositori" value={data.repos.length} />}
                </div>

                {data.readme && <div className={cn(CARD, "overflow-hidden border-t-4 border-t-primary p-6")}><p className="mb-3 font-mono text-xs text-muted-foreground">{p.username} / README.md</p><Markdown>{data.readme}</Markdown></div>}

                <div className={cn(CARD, "p-5")}>
                  <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><span aria-hidden className="h-5 w-1 rounded-full bg-primary" />Repositori populer</h2>
                  <div className="grid gap-3 md:grid-cols-2">{sorted.slice(0, 6).map((r) => <RepoCard key={r.id} r={r} showOwner={false} />)}</div>
                  {data.repos.length === 0 && <p className="text-sm text-muted-foreground">Belum ada repositori.</p>}
                </div>

                <div className={cn(CARD, "overflow-x-auto p-5")}>
                  <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><span aria-hidden className="h-5 w-1 rounded-full bg-primary" />Grafik Kontribusi</h2>
                  <ContributionGraph dates={data.commitDates} />
                </div>

                {isMe && (
                  <p className={cn(CARD, "flex items-center gap-3 p-4")}>
                    <IconBox><Star /></IconBox>
                    <span className="text-sm"><b className="block text-base">Terima kasih telah menjadi bagian dari kami!</b><span className="text-muted-foreground">Bersama kita lebih baik lagi.</span></span>
                  </p>
                )}
              </div>
            )}
            {tab === "repos" && (
              <div>
                <div className="mb-4 flex gap-2">
                  <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Cari repositori…" className="h-11 rounded-full px-5" />
                  {isMe && <Button asChild className="h-11 rounded-full px-5"><Link to="/new"><BookMarked /> Baru</Link></Button>}
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
                  <div key={it.id} className={cn(CARD, "overflow-hidden")}>
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
    </div>
  );
}
