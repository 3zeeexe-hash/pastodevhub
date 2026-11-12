import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight, Briefcase, Building2, ChevronLeft, ChevronRight, Code, Flame, FolderOpen, LayoutGrid, MessageCircle,
  MessageSquare, Star, Wallet, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { siteJsonLd } from "@/lib/seo";
import { timeAgo, useAuth } from "@/lib/auth";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { fetchFeed } from "@/lib/feed";
import { budgetLabel } from "@/lib/jobs";
import { categoryLabel } from "@/lib/market";
import { useSiteConfig } from "@/lib/use-site-config";
import { useHomeData } from "@/components/home/use-home-data";
import { AvatarMini } from "@/components/avatar-mini";
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

const NAVY = "bg-[#0a1a45]";

type HomeRepo = {
  id: string;
  name: string;
  description: string | null;
  language: string | null;
  topics: string[] | null;
  owner: { username: string } | null;
  stars: { count: number }[] | null;
};

/**
 * Beranda GOBI. Tanpa header sendiri (navigasi, pencarian, notifikasi, dan akun sudah ada di SiteHeader global).
 * Mobile: satu kolom. Desktop (lg ke atas): banner di tengah, menu cepat 6 kolom, lalu dua kolom
 * (Proyek Terbaru di kiri, Lowongan + Diskusi di kanan).
 * Linimasa sosial yang dulu jadi beranda sekarang ada di /gobifeed.
 */
