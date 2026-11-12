import { createFileRoute, Link } from "@tanstack/react-router";
import { siteJsonLd } from "@/lib/seo";
import { useAuth } from "@/lib/auth";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { SignInCta } from "@/components/sign-in-cta";
import { Composer } from "@/components/feed/composer";
import { ForumList } from "@/components/feed/forum-list";
import { Timeline } from "@/components/feed/timeline";
import { TrendingTags } from "@/components/feed/trending";
import { JobCard } from "@/components/job-card";
import { LeftRail } from "@/components/home/left-rail";
import { DiscoverStrip, RightRail, TalentStories } from "@/components/home/right-rail";
import { useHomeData, type HomeData } from "@/components/home/use-home-data";
import { cn } from "@/lib/utils";

// Tab beranda memakai linimasa yang sama dengan halaman Diskusi. "untuk-kamu" adalah tab bawaan.
const TABS = ["untuk-kamu", "linimasa", "mengikuti", "tren", "forum"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "untuk-kamu";
const TAB_LABEL: Record<Tab, string> = { "untuk-kamu": "Untuk Kamu", linimasa: "Terbaru", mengikuti: "Mengikuti", tren: "Tren", forum: "Forum" };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s["tab"];
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  head: ({ matches }) => {
    const origin = (matches[0]?.loaderData as { siteUrl?: string | null } | undefined)?.siteUrl;
    return {
    scripts: origin ? [{ type: "application/ld+json", children: siteJsonLd(origin) }] : [],
    meta: [
      { title: "Pastodev — Tempat developer, freelancer, dan client bekerja bareng" },
      { name: "description", content: "Satu akun untuk semua: cari developer, ambil proyek freelance, jual karya, pesan jasa, dan simpan kode pribadi bersama komunitas Nusantara." },
      { property: "og:title", content: "Pastodev — Tempat developer, freelancer, dan client bekerja bareng" },
      { property: "og:description", content: "Pribadi, client, freelancer, atau developer: semua punya ruang kerja di satu akun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    };
  },
  component: Index,
});

/**
 * Beranda ala media sosial (Instagram / X), satu tampilan untuk semua peran: menu di kiri, linimasa di tengah,
 * tren dan rekomendasi di kanan. Tombol yang sudah ada di header (notifikasi, profil, ruang kerja, buat baru, masuk)
 * tidak diulang di halaman ini; di beranda, header hanya menyembunyikan menu tautan dan kolom cari yang digantikan kolom samping.
 */
function Index() {
  const { tab = DEFAULT_TAB } = Route.useSearch();
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const data = useHomeData(on);
  const feedOn = on("discuss");
  const signedIn = !!user && !!profile;

  return (
    <main className="mx-auto grid max-w-7xl lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-4 lg:px-4 xl:grid-cols-[15rem_minmax(0,40rem)_20rem] xl:justify-center">
      <LeftRail />

      <div className="min-w-0 border-border lg:border-x">
        <div className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur">
          <h1 className="sr-only">Beranda Pastodev</h1>
          {feedOn ? (
            <nav className="flex overflow-x-auto" aria-label="Tab beranda">
              {TABS.map((t) => (
                <Link
                  key={t}
                  to="/"
                  search={t === DEFAULT_TAB ? {} : { tab: t }}
                  replace
                  className={cn("flex-1 shrink-0 whitespace-nowrap border-b-2 px-4 py-3.5 text-center text-sm font-medium transition hover:bg-accent/40", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
                >
                  {TAB_LABEL[t]}
                </Link>
              ))}
            </nav>
          ) : (
            <p className="px-4 py-3.5 text-sm font-semibold">Beranda</p>
          )}
        </div>

        <TalentStories data={data} />
        <DiscoverStrip data={data} on={on} />

        {!feedOn ? (
          <FeedOffHome data={data} on={on} />
        ) : tab === "forum" ? (
          <ForumList />
        ) : tab === "tren" ? (
          <>
            <div className="xl:hidden"><TrendingTags /></div>
            <h2 className="px-4 pt-4 text-sm font-semibold">Post terpopuler</h2>
            <Timeline query={{ tab: "trending" }} empty="Belum ada post yang ramai dalam beberapa hari terakhir." />
          </>
        ) : (
          <>
            <div id="tulis" className="scroll-mt-32 border-b border-border p-4"><Composer kind="post" /></div>
            {tab === "mengikuti" && !user ? (
              <div className="p-6"><SignInCta text="Masuk untuk melihat post dari developer yang kamu ikuti." /></div>
            ) : (
              <Timeline
                query={{ tab: tab === "mengikuti" ? "following" : tab === "untuk-kamu" ? "forYou" : "all" }}
                empty={tab === "mengikuti"
                  ? <>Linimasa ini masih kosong. Ikuti developer dari <Link to="/search" search={{ q: "", type: "users" }} className="text-primary hover:underline">halaman Talenta</Link>, atau tulis post pertamamu.</>
                  : "Belum ada post. Jadilah yang pertama!"}
              />
            )}
          </>
        )}
      </div>

      <RightRail data={data} on={on} userId={signedIn ? user.id : null} />
    </main>
  );
}

/** Cadangan kalau fitur Diskusi dimatikan admin: linimasa kosong diganti lowongan terbaru. */
function FeedOffHome({ data, on }: { data: HomeData; on: (k: FeatureKey) => boolean }) {
  const jobs = on("jobs") ? (data.jobs.data ?? []) : [];
  if (!jobs.length) {
    return <p className="px-4 py-12 text-center text-sm text-muted-foreground">Belum ada yang bisa ditampilkan. Jelajahi proyek atau cari talenta lewat menu.</p>;
  }
  return (
    <div className="space-y-6 p-4">
      <section>
        <h2 className="text-lg font-bold">Proyek dan lowongan terbaru</h2>
        <div className="mt-3 grid gap-3">{jobs.map((j) => <JobCard key={j.id} j={j} />)}</div>
      </section>
    </div>
  );
}
