import type { ReactNode } from "react";
import { AppRail } from "@/components/app-rail";
import type { NavGroup, NavItem } from "@/components/nav-list";

export type { NavItem, NavGroup };

/**
 * Page shell with a side menu: fixed column on desktop (md ke atas). Lebar sama dengan beranda (max-w-6xl, xl: max-w-7xl).
 * Menu samping desktop memakai sidebar gabungan yang sama dengan linimasa (`AppRail`): menu utama + menu dashboard sesuai peran.
 * `nav` adalah menu khusus halaman ini dan diletakkan sebelum menu peran.
 * Di ponsel tidak ada laci menu sendiri: semua menu studio, dashboard, dan GOBI WORK ada di laci menu utama GOBI (`MainMenuDrawer` di header).
 */
export function SideNavLayout({ title, nav, children }: { title: string; nav: NavGroup[]; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 md:grid md:grid-cols-[230px_minmax(0,1fr)] md:gap-8 md:py-6 xl:max-w-7xl">
      <AppRail nav={nav} title={title} breakpoint="md" />
      <section className="min-w-0">{children}</section>
    </div>
  );
}
