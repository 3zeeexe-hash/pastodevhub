import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bookmark, BookMarked, Briefcase, Home, Mail, MessageSquare, Package, Search, User, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { fetchUnreadCount } from "@/lib/feed";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { navForRole } from "@/components/nav-data";
import { canSeeNavItem, type NavGroup, type NavItem } from "@/components/nav-list";
import { MenuPanel } from "@/components/menu-panel";
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
 * Daftar menu utama, satu sumber untuk laci di ponsel (`MainMenuDrawer`) dan sidebar di layar lebar (`AppRail`). Urutan grup:
 *  1. "Menu utama": Beranda, Cari, Repositori, Pesan, Notifikasi, Profil.
 *  2. Menu halaman (`pageNav`, mis. GOBI WORK) lalu menu dashboard sesuai peran aktif, hanya setelah login.
 *  3. "Jelajah": tautan publik (Lowongan, Jasa, Katalog, Forum, Tersimpan) yang belum ada di grup di atas.
 * Satu tujuan (`to`) hanya muncul sekali; yang lebih atas menang. Menu yang fiturnya dimatikan admin disembunyikan.
 * Menu juga disaring menurut peran aktif: menu yang butuh kemampuan yang tidak dimiliki peran itu (mis. Repositori untuk Client,
 * Buat Lowongan untuk Developer, Lamaran Saya untuk Client) tidak ditampilkan. Aturannya ada di `canSeeNavItem` dan ROLE_CAPS.
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
      { to: "/explore", label: "Repositori", Icon: BookMarked, caps: ["repos"] },
      ...(signedIn && on("discuss")
        ? [
            { to: "/discuss/pesan", search: {}, label: "Pesan", Icon: Mail, Badge: DmBadge },
            { to: "/discuss/notifikasi", label: "Notifikasi", Icon: Bell, Badge: NotifBadge },
          ]
        : []),
      ...(signedIn && username ? [{ to: "/$username", params: { username }, match: `/${username}`, label: "Profil", Icon: User }] : []),
    ];

    const more: NavItem[] = [
      ...(on("jobs") ? [{ to: "/lowongan", label: "Lowongan", Icon: Briefcase, caps: ["lamaran", "post_job"] as const }] : []),
      ...(on("jasa") ? [{ to: "/jasa", label: "Jasa", Icon: Wrench }] : []),
      ...(on("karya") ? [{ to: "/katalog", label: "Katalog", Icon: Package }] : []),
      ...(on("discuss") ? [{ to: "/discuss", search: { tab: "forum" }, label: "Forum", Icon: MessageSquare, exact: true }] : []),
      ...(signedIn && on("discuss") ? [{ to: "/discuss/tersimpan", label: "Tersimpan", Icon: Bookmark }] : []),
    ];

    const seen = new Set<string>();
    const take = (items: NavItem[]) => items.filter((i) => {
      if ((i.feature && !on(i.feature)) || !canSeeNavItem(role, i) || seen.has(i.to)) return false;
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
 * Sidebar utama layar lebar (kartu biru tua dengan logo dan `MenuPanel`), dipakai di linimasa dan di semua halaman dashboard.
 * Isinya sama persis dengan laci menu di ponsel (`MainMenuDrawer`): satu daftar menu sesuai peran, satu kolom "Cari menu…", dan tombol Keluar.
 * `nav`: menu khusus halaman yang diletakkan sebelum menu peran. `title`: nama ruang kerja di samping logo.
 * `breakpoint`: lebar layar mulai tampil; di bawahnya, menu lewat laci menu di header.
 */
export function AppRail({ nav, title, breakpoint = "lg" }: { nav?: NavGroup[]; title?: string; breakpoint?: "md" | "lg" }) {
  const groups = useRailGroups(nav);

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
      <MenuPanel groups={groups} navy />
    </aside>
  );
}
