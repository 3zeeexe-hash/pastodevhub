import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AtSign, Heart, MessageCircle, Quote, Repeat2, UserPlus } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { fetchNotifications, markNotificationsRead, type FeedNotification, type NotificationType } from "@/lib/feed";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/discuss/notifikasi")({
  head: () => ({ meta: [{ title: "Notifikasi — Diskusi — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: NotificationsPage,
});

const META: Record<NotificationType, { Icon: typeof Heart; text: string; color: string }> = {
  like: { Icon: Heart, text: "menyukai post kamu", color: "text-rose-500" },
  reply: { Icon: MessageCircle, text: "membalas post kamu", color: "text-primary" },
  mention: { Icon: AtSign, text: "menyebut kamu", color: "text-primary" },
  follow: { Icon: UserPlus, text: "mulai mengikuti kamu", color: "text-primary" },
  repost: { Icon: Repeat2, text: "me-repost post kamu", color: "text-emerald-500" },
  quote: { Icon: Quote, text: "mengutip post kamu", color: "text-emerald-500" },
};

function Row({ n }: { n: FeedNotification }) {
  const { Icon, text, color } = META[n.type];
  const name = n.actor.display_name || n.actor.username;
  const inner = (
    <div className={cn("flex gap-3 border-b border-border px-4 py-3 hover:bg-accent/30", !n.read_at && "bg-primary/5")}>
      <Icon className={cn("mt-1 size-5 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <AvatarMini name={n.actor.username} url={n.actor.avatar_url} size={28} />
          <p className="text-sm"><b>{name}</b> {text} <span className="text-muted-foreground">· {timeAgo(n.created_at)}</span></p>
        </div>
        {n.post?.body && <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{n.post.body}</p>}
      </div>
    </div>
  );
  return n.type === "follow" || !n.post_id
    ? <Link to="/$username" params={{ username: n.actor.username }} className="block">{inner}</Link>
    : <Link to="/discuss/status/$id" params={{ id: n.post_id }} className="block">{inner}</Link>;
}

function NotificationsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["feed-notifs", user?.id ?? null], queryFn: () => fetchNotifications(user!.id), enabled: !!user });
  const hasUnread = !!q.data?.some((n) => !n.read_at);

  // Tandai dibaca setelah daftar tampil; baris yang belum dibaca tetap diberi warna selama halaman ini terbuka.
  useEffect(() => {
    if (!user || !hasUnread) return;
    markNotificationsRead(user.id).then(() => qc.invalidateQueries({ queryKey: ["feed-unread"] })).catch(() => {});
  }, [user, hasUnread, qc]);

  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/discuss" aria-label="Kembali ke Diskusi" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-bold">Notifikasi</h1>
      </div>
      {loading ? null : !user ? (
        <div className="p-6"><SignInCta text="Masuk untuk melihat notifikasi." /></div>
      ) : q.isLoading ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat…</p>
      ) : q.isError ? (
        <p className="px-4 py-10 text-center text-sm text-destructive">Gagal memuat: {(q.error as Error).message}</p>
      ) : q.data?.length ? (
        q.data.map((n) => <Row key={n.id} n={n} />)
      ) : (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">Belum ada notifikasi. Like, balasan, mention, dan follower baru akan muncul di sini.</p>
      )}
    </main>
  );
}
