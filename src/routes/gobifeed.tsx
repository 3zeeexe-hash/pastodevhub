import { createFileRoute, Link } from "@tanstack/react-router";
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
import { DiscoverStrip, RightRail } from "@/components/home/right-rail";
import { StoryRow } from "@/components/feed/discuss-ui";
import { useHomeData, type HomeData } from "@/components/home/use-home-data";
import { cn } from "@/lib/utils";

// Linimasa GOBI memakai linimasa yang sama dengan halaman Diskusi. "untuk-kamu" adalah tab bawaan.
const TABS = ["untuk-kamu", "linimasa", "mengikuti", "tren", "forum"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "untuk-kamu";
const TAB_LABEL: Record<Tab, string> = { "untuk-kamu": "Untuk Kamu", linimasa: "Terbaru", mengikuti: "Mengikuti", tren: "Tren", forum: "Forum" };

export const Route = createFileRoute("/gobifeed")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s["tab"];
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Linimasa — GOBI" },
      { name: "description", content: "Linimasa komunitas GOBI: post, tren, forum, dan lowongan terbaru dari developer, freelancer, dan client." },
      { property: "og:title", content: "Linimasa — GOBI" },
      { property: "og:description", content: "Ikuti obrolan developer Indonesia di linimasa GOBI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GobiFeed,
});

/**
 * Linimasa ala media sosial (Instagram / X), satu tampilan untuk semua peran: menu di kiri, linimasa di tengah,
 * tren dan rekomendasi di kanan. Dulu ini beranda ("/"); sekarang beranda memakai desain GOBI baru dan halaman ini ada di /gobifeed.
 */
function GobiFeed() {
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
          <h1 className="sr-only">Linimasa GOBI</h1>
          {feedOn ? (
            <nav className="flex overflow-x-auto" aria-label="Tab linimasa">
              {TABS.map((t) => (
                <Link
                  key={t}
                  to="/gobifeed"
                  search={t === DEFAULT_TAB ? {} : { tab: t }}
                  replace
                  className={cn("flex-1 shrink-0 whitespace-nowrap border-b-2 px-4 py-3.5 text-center text-sm font-medium transition hover:bg-accent/40", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
                >
                  {TAB_LABEL[t]}
                </Link>
              ))}
            </nav>
          ) : (
            <p className="px-4 py-3.5 text-sm font-semibold">Linimasa</p>
          )}
        </div>

        {feedOn && <div className="border-b border-border"><StoryRow data={data} /></div>}
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
