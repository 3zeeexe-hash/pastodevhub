import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign, CheckCheck, Heart, MessageCircle, Quote, Repeat2, UserPlus, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { timeAgo, useAuth } from "@/lib/auth";
import { DM_NOT_READY, fetchInbox, type Conversation } from "@/lib/dm";
import { fetchNotifications, markNotificationsRead, type FeedNotification, type NotificationType } from "@/lib/feed";
import { errMsg } from "@/lib/market";
import { useNotifSources } from "@/lib/use-all-notifs";
import { fetchWorkNotifs, notifGroup, refreshWorkNotifs, type WorkNotif } from "@/lib/use-work-unread";
import { workRpc } from "@/lib/work-db";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { WorkNotifRow } from "@/components/work-notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "semua" | "aktivitas" | "kerja" | "pesan";
type Source = "aktivitas" | "kerja" | "pesan";

const searchSchema = z.object({
  /** Saringan: aktivitas Diskusi, kerja (GOBI WORK), atau pesan. Kosong = semua. */
  tab: z.enum(["aktivitas", "kerja", "pesan"]).optional().catch(undefined),
});

export const Route = createFileRoute("/notifikasi")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Notifikasi — GoBi" }, { name: "robots", content: "noindex" }] }),
  component: NotificationsPage,
});

/** Satu baris di daftar gabungan. `at` dipakai untuk mengurutkan dari yang terbaru, `source` untuk tab saringan. */
type Entry =
  | { key: string; source: "aktivitas"; at: string; unread: boolean; kind: "feed"; n: FeedNotification }
  | { key: string; source: "kerja" | "pesan"; at: string; unread: boolean; kind: "work"; n: WorkNotif }
  | { key: string; source: "pesan"; at: string; unread: boolean; kind: "dm"; c: Conversation };

const CARD = "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:border-primary/50";
const UNREAD = "border-primary/30 bg-primary/5";
const READ = "border-border bg-card";

const FEED_META: Record<NotificationType, { Icon: LucideIcon; text: string; tone: string }> = {
  like: { Icon: Heart, text: "menyukai post kamu", tone: "bg-rose-500/15 text-rose-500" },
  reply: { Icon: MessageCircle, text: "membalas post kamu", tone: "bg-primary/15 text-primary" },
  mention: { Icon: AtSign, text: "menyebut kamu", tone: "bg-primary/15 text-primary" },
  follow: { Icon: UserPlus, text: "mulai mengikuti kamu", tone: "bg-primary/15 text-primary" },
  repost: { Icon: Repeat2, text: "me-repost post kamu", tone: "bg-emerald-500/15 text-emerald-600" },
  quote: { Icon: Quote, text: "mengutip post kamu", tone: "bg-emerald-500/15 text-emerald-600" },
};

const EMPTY: Record<Tab, string> = {
  semua: "Belum ada notifikasi. Like, balasan, kabar lamaran, kontrak, pembayaran, dan pesan baru akan muncul di sini.",
  aktivitas: "Belum ada aktivitas. Like, balasan, mention, dan follower baru akan muncul di sini.",
  kerja: "Belum ada notifikasi kerja. Kabar lamaran, kontrak, dan pembayaran akan muncul di sini.",
  pesan: "Tidak ada pesan baru.",
};

function Meta({ label, at }: { label: string; at: string }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded-full bg-secondary px-2 py-0.5">{label}</span>
      {timeAgo(at)}
    </span>
  );
}

function UnreadDot() {
  return <span aria-label="Belum dibaca" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-500" />;
}

