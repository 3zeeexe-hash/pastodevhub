import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bookmark, Mail, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchUnreadCount } from "@/lib/feed";
import { fetchDmUnread } from "@/lib/dm";
import { SignInCta } from "@/components/sign-in-cta";
import { Composer } from "@/components/feed/composer";
import { Timeline } from "@/components/feed/timeline";
import { ForumList } from "@/components/feed/forum-list";
import { TrendingTags } from "@/components/feed/trending";
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

function Discuss() {
  const { tab = DEFAULT_TAB } = Route.useSearch();
  const { user } = useAuth();
  const unread = useQuery({
    queryKey: ["feed-unread", user?.id ?? null],
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const dmUnread = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-2 px-4 pt-6">
        <h1 className="text-2xl font-bold">Diskusi</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link to="/search" search={{ q: "", type: "posts" }} aria-label="Cari di Diskusi" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><Search className="size-5" /></Link>
          {user && (
            <>
            <Link to="/discuss/pesan" search={{}} aria-label="Pesan" className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Mail className="size-5" />
              {!!dmUnread.data && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">{dmUnread.data > 99 ? "99+" : dmUnread.data}</span>}
            </Link>
            <Link to="/discuss/notifikasi" aria-label="Notifikasi" className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Bell className="size-5" />
              {!!unread.data && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">{unread.data > 99 ? "99+" : unread.data}</span>}
            </Link>
            <Link to="/discuss/tersimpan" aria-label="Tersimpan" className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><Bookmark className="size-5" /></Link>
            </>
          )}
        </div>
      </div>

      <nav className="mt-4 flex overflow-x-auto border-b border-border" aria-label="Tab diskusi">
        {TABS.map((t) => (
          <Link key={t} to="/discuss" search={t === DEFAULT_TAB ? {} : { tab: t }} replace
            className={cn("shrink-0 flex-1 whitespace-nowrap border-b-2 px-4 py-3 text-center text-sm font-medium transition hover:bg-accent/40", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {tab === "forum" ? (
        <ForumList />
      ) : tab === "tren" ? (
        <>
          <TrendingTags />
          <h2 className="px-4 pt-4 text-sm font-semibold">Post terpopuler</h2>
          <Timeline query={{ tab: "trending" }} empty="Belum ada post yang ramai dalam beberapa hari terakhir." />
        </>
      ) : (
        <>
          <div className="border-b border-border p-4"><Composer kind="post" /></div>
          {tab === "mengikuti" && !user ? (
            <div className="p-6"><SignInCta text="Masuk untuk melihat post dari developer yang kamu ikuti." /></div>
          ) : (
            <Timeline
              query={{ tab: tab === "mengikuti" ? "following" : tab === "untuk-kamu" ? "forYou" : "all" }}
              empty={tab === "mengikuti"
                ? <>Linimasa ini masih kosong. Ikuti developer dari <Link to="/search" search={{ q: "", type: "users" }} className="text-primary hover:underline">halaman Developer</Link>, atau tulis post pertamamu.</>
                : "Belum ada post. Jadilah yang pertama!"}
            />
          )}
        </>
      )}
    </main>
  );
}
