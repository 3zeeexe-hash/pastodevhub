import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bookmark, BookMarked, Briefcase, Home, LogIn, LogOut, Mail, MessageSquare, Package, Search, User, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { fetchUnreadCount } from "@/lib/feed";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { navForRole } from "@/components/nav-data";
import { NavList, type NavGroup, type NavItem } from "@/components/nav-list";
import { BrandMark } from "@/components/brand";

function CountBadge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white">{n > 99 ? "99+" : n}</span>;
}

// Kunci kuerinya sama dengan halaman Diskusi, header, dan ChatDock, jadi cache dipakai bersama.
function DmBadge() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ["dm-unread", user?.id ?? null], queryFn: () => fetchDmUnread(user?.id), enabled: !!user, refetchInterval: 60_000 });
  return <CountBadge n={data ?? 0} />;
}

function NotifBadge() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ["feed-unread", user?.id ?? null], queryFn: () => fetchUnreadCount(user!.id), enabled: !!user, refetchInterval: 60_000 });
  return <CountBadge n={data ?? 0} />;
}

/**
 * Isi sidebar gabungan. Urutan grup:
 *  1. "Menu utama": Beranda, Cari, Repositori, Pesan, Notifikasi, Profil.
 *  2. Menu halaman (`pageNav`, mis. GOBI WORK) lalu menu dashboard sesuai peran aktif, hanya setelah login.
 *  3. "Jelajah": tautan publik (Lowongan, Jasa, Katalog, Forum, Tersimpan) yang belum ada di grup di atas.
 * Satu tujuan (`to`) hanya muncul sekali; yang lebih atas menang. Menu yang fiturnya dimatikan admin disembunyikan.
 */
export function useRailGroups(pageNav?: NavGroup[]): NavGroup[] {
  const { user, profile } = useAuth();
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const signedIn = !!user && !!profile;
  const username = profile?.username;

  return useMemo(() => {
    const on = (key: FeatureKey) => isFeatureOn(flags, key);

    const main: NavItem[] = [
      { to: "/", label: "Beranda", Icon: Home, exact: true },
      { to: "/search", search: { q: "", type: "users" }, label: "Cari", Icon: Search },
      { to: "/explore", label: "Repositori", Icon: BookMarked },
      ...(signedIn && on("discuss")
        ? [
            { to: "/discuss/pesan", search: {}, label: "Pesan", Icon: Mail, Badge: DmBadge },
            { to: "/discuss/notifikasi", label: "Notifikasi", Icon: Bell, Badge: NotifBadge },
          ]
        : []),
      ...(signedIn && username ? [{ to: "/$username", params: { username }, match: `/${username}`, label: "Profil", Icon: User }] : []),
    ];

    const more: NavItem[] = [
      ...(on("jobs") ? [{ to: "/lowongan", label: "Lowongan", Icon: Briefcase }] : []),
      ...(on("jasa") ? [{ to: "/jasa", label: "Jasa", Icon: Wrench }] : []),
      ...(on("karya") ? [{ to: "/katalog", label: "Katalog", Icon: Package }] : []),
      ...(on("discuss") ? [{ to: "/discuss", search: { tab: "forum" }, label: "Forum", Icon: MessageSquare, exact: true }] : []),
      ...(signedIn && on("discuss") ? [{ to: "/discuss/tersimpan", label: "Tersimpan", Icon: Bookmark }] : []),
    ];

    const seen = new Set<string>();
    const take = (items: NavItem[]) => items.filter((i) => {
      if ((i.feature && !on(i.feature)) || seen.has(i.to)) return false;
      seen.add(i.to);
      return true;
    });

    const roleGroups: NavGroup[] = [...(pageNav ?? []), ...(signedIn ? navForRole(role) : [])];
    const groups: NavGroup[] = [{ group: "Menu utama", items: take(main) }];
    for (const g of roleGroups) groups.push({ ...g, items: take(g.items) });
    groups.push({ group: "Jelajah", items: take(more) });
    return groups.filter((g) => g.items.length > 0);
  }, [flags, pageNav, role, signedIn, username]);
}

const SHOW_FROM = { md: "md:block", lg: "lg:block" } as const;

/**
 * Sidebar utama (kartu biru tua dengan logo, menu, dan tombol Keluar), dipakai di linimasa dan di semua halaman dashboard.
 * Setelah login, menu dashboard sesuai peran (Developer, Freelancer, Client, Pribadi) digabung ke sini, jadi hanya ada satu sidebar.
 * `nav`: menu khusus halaman yang diletakkan sebelum menu peran. `title`: nama ruang kerja di samping logo.
 * `breakpoint`: lebar layar mulai tampil; di bawahnya, menu lewat menu bawah atau laci.
 */
export function AppRail({ nav, title, breakpoint = "lg" }: { nav?: NavGroup[]; title?: string; breakpoint?: "md" | "lg" }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = useRailGroups(nav);
  const signedIn = !!user && !!profile;
  const row = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <aside className={`sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-3xl bg-gradient-to-b from-navy to-navy-deep p-3 text-white shadow-lg ring-1 ring-white/10 ${SHOW_FROM[breakpoint]}`}>
      {title ? (
        <Link to="/" aria-label="GoBi" className="mb-3 flex items-center gap-2 border-b border-white/10 px-2.5 pb-3 pt-1">
          <BrandMark size={32} />
          <p className="truncate font-semibold">{title}</p>
        </Link>
      ) : (
        <Link to="/" aria-label="GoBi" className="mb-3 flex items-center justify-center border-b border-white/10 pb-3 pt-1">
          <BrandMark size={44} />
        </Link>
      )}
      <NavList nav={groups} pathname={pathname} navy />
      <div className="mt-3 border-t border-white/10 pt-3">
        {signedIn ? (
          <button
            type="button"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className={row}
          >
            <LogOut className="size-4 shrink-0" /> Keluar
          </button>
        ) : (
          <Link to="/auth" className={row}><LogIn className="size-4 shrink-0" /> Masuk</Link>
        )}
      </div>
    </aside>
  );
}
