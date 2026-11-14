import { useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AppRail, useRailGroups } from "@/components/app-rail";
import { NavList, isActive, type NavGroup, type NavItem } from "@/components/nav-list";

export type { NavItem, NavGroup };

/**
 * Page shell with a side menu: fixed column on desktop, slide-out drawer on phones.
 * Lebar sama dengan beranda (max-w-6xl, xl: max-w-7xl). Menu samping desktop memakai sidebar gabungan yang sama dengan linimasa (`AppRail`):
 * menu utama + menu dashboard sesuai peran. `nav` adalah menu khusus halaman ini dan diletakkan sebelum menu peran.
 */
export function SideNavLayout({ title, nav, children }: { title: string; nav: NavGroup[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const groups = useRailGroups(nav);
  const [open, setOpen] = useState(false);
  const current = groups.flatMap((g) => g.items).find((i) => isActive(pathname, i));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 md:grid md:grid-cols-[230px_minmax(0,1fr)] md:gap-8 md:py-6 xl:max-w-7xl">
      <div className="sticky top-14 z-30 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2 bg-card">
              <Menu className="shrink-0" />
              <span className="text-muted-foreground">{title}</span>
              {current && <><span className="text-muted-foreground">/</span><span className="truncate font-semibold">{current.label}</span></>}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[82vw] max-w-xs overflow-y-auto bg-card p-4">
            <SheetHeader className="mb-4 text-left"><SheetTitle>{title}</SheetTitle></SheetHeader>
            <NavList nav={groups} pathname={pathname} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <AppRail nav={nav} title={title} breakpoint="md" />
      <section className="min-w-0">{children}</section>
    </div>
  );
}
