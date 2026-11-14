import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureKey } from "@/lib/features";
import { capabilityForPath, roleCan, type Capability, type Role } from "@/lib/roles";

/**
 * `Badge`: komponen kecil di ujung kanan baris menu (mis. lencana jumlah belum dibaca).
 * `params`: parameter rute dinamis (mis. `/$username`). `match`: jalur asli untuk menandai menu aktif kalau `to` berisi parameter.
 * `caps`: menu hanya tampil untuk peran yang punya salah satu kemampuan ini (lihat ROLE_CAPS di lib/roles). Tanpa `caps`, kemampuan
 * dibaca dari jalurnya (ROLE_PATHS, mis. /studio/karya butuh "karya"); kalau jalurnya juga tidak dibatasi, menu terbuka untuk semua peran.
 */
export type NavItem = {
  to: string;
  label: string;
  Icon: LucideIcon;
  exact?: boolean;
  search?: Record<string, string>;
  params?: Record<string, string>;
  match?: string;
  feature?: FeatureKey;
  caps?: readonly Capability[];
  Badge?: ComponentType;
};
export type NavGroup = { group: string; items: NavItem[] };

export function isActive(pathname: string, item: NavItem) {
  const base = item.match ?? item.to;
  if (item.exact) return pathname === base || pathname === `${base}/`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Apakah peran ini boleh melihat menu tersebut (hanya soal tampilan; hak akses sebenarnya tetap di database). */
export function canSeeNavItem(role: Role, item: NavItem): boolean {
  const caps = item.caps ?? (() => { const c = capabilityForPath(item.to); return c ? [c] : null; })();
  return !caps || caps.some((c) => roleCan(role, c));
}

/**
 * Menyaring menu berdasarkan kata kunci (nama menu atau nama grup, tidak peka huruf besar/kecil).
 * Hanya menyaring menu yang sudah ada; tidak mencari ke halaman lain.
 */
export function filterNavGroups(nav: NavGroup[], query: string): NavGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return nav;
  return nav
    .map((g) => (g.group.toLowerCase().includes(q) ? g : { ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}

/** navy = kartu biru tua di layar lebar (aktif: gradasi oranye); tanpa navy = tampilan terang untuk laci di ponsel. */
export function NavList({ nav, pathname, onNavigate, navy }: { nav: NavGroup[]; pathname: string; onNavigate?: () => void; navy?: boolean }) {
  return (
    <nav className="flex flex-col gap-4" aria-label="Menu">
      {nav.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          <p className={cn("px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider", navy ? "text-white/50" : "text-muted-foreground")}>{group}</p>
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.to + item.label} to={item.to} params={item.params as never} search={item.search as never} onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                  navy
                    ? active ? "bg-gradient-to-r from-primary to-[#a85a14] font-semibold text-white shadow-md" : "text-white/75 hover:bg-white/10 hover:text-white"
                    : active ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <item.Icon className={cn("size-4 shrink-0", active && !navy && "text-primary")} />
                <span className="truncate">{item.label}</span>
                {item.Badge && <item.Badge />}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
