import { useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { BrandMark } from "@/components/brand";

export type NavItem = { to: string; label: string; Icon: LucideIcon; exact?: boolean; search?: Record<string, string>; feature?: FeatureKey };
export type NavGroup = { group: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.to || pathname === `${item.to}/`;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** navy = kartu biru tua di layar lebar (aktif: gradasi oranye); tanpa navy = tampilan terang untuk laci di ponsel. */
function NavList({ nav, pathname, onNavigate, navy }: { nav: NavGroup[]; pathname: string; onNavigate?: () => void; navy?: boolean }) {
  return (
    <nav className="flex flex-col gap-4" aria-label="Menu">
      {nav.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          <p className={cn("px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider", navy ? "text-white/50" : "text-muted-foreground")}>{group}</p>
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link key={item.to + item.label} to={item.to} search={item.search as never} onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                  navy
                    ? active ? "bg-gradient-to-r from-primary to-[#a85a14] font-semibold text-white shadow-md" : "text-white/75 hover:bg-white/10 hover:text-white"
                    : active ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <item.Icon className={cn("size-4 shrink-0", active && !navy && "text-primary")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Page shell with a side menu: fixed column on desktop, slide-out drawer on phones.
 * Lebar sama dengan beranda (max-w-6xl, xl: max-w-7xl); menu samping desktop berupa kartu biru tua dengan logo, sama seperti menu samping beranda.
 */
export function SideNavLayout({ title, nav: allNav, children }: { title: string; nav: NavGroup[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const { flags } = useSiteConfig();
  const nav = allNav
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || isFeatureOn(flags, i.feature)) }))
    .filter((g) => g.items.length > 0);
  const [open, setOpen] = useState(false);
  const current = nav.flatMap((g) => g.items).find((i) => isActive(pathname, i));
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
            <NavList nav={nav} pathname={pathname} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
      <aside className="hidden rounded-3xl bg-gradient-to-b from-navy to-navy-deep p-3 text-white shadow-lg ring-1 ring-white/10 md:sticky md:top-20 md:block md:self-start">
        <div className="mb-3 flex items-center gap-2 border-b border-white/10 px-2.5 pb-3 pt-1">
          <BrandMark size={32} />
          <p className="truncate font-semibold">{title}</p>
        </div>
        <NavList nav={nav} pathname={pathname} navy />
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