/** Aktivitas Diskusi: like, balasan, mention, follow, repost, kutipan. */
function FeedRow({ n }: { n: FeedNotification }) {
  const { Icon, text, tone } = FEED_META[n.type];
  const name = n.actor.display_name || n.actor.username;
  const unread = !n.read_at;
  const card = (
    <div className={cn(CARD, unread ? UNREAD : READ)}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tone)}><Icon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <AvatarMini name={n.actor.username} url={n.actor.avatar_url} size={24} />
          <p className={cn("min-w-0 text-sm", !unread && "text-muted-foreground")}><b className="font-semibold text-foreground">{name}</b> {text}</p>
        </div>
        {n.post?.body && <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{n.post.body}</p>}
        <Meta label="Aktivitas" at={n.created_at} />
      </div>
      {unread && <UnreadDot />}
    </div>
  );
  return n.type === "follow" || !n.post_id
    ? <Link to="/$username" params={{ username: n.actor.username }} className="block">{card}</Link>
    : <Link to="/discuss/status/$id" params={{ id: n.post_id }} className="block">{card}</Link>;
}

/** Pesan langsung yang belum dibaca. Satu baris per percakapan; membukanya menandai dibaca. */
function DmRow({ c }: { c: Conversation }) {
  return (
    <Link to="/discuss/pesan/$id" params={{ id: c.conversation_id }} className="block">
      <div className={cn(CARD, UNREAD)}>
        <AvatarMini name={c.username} url={c.avatar_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><b className="font-semibold">{c.display_name || c.username}</b> mengirim {c.unread} pesan baru</p>
          <p className="mt-1 line-clamp-1 break-words text-sm text-muted-foreground">{c.last_body}</p>
          <Meta label="Pesan" at={c.last_at} />
        </div>
        <UnreadDot />
      </div>
    </Link>
  );
}

function EntryRow({ e }: { e: Entry }) {
  if (e.kind === "feed") return <FeedRow n={e.n} />;
  if (e.kind === "work") return <WorkNotifRow n={e.n} />;
  return <DmRow c={e.c} />;
}

/**
 * Satu halaman untuk semua notifikasi: aktivitas Diskusi (like, balasan, mention, follow), GOBI WORK (lamaran, kontrak, pembayaran,
 * pesan kerja), dan pesan langsung yang belum dibaca. Digabung dan diurutkan dari yang terbaru; tab menyaring per jenis
 * (?tab=aktivitas|kerja|pesan). Rute lama /discuss/notifikasi dan /kerja/notifikasi mengarah ke sini.
 */
function NotificationsPage() {
  const { user, loading } = useAuth();
  const { tab: picked } = Route.useSearch();
  const { discuss, jobs } = useNotifSources();
  const qc = useQueryClient();
  const uid = user?.id ?? null;

  // Kunci kuerinya sama dengan header, menu samping, dan ChatDock, jadi cache dipakai bersama.
  const feed = useQuery({ queryKey: ["feed-notifs", uid], queryFn: () => fetchNotifications(user!.id), enabled: !!user && discuss });
  const work = useQuery({ queryKey: ["work-notifs", 100], queryFn: () => fetchWorkNotifs(100), enabled: !!user && jobs, refetchInterval: 60_000 });
  const dm = useQuery({ queryKey: ["dm-inbox", uid], queryFn: fetchInbox, enabled: !!user && discuss, refetchInterval: 30_000 });

  const tabs: { key: Tab; label: string }[] = [
    { key: "semua", label: "Semua" },
    ...(discuss ? [{ key: "aktivitas" as const, label: "Aktivitas" }] : []),
    ...(jobs ? [{ key: "kerja" as const, label: "Kerja" }] : []),
    { key: "pesan", label: "Pesan" },
  ];
  const active: Tab = picked && tabs.some((t) => t.key === picked) ? picked : "semua";

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const n of feed.data ?? []) out.push({ key: `f-${n.id}`, source: "aktivitas", at: n.created_at, unread: !n.read_at, kind: "feed", n });
    for (const n of work.data ?? []) {
      out.push({ key: `w-${n.id}`, source: notifGroup(n.kind) === "pesan" ? "pesan" : "kerja", at: n.created_at, unread: !n.read_at, kind: "work", n });
    }
    for (const c of dm.data ?? []) {
      if (c.unread > 0) out.push({ key: `d-${c.conversation_id}`, source: "pesan", at: c.last_at, unread: true, kind: "dm", c });
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [feed.data, work.data, dm.data]);

  const unreadIn = (s: Source) => entries.filter((e) => e.unread && e.source === s).length;
  const counts: Record<Tab, number> = {
    semua: entries.filter((e) => e.unread).length,
    aktivitas: unreadIn("aktivitas"),
    kerja: unreadIn("kerja"),
    pesan: unreadIn("pesan"),
  };
  const shown = active === "semua" ? entries : entries.filter((e) => e.source === active);

  // Aktivitas Diskusi ditandai dibaca setelah daftarnya tampil (seperti sebelumnya); baris yang belum dibaca tetap diberi warna selama halaman terbuka.
  const feedUnread = !!feed.data?.some((n) => !n.read_at);
  const viewsFeed = active === "semua" || active === "aktivitas";
  useEffect(() => {
    if (!user || !feedUnread || !viewsFeed) return;
    markNotificationsRead(user.id).then(() => qc.invalidateQueries({ queryKey: ["feed-unread"] })).catch(() => {});
  }, [user, feedUnread, viewsFeed, qc]);

  // Notifikasi kerja ditandai dibaca saat diketuk; "Tandai semua dibaca" menandai aktivitas dan kerja sekaligus. Pesan dibaca dengan membuka percakapannya.
  const canMarkAll = entries.some((e) => e.unread && e.kind !== "dm");
  async function markAll() {
    if (!user) return;
    try {
      await Promise.all([discuss ? markNotificationsRead(user.id) : null, jobs ? workRpc("work_mark_notifications_read") : null]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["feed-notifs"] }),
        qc.invalidateQueries({ queryKey: ["feed-unread"] }),
        refreshWorkNotifs(qc),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  const failures = [
    feed.error ? `Aktivitas: ${errMsg(feed.error)}` : null,
    work.error ? `Kerja: ${errMsg(work.error)}` : null,
    dm.error && dm.error.message !== DM_NOT_READY ? `Pesan: ${dm.error.message}` : null,
  ].filter((x): x is string => !!x);
  const loadingData = feed.isLoading || work.isLoading || dm.isLoading;

  return (
    <main className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifikasi</h1>
        {user && (
          <Button size="sm" variant="ghost" onClick={markAll} disabled={!canMarkAll}><CheckCheck /> Tandai semua dibaca</Button>
        )}
      </div>

      {loading ? null : !user ? (
        <div className="mt-4"><SignInCta text="Masuk untuk melihat notifikasi." /></div>
      ) : (
        <>
          <nav role="tablist" aria-label="Jenis notifikasi" className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((t) => (
              <Link
                key={t.key}
                to="/notifikasi"
                search={t.key === "semua" ? {} : { tab: t.key }}
                role="tab"
                aria-selected={active === t.key}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition", active === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                {t.label}
                {counts[t.key] > 0 && (
                  <span className={cn("min-w-4 rounded-full px-1 text-center font-mono text-[10px] leading-4", active === t.key ? "bg-primary-foreground/25 text-primary-foreground" : "bg-red-500 text-white")}>{counts[t.key] > 99 ? "99+" : counts[t.key]}</span>
                )}
              </Link>
            ))}
          </nav>

          {failures.length > 0 && (
            <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">Sebagian notifikasi gagal dimuat. {failures.join(" · ")}</p>
          )}

          {loadingData && !shown.length ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat…</p>
          ) : shown.length ? (
            <ul className="mt-3 space-y-2">
              {shown.map((e) => <li key={e.key}><EntryRow e={e} /></li>)}
            </ul>
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{EMPTY[active]}</p>
          )}

          {discuss && (active === "semua" || active === "pesan") && (
            <Link to="/discuss/pesan" search={{}} className="mt-4 block rounded-xl border border-border px-4 py-2.5 text-center text-sm font-medium text-link hover:bg-accent/40">Buka semua pesan</Link>
          )}
        </>
      )}
    </main>
  );
}
