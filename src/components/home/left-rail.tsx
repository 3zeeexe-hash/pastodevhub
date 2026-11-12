import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Bell, Bookmark, Briefcase, Compass, Home, LayoutDashboard, Mail, MessageSquare, Package, Plus, Search, User, Users, Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchUnreadCount } from "@/lib/feed";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { ROLE_INFO, workspacePath } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = { to: string; search?: Record<string, unknown>; label: string; Icon: LucideIcon; badge?: number; exact?: boolean };

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return <span className={cn("min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground", className)}>{n > 99 ? "99+" : n}</span>;
}

/** Jumlah notifikasi dan pesan belum dibaca. Kunci kuerinya sama dengan halaman Diskusi, jadi cache dipakai bersama. */
function useUnread(userId: string | undefined, enabled: boolean) {
  const notif = useQuery({
    queryKey: ["feed-unread", userId ?? null],
    queryFn: () => fetchUnreadCount(userId!),
    enabled: !!userId && enabled,
    refetchInterval: 60_000,
  });
  const dm = useQuery({
    queryKey: ["dm-unread", userId ?? null],
    queryFn: () => fetchDmUnread(userId),
    enabled: !!userId && enabled,
    refetchInterval: 60_000,
  });
  return { notif: notif.data ?? 0, dm: dm.data ?? 0 };
}

function useHomeNav() {
  const { user, profile } = useAuth();
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  const unread = useUnread(user?.id, on("discuss"));
  return { user, profile, role, on, signedIn, unread };
}

/** Menu kiri ala X: sama untuk semua peran. Hanya tampil di layar lebar. */
export function LeftRail() {
  const { profile, role, on, signedIn, unread } = useHomeNav();

  const items: NavItem[] = [
    { to: "/", label: "Beranda", Icon: Home, exact: true },
    { to: "/explore", label: "Jelajahi", Icon: Compass },
    { to: "/search", search: { q: "", type: "users" }, label: "Talenta", Icon: Users },
    ...(on("jobs") ? [{ to: "/lowongan", label: "Lowongan", Icon: Briefcase }] : []),
    ...(on("jasa") ? [{ to: "/jasa", label: "Jasa", Icon: Wrench }] : []),
    ...(on("karya") ? [{ to: "/katalog", label: "Katalog", Icon: Package }] : []),
    ...(on("discuss") ? [{ to: "/discuss", search: { tab: "forum" }, label: "Forum", Icon: MessageSquare }] : []),
    ...(signedIn && on("discuss")
      ? [
          { to: "/discuss/pesan", search: {}, label: "Pesan", Icon: Mail, badge: unread.dm },
          { to: "/discuss/notifikasi", label: "Notifikasi", Icon: Bell, badge: unread.notif },
          { to: "/discuss/tersimpan", label: "Tersimpan", Icon: Bookmark },
        ]
      : []),
    ...(signedIn && profile
      ? [
          { to: workspacePath(profile.account_type), label: ROLE_INFO[role].workspaceLabel, Icon: LayoutDashboard },
          { to: `/${profile.username}`, label: "Profil", Icon: User },
        ]
      : []),
  ];

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] flex-col overflow-y-auto py-4 lg:flex">
      <nav aria-label="Menu beranda" className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            search={item.search as never}
            activeOptions={{ exact: !!item.exact, includeSearch: false }}
            className="flex items-center gap-4 rounded-full px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent hover:text-foreground"
            activeProps={{ className: "font-bold text-foreground" }}
          >
            <item.Icon className="size-5 shrink-0" />
            <span className="truncate">{item.label}</span>
            <Badge n={item.badge} className="ml-auto" />
          </Link>
        ))}
      </nav>

      {signedIn && on("discuss") ? (
        <Button asChild size="lg" className="mt-4 w-full rounded-full">
          <Link to="/" search={{}} hash="tulis"><Plus /> Posting</Link>
        </Button>
      ) : (
        !signedIn && (
          <Button asChild size="lg" className="mt-4 w-full rounded-full">
            <Link to="/auth">Masuk / Daftar</Link>
          </Button>
        )
      )}

      {signedIn && profile && (
        <Link to="/$username" params={{ username: profile.username }} className="mt-auto flex items-center gap-3 rounded-full p-3 hover:bg-accent">
          <AvatarMini name={profile.username} url={profile.avatar_url} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{profile.display_name || profile.username}</span>
            <span className="block truncate text-xs text-muted-foreground">@{profile.username} · {ROLE_INFO[role].title}</span>
          </span>
        </Link>
      )}
    </aside>
  );
}

/** Bilah tab bawah ala Instagram untuk layar kecil. */
export function MobileTabBar() {
  const { profile, on, signedIn, unread } = useHomeNav();
  const tab = "relative flex flex-1 items-center justify-center py-3 text-muted-foreground transition hover:text-foreground";
  const active = { className: "text-foreground" };
  const opts = { exact: true, includeSearch: false } as const;

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-header/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch">
        <Link to="/" aria-label="Beranda" activeOptions={opts} className={tab} activeProps={active}><Home className="size-6" /></Link>
        <Link to="/search" search={{ q: "", type: "users" }} aria-label="Cari" activeOptions={opts} className={tab} activeProps={active}><Search className="size-6" /></Link>
        {signedIn && on("discuss") && (
          <Link to="/" search={{}} hash="tulis" aria-label="Buat posting" className="flex flex-1 items-center justify-center py-2">
            <span className="flex h-9 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Plus className="size-5" /></span>
          </Link>
        )}
        {signedIn && on("discuss") ? (
          <Link to="/discuss/notifikasi" aria-label="Notifikasi" className={tab} activeProps={active}>
            <Bell className="size-6" />
            <Badge n={unread.notif} className="absolute right-[28%] top-1.5" />
          </Link>
        ) : (
          <Link to="/explore" aria-label="Jelajahi" className={tab} activeProps={active}><Compass className="size-6" /></Link>
        )}
        {signedIn && profile ? (
          <Link to="/$username" params={{ username: profile.username }} aria-label="Profil" className={tab}>
            <AvatarMini name={profile.username} url={profile.avatar_url} size={26} />
          </Link>
        ) : (
          <Link to="/auth" aria-label="Masuk" className={tab}><User className="size-6" /></Link>
        )}
      </div>
    </nav>
  );
}
