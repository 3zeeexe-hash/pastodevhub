import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Bookmark, Briefcase, Compass, Home, Mail, MessageSquare, Package, Users, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { cn } from "@/lib/utils";

type NavItem = { to: string; search?: Record<string, unknown>; label: string; Icon: LucideIcon; badge?: number; exact?: boolean };

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return <span className={cn("min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground", className)}>{n > 99 ? "99+" : n}</span>;
}

/**
 * Menu kiri beranda (layar lebar). Di beranda, menu tautan di header disembunyikan dan diganti menu ini,
 * jadi isinya sengaja tidak mengulang tombol header yang tetap tampil: notifikasi, ruang kerja, profil, dan tombol buat baru.
 * Di layar kecil, semua tautan ini ada di menu hamburger header.
 */
export function LeftRail() {
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  // Kunci kuerinya sama dengan halaman Diskusi, jadi cache dipakai bersama.
  const dm = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user && on("discuss"),
    refetchInterval: 60_000,
  });

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
          { to: "/discuss/pesan", search: {}, label: "Pesan", Icon: Mail, badge: dm.data ?? 0 },
          { to: "/discuss/tersimpan", label: "Tersimpan", Icon: Bookmark },
        ]
      : []),
  ];

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto py-4 lg:block">
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
    </aside>
  );
}