function GobiHome() {
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  const data = useHomeData(on);

  const repos = useQuery({
    queryKey: ["gobi-home", "repos"],
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabase.from("repositories").select("id,name,description,language,topics, owner:profiles!repositories_owner_id_fkey(username), stars(count)").eq("is_private", false).order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as HomeRepo[],
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
  const repoList = repos.data ?? [];
  const hotList = on("discuss") ? (hot.data ?? []) : [];
  const hasSide = on("jobs") || on("discuss");

  return (
    <main className="min-h-screen bg-[#f4f7fc] pb-10 text-[#0b1a3f]">
      <div className="mx-auto max-w-6xl px-4 pt-4 lg:pt-6">
        <h1 className="sr-only">GOBI — Komunitas Developer Indonesia</h1>
        <HeroBanner signedIn={signedIn} on={on} />
        <QuickMenu on={on} />

        <div className={cn("grid gap-x-8", hasSide && "lg:grid-cols-5")}>
          <div className={cn(hasSide && "lg:col-span-3")}>
            <Section icon={<Flame className="size-6 text-[#ff6a00]" />} title="Proyek Terbaru" to="/explore">
              {repos.isLoading ? <Hint>Memuat…</Hint> : repoList.length === 0 ? <Hint>Belum ada proyek publik.</Hint> : (
                <div className="space-y-3">{repoList.map((r) => <RepoItem key={r.id} r={r} />)}</div>
              )}
            </Section>
          </div>

          {hasSide && (
            <div className="lg:col-span-2">
              {on("jobs") && (
                <Section icon={<Briefcase className="size-6 text-[#ff8a00]" />} title="Lowongan Freelance" to="/lowongan">
                  {data.jobs.isLoading ? <Hint>Memuat…</Hint> : jobs.length === 0 ? <Hint>Belum ada lowongan dibuka.</Hint> : (
                    <div className="space-y-3">
                      {jobs.map((j) => (
                        <div key={j.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                          <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ffc13b] to-[#ff7a00] sm:h-28 sm:w-40 lg:w-28">
                            <Code className="size-10 text-[#0a1a45]/80 sm:size-12" strokeWidth={2.4} />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <h3 className="line-clamp-2 text-base font-extrabold leading-tight sm:text-lg">{j.title}</h3>
                            <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-slate-600"><Building2 className="size-4 shrink-0" />{j.client?.display_name || j.client?.username || "Client"}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500"><Wallet className="size-4 shrink-0" />{budgetLabel(j.budget_min, j.budget_max)} · {categoryLabel(j.category)}</p>
                            <Link to="/lowongan/$id" params={{ id: j.id }} className="mt-2 inline-flex items-center gap-1 self-end rounded-full bg-[#fff1dc] px-4 py-1.5 text-sm font-bold text-[#e67700] transition hover:bg-[#ffe3bd]">Lihat Detail <ArrowRight className="size-4" /></Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {on("discuss") && (
                <Section icon={<MessageCircle className="size-6 text-[#1a73e8]" fill="currentColor" />} title="Diskusi Hangat" to="/discuss">
                  {hot.isLoading ? <Hint>Memuat…</Hint> : hotList.length === 0 ? <Hint>Belum ada diskusi. Mulai yang pertama!</Hint> : (
                    <div className="space-y-2">
                      {hotList.map((p) => (
                        <Link key={p.id} to="/discuss/status/$id" params={{ id: p.id }} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md">
                          <AvatarMini name={p.author.username} url={p.author.avatar_url} size={44} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 font-extrabold">{(p.body.split("\n")[0] || "Post").slice(0, 90)}</p>
                            <p className="truncate text-sm text-slate-500">oleh {p.author.display_name || p.author.username} · {timeAgo(p.created_at)}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-sm text-slate-500"><MessageSquare className="size-5" />{p.reply_count}</span>
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
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1d3f9e]"><ArrowRight className="size-6" /></span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------- Banner (slider gambar) ----------

// Gambar ada di public/banners/ (rasio 16:9). Seluruh slide bisa diklik karena tombol ajakan sudah ada di dalam gambar.
const BANNERS = [
  { src: "/banners/gobi-banner-1.png", alt: "GOBI: Bergabung dengan Komunitas Developer Indonesia", feature: null, to: "/auth", toSignedIn: "/gobifeed" },
  { src: "/banners/gobi-banner-2.png", alt: "GOBI: Cari Lowongan Developer dan Freelancer", feature: "jobs", to: "/lowongan", toSignedIn: "/lowongan" },
  { src: "/banners/gobi-banner-3.png", alt: "GOBI: Tampilkan Portofoliomu", feature: null, to: "/auth", toSignedIn: "/studio/portofolio" },
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
      className="group relative mx-auto max-w-5xl"
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
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1a45] to-[#112b6e] shadow-xl ring-1 ring-black/10 sm:rounded-3xl">
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
                <span className={cn("block h-2 rounded-full transition-all", n === idx ? "w-5 bg-[#ff9f1a]" : "w-2 bg-white/70")} />
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
  const tile = "flex flex-col items-center gap-2 rounded-2xl bg-white px-1 py-3 text-sm font-bold shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md active:scale-95 lg:py-4";
  const dot = "flex size-14 items-center justify-center rounded-full";
  return (
    <nav aria-label="Menu cepat" className="grid grid-cols-3 gap-2.5 pt-5 sm:grid-cols-6 lg:gap-4">
      <Link to="/search" search={{ q: "", type: "users" }} className={tile}>
        <span className={cn(dot, "bg-[#e3f0ff] text-[#1a73e8]")}><Code className="size-8" strokeWidth={2.6} /></span>Developer
      </Link>
      <Link to="/explore" className={tile}>
        <span className={cn(dot, "bg-[#e2f6ea] text-[#12924a]")}><FolderOpen className="size-8" fill="currentColor" /></span>Proyek
      </Link>
      {on("jasa") && (
        <Link to="/jasa" className={tile}>
          <span className={cn(dot, "bg-[#f1e8ff] text-[#7c3aed]")}><Wrench className="size-8" /></span>Jasa
        </Link>
      )}
      {on("karya") && (
        <Link to="/katalog" className={tile}>
          <span className={cn(dot, "bg-[#e0f7fa] text-[#0891b2]")}><LayoutGrid className="size-8" fill="currentColor" /></span>Katalog
        </Link>
      )}
      {on("jobs") && (
        <Link to="/lowongan" className={tile}>
          <span className={cn(dot, "bg-[#ffeedd] text-[#ff7a00]")}><Briefcase className="size-8" fill="currentColor" /></span>Lowongan
        </Link>
      )}
      {on("discuss") && (
        <Link to="/discuss" className={tile}>
          <span className={cn(dot, "bg-[#e3ecff] text-[#2563eb]")}><MessageCircle className="size-8" fill="currentColor" /></span>Diskusi
        </Link>
      )}
    </nav>
  );
}

// ---------- Bagian ----------

function Section({ icon, title, to, children }: { icon: ReactNode; title: string; to: "/explore" | "/lowongan" | "/discuss"; children: ReactNode }) {
  return (
    <section className="pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">{icon}{title}</h2>
        <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-bold text-[#1a73e8] hover:underline">Lihat Semua <ArrowRight className="size-4" /></Link>
      </div>
      {children}
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">{children}</p>;
}

function RepoItem({ r }: { r: HomeRepo }) {
  const stars = r.stars?.[0]?.count ?? 0;
  const chip = r.topics?.[0] ?? r.language;
  const card = "flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md";
  const body = (
    <>
      <div className="flex h-24 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a56e8] to-[#0b2a8a] sm:h-28 sm:w-40">
        <Code className="size-10 text-white/90 sm:size-12" strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-extrabold sm:text-xl">{r.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Star className="size-4" />{stars}{r.language && <span className="ml-3 truncate">{r.language}</span>}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{r.description || "Repositori publik komunitas GOBI."}</p>
        {chip && <span className="mt-1.5 inline-block max-w-full truncate rounded-full bg-[#e3efff] px-3 py-0.5 text-xs font-bold text-[#1a73e8]">{chip}</span>}
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e7ecf6]"><ArrowRight className="size-5" /></span>
    </>
  );
  if (!r.owner?.username) return <div className={card}>{body}</div>;
  return <Link to="/$username/$repo" params={{ username: r.owner.username, repo: r.name }} className={card}>{body}</Link>;
}
