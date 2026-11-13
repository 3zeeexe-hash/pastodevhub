import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Bell, Bookmark, BookMarked, Briefcase, Home, LogIn, LogOut, Mail, MessageSquare, Package, Search, User, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { fetchUnreadCount } from "@/lib/feed";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

type NavItem = { to: string; search?: Record<string, unknown>; params?: Record<string, string>; label: string; Icon: LucideIcon; badge?: number; exact?: boolean };

const row = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white data-[status=active]:bg-gradient-to-r data-[status=active]:from-primary data-[status=active]:to-[#a85a14] data-[status=active]:font-semibold data-[status=active]:text-white data-[status=active]:shadow-md";

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white">{n > 99 ? "99+" : n}</span>;
}

function Row({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      params={item.params as never}
      search={item.search as never}
      activeOptions={{ exact: !!item.exact, includeSearch: false }}
      className={row}
    >
      <item.Icon className="size-5 shrink-0" />
      <span className="truncate">{item.label}</span>
      <Badge n={item.badge} />
    </Link>
  );
}

/**
 * Menu samping beranda (layar lebar): kartu biru tua dengan logo, menu utama (Beranda, Cari, Repositori, Pesan, Notifikasi, Profil)
 * dan tombol Keluar. Tautan lain (Lowongan, Jasa, Katalog, Forum, Tersimpan) ada di grup kedua supaya tidak ada fitur yang hilang.
 * Di layar kecil, menu bawah dan menu hamburger header yang dipakai.
 */
export function LeftRail() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  // Kunci kuerinya sama dengan halaman Diskusi, header, dan ChatDock, jadi cache dipakai bersama.
  const dm = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user && on("discuss"),
    refetchInterval: 60_000,
  });
  const notif = useQuery({
    queryKey: ["feed-unread", user?.id ?? null],
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user && on("discuss"),
    refetchInterval: 60_000,
  });

  const main: NavItem[] = [
    { to: "/", label: "Beranda", Icon: Home, exact: true },
    { to: "/search", search: { q: "", type: "users" }, label: "Cari", Icon: Search },
    { to: "/explore", label: "Repositori", Icon: BookMarked },
    ...(signedIn && on("discuss")
      ? [
          { to: "/discuss/pesan", search: {}, label: "Pesan", Icon: Mail, badge: dm.data ?? 0 },
          { to: "/discuss/notifikasi", label: "Notifikasi", Icon: Bell, badge: notif.data ?? 0 },
        ]
      : []),
    ...(signedIn && profile ? [{ to: "/$username", params: { username: profile.username }, label: "Profil", Icon: User }] : []),
  ];

  const more: NavItem[] = [
    ...(on("jobs") ? [{ to: "/lowongan", label: "Lowongan", Icon: Briefcase }] : []),
    ...(on("jasa") ? [{ to: "/jasa", label: "Jasa", Icon: Wrench }] : []),
    ...(on("karya") ? [{ to: "/katalog", label: "Katalog", Icon: Package }] : []),
    ...(on("discuss") ? [{ to: "/discuss", search: { tab: "forum" }, label: "Forum", Icon: MessageSquare, exact: true }] : []),
    ...(signedIn && on("discuss") ? [{ to: "/discuss/tersimpan", label: "Tersimpan", Icon: Bookmark }] : []),
  ];

  return (
    <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-3xl bg-gradient-to-b from-navy to-navy-deep p-3 text-white shadow-lg ring-1 ring-white/10 lg:block">
      <Link to="/" aria-label="GoBi" className="mb-3 flex items-center justify-center border-b border-white/10 pb-3 pt-1">
        <BrandMark size={44} />
      </Link>
      <nav aria-label="Menu beranda" className="flex flex-col gap-1">
        {main.map((item) => <Row key={item.label} item={item} />)}
      </nav>
      {more.length > 0 && (
        <nav aria-label="Menu lainnya" className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3">
          {more.map((item) => <Row key={item.label} item={item} />)}
        </nav>
      )}
      <div className={cn("mt-3 border-t border-white/10 pt-3")}>
        {signedIn ? (
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-5 shrink-0" /> Keluar
          </button>
        ) : (
          <Link to="/auth" className={row}><LogIn className="size-5 shrink-0" /> Masuk</Link>
        )}
      </div>
    </aside>
  );
}
