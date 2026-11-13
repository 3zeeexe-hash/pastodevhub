import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Flame, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { SignInCta } from "@/components/sign-in-cta";
import { ComposerBar, StoryRow, WelcomeBanner } from "@/components/feed/discuss-ui";
import { Timeline } from "@/components/feed/timeline";
import { ForumList } from "@/components/feed/forum-list";
import { TrendingTags } from "@/components/feed/trending";
import { LeftRail } from "@/components/home/left-rail";
import { RightRail } from "@/components/home/right-rail";
import { useHomeData } from "@/components/home/use-home-data";
import { cn } from "@/lib/utils";

// "untuk-kamu" adalah tab bawaan. Kalau peringkat di database belum aktif, isinya sama dengan "Terbaru".
const TABS = ["untuk-kamu", "linimasa", "mengikuti", "tren", "forum"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "untuk-kamu";
const TAB_LABEL: Record<Tab, string> = { "untuk-kamu": "Untuk Kamu", linimasa: "Terbaru", mengikuti: "Mengikuti", tren: "Tren", forum: "Forum" };

export const Route = createFileRoute("/discuss/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const t = s["tab"];
    return TABS.includes(t as Tab) ? { tab: t as Tab } : {};
  },
  head: () => ({ meta: [{ title: "Diskusi — Pastodev" }, { name: "description", content: "Linimasa dan forum komunitas developer Pastodev." }, { property: "og:title", content: "Diskusi — Pastodev" }, { property: "og:description", content: "Posting, balas, repost, dan ikuti developer lain di Pastodev." }] }),
  component: Discuss,
});

/**
 * Halaman Diskusi (desain GOBI): kotak tulis, tab berbentuk pil, baris talenta, banner sambutan, lalu post sebagai kartu.
 * Mobile: satu kolom. lg: menu kiri + linimasa. xl: ditambah kolom kanan (pencarian, tren, lowongan), sama seperti /gobifeed.
 * Notifikasi dan pencarian ada di header global; Pesan dan Tersimpan ada di menu kiri (lg ke atas) atau baris ikon di bawah (mobile).
 */
function Discuss() {
  const { tab = DEFAULT_TAB } = Route.useSearch();
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const data = useHomeData(on);
  const signedIn = !!user && !!profile;
  const dmUnread = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const feedTab = tab !== "forum" && tab !== "tren";
  const iconLink = "relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground";

  return (
    <main className="mx-auto grid max-w-7xl lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-4 lg:px-4 xl:grid-cols-[15rem_minmax(0,40rem)_20rem] xl:justify-center">
      <LeftRail />

      <div className="min-w-0 border-border pb-4 lg:border-x">
        <div className="flex items-center gap-2 px-4 pt-3 lg:p-0">
          <h1 className="text-xl font-bold lg:sr-only">Diskusi</h1>
          {user && (
            <div className="ml-auto flex items-center gap-1 lg:hidden">
              <Link to="/discuss/pesan" search={{}} aria-label="Pesan" className={iconLink}>
                <Mail className="size-5" />
                {!!dmUnread.data && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">{dmUnread.data > 99 ? "99+" : dmUnread.data}</span>}
              </Link>
              <Link to="/discuss/tersimpan" aria-label="Tersimpan" className={iconLink}><Bookmark className="size-5" /></Link>
            </div>
          )}
        </div>

        {feedTab && <div className="px-3 pb-1 pt-3 sm:px-4 lg:pt-4"><ComposerBar /></div>}

        <nav aria-label="Tab diskusi" className="sticky top-14 z-30 flex gap-2 overflow-x-auto bg-background/90 px-3 py-3 backdrop-blur [scrollbar-width:none] sm:px-4">
          {TABS.map((t) => (
            <Link
              key={t}
              to="/discuss"
              search={t === DEFAULT_TAB ? {} : { tab: t }}
              replace
              aria-current={tab === t ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition",
                tab === t ? "bg-primary text-primary-foreground shadow-glow" : "bg-card/70 text-foreground/90 ring-1 ring-border hover:bg-accent",
              )}
            >
              {t === "untuk-kamu" && <Flame className="size-4" />}
              {TAB_LABEL[t]}
            </Link>
          ))}
        </nav>

        {tab === "forum" ? (
          <ForumList />
        ) : tab === "tren" ? (
          <>
            {/* Di layar xl, tren sudah tampil di kolom kanan. */}
            <div className="xl:hidden"><TrendingTags /></div>
            <h2 className="px-4 pb-2 pt-4 text-sm font-semibold">Post terpopuler</h2>
            <Timeline variant="card" query={{ tab: "trending" }} empty="Belum ada post yang ramai dalam beberapa hari terakhir." />
          </>
        ) : (
          <>
            <StoryRow data={data} />
            {tab === DEFAULT_TAB && <WelcomeBanner />}
            {tab === "mengikuti" && !user ? (
              <div className="p-6"><SignInCta text="Masuk untuk melihat post dari developer yang kamu ikuti." /></div>
            ) : (
              <Timeline
                variant="card"
                query={{ tab: tab === "mengikuti" ? "following" : tab === DEFAULT_TAB ? "forYou" : "all" }}
                empty={tab === "mengikuti"
                  ? <>Linimasa ini masih kosong. Ikuti developer dari <Link to="/search" search={{ q: "", type: "users" }} className="text-primary hover:underline">halaman Developer</Link>, atau tulis post pertamamu.</>
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
