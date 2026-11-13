import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, Bell, Briefcase, Building2, ChevronDown, ChevronLeft, ChevronRight, Code, FolderOpen, LayoutDashboard,
  LayoutGrid, LogOut, Menu, MessageCircle, MessageSquare, Newspaper, Package, Receipt, Search, Settings, ShieldCheck, User, Users,
  Wallet, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { siteJsonLd } from "@/lib/seo";
import { timeAgo, useAuth } from "@/lib/auth";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { fetchFeed, fetchUnreadCount } from "@/lib/feed";
import { budgetLabel, type JobCardData } from "@/lib/jobs";
import { categoryLabel, formatRupiah } from "@/lib/market";
import { workspacePath } from "@/lib/roles";
import { useSiteConfig } from "@/lib/use-site-config";
import { useHomeData } from "@/components/home/use-home-data";
import { PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { AvatarMini } from "@/components/avatar-mini";
import { BrandMark } from "@/components/brand";
import { GobiLoader } from "@/components/gobi-loader";
import banner1 from "@/assets/gobi-banner-1.png";
import banner2 from "@/assets/gobi-banner-2.png";
import banner3 from "@/assets/gobi-banner-3.png";
import jobImage from "@/assets/lowongan-job.jpg";
import { VerifiedBadge } from "@/components/verified-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const origin = (matches[0]?.loaderData as { siteUrl?: string | null } | undefined)?.siteUrl;
    return {
      scripts: origin ? [{ type: "application/ld+json", children: siteJsonLd(origin) }] : [],
      meta: [
        { title: "GOBI — Komunitas Developer Indonesia" },
        { name: "description", content: "Belajar, berbagi, dan tumbuh bersama: cari developer, ambil proyek freelance, pamerkan karya, dan ikut diskusi di komunitas GOBI." },
        { property: "og:title", content: "GOBI — Komunitas Developer Indonesia" },
        { property: "og:description", content: "Developer, freelancer, dan client bekerja bareng di satu tempat." },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: GobiHome,
});

const NAVY = "bg-navy";
const ORANGE = "bg-primary text-primary-foreground";
// Lebar konten yang sama untuk header dan isi beranda, supaya tepi kiri/kanan selalu sejajar di desktop.
const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6 xl:max-w-7xl";
// Gaya tautan "Lihat Semua" di kepala tiap bagian.
const SEE_ALL = "flex shrink-0 items-center gap-1 text-sm font-bold text-link hover:underline";

const MENU = [
  { to: "/gobifeed", label: "Linimasa", Icon: Newspaper, feature: "discuss" },
  { to: "/explore", label: "Proyek", Icon: FolderOpen, feature: null },
  { to: "/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
  { to: "/katalog", label: "Katalog", Icon: LayoutGrid, feature: "karya" },
  { to: "/lowongan", label: "Lowongan", Icon: Briefcase, feature: "jobs" },
  { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
] as const;

/**
 * Beranda GOBI: header biru tua (menu, logo, notifikasi, akun, pencarian), banner slider gambar,
 * 4 menu cepat, lalu Karya Terbaru, Lowongan Freelance, Diskusi Hangat, dan ajakan impor dari GitHub.
 * Beranda memakai header-nya sendiri, jadi SiteHeader global disembunyikan di "/" (lihat __root.tsx) agar tidak dobel.
 * Mobile: satu kolom, menu cepat berupa 4 kotak ikon.
 * Desktop (lg ke atas), grid 12 kolom yang sama di semua bagian supaya tepinya sejajar:
 *  - header: logo, menu (ikon kecil + teks, ukuran seimbang), pencarian (inline mulai xl), notifikasi, akun.
 *  - atas: banner (8/12) + menu cepat berupa 4 baris (ikon 48px + judul + keterangan) setinggi banner (4/12).
 *  - bawah: Karya Terbaru sebagai kartu 2 kolom (8/12), Lowongan + Diskusi di kanan (4/12).
 * Karya Terbaru hanya tampil kalau fitur karya aktif. Repositori publik tetap ada di menu Proyek (/explore).
 * Linimasa sosial yang dulu jadi beranda sekarang ada di /gobifeed.
 * Warna hanya dari palet GOBI (biru tua, oranye, abu-abu, putih) lewat token di styles.css, tanpa hex/slate hardcode.
 */
function GobiHome() {
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  const data = useHomeData(on);

  // Ambil 6 karya terbit: desktop menampilkan semuanya (kartu 2 kolom), mobile hanya 4 pertama.
  const karya = useQuery({
    queryKey: ["gobi-home", "karya"],
    enabled: on("karya"),
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(6)).data ?? []) as unknown as ProductCardData[],
  });

  // Diskusi Hangat: post yang ramai; kalau belum ada yang ramai, pakai post terbaru.
  const hot = useQuery({
    queryKey: ["gobi-home", "hot", user?.id ?? null],
    enabled: on("discuss"),
    staleTime: 60_000,
    queryFn: async () => {
      try {
        let page = await fetchFeed({ tab: "trending" }, user?.id, undefined, 3);
        if (!page.items.length) page = await fetchFeed({ tab: "all" }, user?.id, undefined, 3);
        return page.items;
      } catch {
        return [];
      }
    },
  });

  const jobs = on("jobs") ? (data.jobs.data ?? []).slice(0, 2) : [];
  const showKarya = on("karya");
  const karyaList = karya.data ?? [];
  const hotList = on("discuss") ? (hot.data ?? []) : [];
  const hasSide = on("jobs") || on("discuss");

  return (
    <main className="min-h-screen bg-background pb-10 text-foreground">
      <GobiHeader on={on} />
      <div className={WRAP}>
        <h1 className="sr-only">GOBI — Komunitas Developer Indonesia</h1>
        <div className="relative z-10 -mt-12 lg:grid lg:grid-cols-12 lg:items-stretch lg:gap-6">
          <HeroBanner signedIn={signedIn} on={on} />
          <QuickMenu on={on} />
        </div>

        <div className="grid gap-x-6 lg:grid-cols-12">
          {showKarya && (
            <div className={hasSide ? "lg:col-span-8" : "lg:col-span-12"}>
              <Section
                icon={<Package className="size-6 text-primary" />}
                title="Karya Terbaru"
                action={<Link to="/katalog" search={{ tab: "karya" }} className={SEE_ALL}>Lihat Semua <ArrowRight className="size-4" /></Link>}
              >
                {karya.isLoading ? <HomeLoading /> : karyaList.length === 0 ? <Hint>Belum ada karya yang dipublikasikan.</Hint> : (
                  <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                    {karyaList.map((p, n) => (
                      <div key={p.id} className={n >= 4 ? "hidden lg:block" : undefined}><ProductItem p={p} /></div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}

          {hasSide && (
            <div className={showKarya ? "lg:col-span-4" : "lg:col-span-12"}>
              {on("jobs") && (
                <Section
                  icon={<Briefcase className="size-6 text-link" />}
                  title="Lowongan Freelance"
                  action={<Link to="/lowongan" className={SEE_ALL}>Lihat Semua <ArrowRight className="size-4" /></Link>}
                >
                  {data.jobs.isLoading ? <HomeLoading /> : jobs.length === 0 ? <Hint>Belum ada lowongan dibuka.</Hint> : (
                    <div className="space-y-3">
                      {jobs.map((j) => <JobItem key={j.id} j={j} />)}
                    </div>
                  )}
                </Section>
              )}

              {on("discuss") && (
                <Section
                  icon={<MessageCircle className="size-6 text-primary" fill="currentColor" />}
                  title="Diskusi Hangat"
                  action={<Link to="/discuss" className={SEE_ALL}>Lihat Semua <ArrowRight className="size-4" /></Link>}
                >
                  {hot.isLoading ? <HomeLoading /> : hotList.length === 0 ? <Hint>Belum ada diskusi. Mulai yang pertama!</Hint> : (
                    <div className="space-y-2">
                      {hotList.map((p) => (
                        <Link key={p.id} to="/discuss/status/$id" params={{ id: p.id }} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:shadow-md">
                          <AvatarMini name={p.author.username} url={p.author.avatar_url} size={44} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 font-extrabold">{(p.body.split("\n")[0] || "Post").slice(0, 90)}</p>
                            <p className="truncate text-sm text-muted-foreground">oleh {p.author.display_name || p.author.username} · {timeAgo(p.created_at)}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground"><MessageSquare className="size-5" />{p.reply_count}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </Section>
              )}
            </div>
          )}
        </div>

        {on("github") && (
          <div className="pt-6">
            <Link to="/import" className={cn(NAVY, "flex items-center gap-4 rounded-2xl p-4 text-white shadow-md transition hover:brightness-110 lg:p-6")}>
              <svg viewBox="0 0 24 24" className="size-14 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">Impor dari GitHub</p>
                <p className="text-sm text-white/80">Sinkronkan repositori Anda dengan mudah!</p>
              </div>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15 lg:hidden"><ArrowRight className="size-6" /></span>
              <span className={cn(ORANGE, "hidden shrink-0 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold lg:inline-flex")}>Impor sekarang <ArrowRight className="size-4" /></span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------- Header ----------

function GobiHeader({ on }: { on: (k: FeatureKey) => boolean }) {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const signedIn = !!user && !!profile;
  const menu = MENU.filter((m) => !m.feature || on(m.feature));
  const unread = useQuery({
    queryKey: ["feed-unread", user?.id ?? null],
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user && on("discuss"),
    refetchInterval: 60_000,
  });
  const dashTo = workspacePath(profile?.account_type);
  const doSearch = (e: React.FormEvent) => { e.preventDefault(); navigate({ to: "/search", search: { q: q.trim(), type: "users" } }); };
  const item = "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent";
  // Menu desktop: ikon 16px + teks 14px (ukuran seimbang), pil tipis yang terang saat disorot.
  const navLink = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white xl:px-3";

  // Satu kotak pencarian, dua bentuk: pil lebar di bawah header (mobile sampai lg) dan pil ringkas di baris header (xl ke atas).
  const searchBox = (cls: string, compact: boolean) => (
    <form role="search" onSubmit={doSearch} className={cls}>
      <Search className={compact ? "size-4 shrink-0 text-muted-foreground" : "size-6 shrink-0"} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={compact ? "Cari di GOBI…" : "Cari developer, proyek, karya, lowongan…"}
        aria-label="Kata kunci pencarian"
        className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground", compact ? "text-sm" : "text-base")}
      />
    </form>
  );

  return (
    <header className="relative overflow-hidden rounded-b-[2rem] bg-header-gradient pb-16 pt-4 text-white xl:pb-20">
      <div className="pointer-events-none absolute -left-16 bottom-0 size-48 rounded-full bg-primary/30 blur-2xl" />
      <div className={cn("relative", WRAP)}>
        <div className="flex items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" aria-label="Buka menu" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 lg:hidden"><Menu className="size-7" /></button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-card">
              <SheetHeader><SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> GOBI</SheetTitle></SheetHeader>
              <nav className="mt-4 flex flex-col gap-1">
                <Link to="/search" search={{ q: "", type: "users" }} onClick={() => setOpen(false)} className={item}><Users className="size-4 text-primary" />Talenta</Link>
                {menu.map((m) => (
                  <Link key={m.to} to={m.to} onClick={() => setOpen(false)} className={item}><m.Icon className="size-4 text-primary" />{m.label}</Link>
                ))}
                {signedIn
                  ? <Link to={dashTo} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-accent"><LayoutDashboard className="size-4 text-primary" />Ruang kerja</Link>
                  : <Link to="/auth" onClick={() => setOpen(false)} className="mt-3 rounded-md bg-primary px-3 py-2.5 text-center text-sm font-medium text-primary-foreground">Masuk / Daftar</Link>}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex min-w-0 flex-1 items-center justify-center gap-2 lg:flex-none lg:justify-start" aria-label="GOBI">
            <img src="/gobi-logo.png" alt="GOBI" width={120} height={48} draggable={false} className="h-12 w-auto select-none object-contain" />
          </Link>

          {/* Menu di header untuk layar lebar (di mobile lewat tombol menu di kiri). */}
          <nav aria-label="Menu utama" className="ml-3 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
            <Link to="/search" search={{ q: "", type: "users" }} className={navLink}><Users className="size-4 opacity-80" />Talenta</Link>
            {menu.map((m) => <Link key={m.to} to={m.to} className={navLink}><m.Icon className="size-4 opacity-80" />{m.label}</Link>)}
          </nav>

          {searchBox("hidden h-10 w-56 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-navy shadow-sm xl:flex", true)}

          <div className="flex items-center gap-3">
            {signedIn && on("discuss") && (
              <Link to="/discuss/notifikasi" aria-label="Notifikasi" className="relative flex size-11 items-center justify-center rounded-full hover:bg-white/10">
                <Bell className="size-7 lg:size-6" />
                {!!unread.data && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-bold leading-5 text-primary-foreground">{unread.data > 99 ? "99+" : unread.data}</span>}
              </Link>
            )}
            {signedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Menu akun" className="flex items-center gap-1 rounded-full">
                  <span className="rounded-full ring-2 ring-white/70"><AvatarMini name={profile.username} url={profile.avatar_url} size={44} /></span>
                  <ChevronDown className="size-5 text-white/80" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="flex items-center gap-1 font-semibold"><span className="truncate">{profile.display_name || profile.username}</span><VerifiedBadge username={profile.username} verified={profile.is_verified} size={15} /></span>
                    <span className="block font-mono text-xs text-muted-foreground">@{profile.username}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to={dashTo}><LayoutDashboard /> Ruang kerja</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }}><User /> Profil kamu</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/pesanan"><Receipt /> Pesanan</Link></DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck /> Admin</Link></DropdownMenuItem>}
                  <DropdownMenuItem asChild><Link to="/settings"><Settings /> Pengaturan</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}><LogOut /> Keluar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className={cn(ORANGE, "inline-flex h-11 items-center rounded-full px-5 text-sm font-bold lg:h-10")}>Masuk</Link>
            )}
          </div>
        </div>

        {searchBox("relative mx-auto mt-4 flex max-w-3xl items-center gap-3 rounded-full bg-white px-5 py-3 text-navy shadow-lg ring-4 ring-white/30 lg:mt-5 xl:hidden", false)}
      </div>
    </header>
  );
}

// ---------- Banner (slider gambar) ----------

// Gambar ada di src/assets/ (rasio 16:9). Seluruh slide bisa diklik karena tombol ajakan sudah ada di dalam gambar.
const BANNERS = [
  { src: banner1, alt: "GOBI: Bergabung dengan Komunitas Developer Indonesia", feature: null, to: "/auth", toSignedIn: "/gobifeed" },
  { src: banner2, alt: "GOBI: Cari Lowongan Developer dan Freelancer", feature: "jobs", to: "/lowongan", toSignedIn: "/lowongan" },
  { src: banner3, alt: "GOBI: Tampilkan Portofoliomu", feature: null, to: "/auth", toSignedIn: "/studio/portofolio" },
] as const;

function HeroBanner({ signedIn, on }: { signedIn: boolean; on: (k: FeatureKey) => boolean }) {
  const slides = BANNERS.filter((b) => !b.feature || on(b.feature));
  const count = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const idx = count ? i % count : 0;

  // Geser otomatis tiap 5 detik; berhenti saat kursor di atas banner atau slide sedang disentuh.
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setTimeout(() => setI((x) => (x + 1) % count), 5000);
    return () => clearTimeout(t);
  }, [i, paused, count]);

  if (!count) return null;
  const go = (n: number) => setI(((n % count) + count) % count);
  const arrow = "absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 sm:flex";

  return (
    <section
      aria-label="Banner"
      aria-roledescription="carousel"
      className="group relative lg:col-span-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { setPaused(true); touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        setPaused(false);
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-mid shadow-xl ring-1 ring-white/10">
        {slides.map((s, n) => (
          <Link
            key={s.src}
            to={signedIn ? s.toSignedIn : s.to}
            aria-hidden={n !== idx}
            tabIndex={n === idx ? 0 : -1}
            className={cn("absolute inset-0 flex items-center justify-center text-center text-lg font-extrabold text-white transition-opacity duration-500", n === idx ? "opacity-100" : "pointer-events-none opacity-0")}
          >
            <span className="px-6">{s.alt}</span>
            <img
              src={s.src}
              alt={s.alt}
              draggable={false}
              loading={n === 0 ? "eager" : "lazy"}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="absolute inset-0 size-full select-none object-cover"
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" aria-label="Slide sebelumnya" onClick={() => go(idx - 1)} className={cn(arrow, "left-3")}><ChevronLeft className="size-6" /></button>
          <button type="button" aria-label="Slide berikutnya" onClick={() => go(idx + 1)} className={cn(arrow, "right-3")}><ChevronRight className="size-6" /></button>
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 backdrop-blur">
            {slides.map((s, n) => (
              <button key={s.src} type="button" aria-label={`Slide ${n + 1}`} aria-current={n === idx} onClick={() => go(n)} className="p-1">
                <span className={cn("block h-2 rounded-full transition-all", n === idx ? "w-5 bg-primary" : "w-2 bg-white/70")} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ---------- Menu cepat ----------

function QuickMenu({ on }: { on: (k: FeatureKey) => boolean }) {
  // Mobile: 4 kotak (ikon bulat di atas, teks di bawah).
  // Desktop: daftar 4 baris di samping banner, tingginya mengikuti banner. Tiap baris = ikon kotak 48px + judul + keterangan + panah,
  // jadi ikon dan teks seimbang (tidak ada kotak besar berisi ikon kecil).
  // Semua ikon seragam: lingkaran/kotak biru tua dengan ikon oranye.
  const tile = "group flex flex-col items-center gap-2 rounded-2xl bg-card px-1 py-3 text-sm font-bold shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md active:scale-95 lg:flex-row lg:gap-4 lg:px-5 lg:py-3 lg:text-base";
  const dot = "flex size-14 shrink-0 items-center justify-center rounded-full bg-navy text-primary lg:size-12 lg:rounded-xl";
  const icon = "size-8 lg:size-6";
  const text = "lg:min-w-0 lg:flex-1";
  const desc = "hidden truncate text-sm font-medium text-muted-foreground lg:block";
  const arrow = <ChevronRight className="hidden size-5 shrink-0 text-grey-500 transition group-hover:translate-x-0.5 group-hover:text-primary lg:block" />;
  return (
    <nav aria-label="Menu cepat" className="grid grid-cols-4 gap-2.5 pt-5 lg:col-span-4 lg:auto-rows-fr lg:grid-cols-1 lg:gap-3 lg:pt-0">
      <Link to="/search" search={{ q: "", type: "users" }} className={tile}>
        <span className={dot}><Code className={icon} strokeWidth={2.6} /></span>
        <span className={text}><span className="block lg:truncate">Developer</span><span className={desc}>Temukan talenta terbaik</span></span>
        {arrow}
      </Link>
      <Link to="/explore" className={tile}>
        <span className={dot}><FolderOpen className={icon} fill="currentColor" /></span>
        <span className={text}><span className="block lg:truncate">Proyek</span><span className={desc}>Jelajahi repositori publik</span></span>
        {arrow}
      </Link>
      {on("jobs") && (
        <Link to="/lowongan" className={tile}>
          <span className={dot}><Briefcase className={icon} fill="currentColor" /></span>
          <span className={text}><span className="block lg:truncate">Lowongan</span><span className={desc}>Ambil proyek freelance</span></span>
          {arrow}
        </Link>
      )}
      {on("discuss") && (
        <Link to="/discuss" className={tile}>
          <span className={dot}><MessageCircle className={icon} fill="currentColor" /></span>
          <span className={text}><span className="block lg:truncate">Diskusi</span><span className={desc}>Tanya jawab dan berbagi ilmu</span></span>
          {arrow}
        </Link>
      )}
    </nav>
  );
}

// ---------- Bagian ----------

function Section({ icon, title, action, children }: { icon: ReactNode; title: string; action: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border">{children}</p>;
}

/** Status memuat di tiap bagian beranda: logo GOBI + "Memuat data…" di tengah kartu. */
function HomeLoading() {
  return <GobiLoader compact className="rounded-2xl bg-card shadow-sm ring-1 ring-border" />;
}

/**
 * Kartu lowongan di beranda. Seluruh kartu bisa diketuk. Gambar ilustrasi lowongan dipakai di semua kartu.
 * Mobile: gambar 96px + teks yang boleh turun baris (judul maks. 2 baris, anggaran tidak dipotong), tombol di kiri.
 * sm: gambar 112px dan tombol rata kanan. Desktop (kolom kanan sempit): gambar 80px supaya teks tetap lega.
 */
function JobItem({ j }: { j: JobCardData }) {
  const client = j.client?.display_name || j.client?.username || "Client";
  return (
    <Link to="/lowongan/$id" params={{ id: j.id }} className="group flex items-start gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:shadow-md">
      <img
        src={jobImage}
        alt=""
        width={112}
        height={112}
        loading="lazy"
        draggable={false}
        className="size-24 shrink-0 select-none rounded-xl bg-navy object-cover sm:size-28 lg:size-20"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[11px] font-bold uppercase tracking-wide text-orange-ink">{categoryLabel(j.category)}</span>
        <h3 className="mt-0.5 line-clamp-2 break-words text-base font-extrabold leading-snug sm:text-lg lg:text-base">{j.title}</h3>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="size-4 shrink-0" /><span className="truncate">{client}</span></p>
        <p className="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm font-semibold text-foreground/80"><Wallet className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{budgetLabel(j.budget_min, j.budget_max)}</span></p>
        <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-primary/15 px-4 py-1.5 text-sm font-bold text-orange-ink transition group-hover:bg-primary/25 sm:self-end">Lihat Detail <ArrowRight className="size-4" /></span>
      </div>
    </Link>
  );
}

/**
 * Kartu karya di beranda (karya = produk yang diterbitkan di Katalog).
 * Mobile/tablet: baris horizontal (sampul di kiri, teks di tengah, panah di kanan).
 * Desktop (lg): kartu vertikal untuk grid 2 kolom: sampul 16:9, judul, ringkasan, harga + kategori, lalu pembuat.
 * Tanpa sampul, dipakai latar gradasi oranye dengan ikon paket.
 */
function ProductItem({ p }: { p: ProductCardData }) {
  const card = "flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:shadow-md lg:h-full lg:flex-col lg:items-stretch lg:gap-3 lg:p-4 lg:hover:-translate-y-0.5";
  return (
    <Link to="/karya/$id" params={{ id: p.id }} className={card}>
      <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-glow to-primary sm:h-28 sm:w-40 lg:aspect-video lg:h-auto lg:w-full">
        {p.cover_url
          ? <img src={p.cover_url} alt="" loading="lazy" draggable={false} className="size-full select-none object-cover" />
          : <Package className="size-10 text-navy/80 sm:size-12" strokeWidth={2.2} />}
      </div>
      <div className="min-w-0 flex-1 lg:flex-none">
        <h3 className="line-clamp-2 break-words text-base font-extrabold leading-snug sm:text-lg lg:text-base">{p.title}</h3>
        {p.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-3 py-0.5 text-xs font-bold", p.price ? "bg-primary/15 text-orange-ink" : "bg-navy/10 text-navy")}>{formatRupiah(p.price)}</span>
          <span className="max-w-full truncate rounded-full bg-secondary px-3 py-0.5 text-xs font-bold text-link">{categoryLabel(p.category)}</span>
        </div>
        {p.owner && (
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <AvatarMini name={p.owner.username} url={p.owner.avatar_url} size={20} />
            <span className="truncate">{p.owner.display_name || p.owner.username}</span>
          </p>
        )}
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary lg:hidden"><ArrowRight className="size-5" /></span>
    </Link>
  );
}
