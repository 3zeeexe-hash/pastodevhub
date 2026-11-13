import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { BookMarked, Briefcase, Compass, Download, Home, LogIn, MessageSquare, Package, Pencil, Plus, Receipt, Search, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { roleCan } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Halaman tanpa menu bawah: area admin, masuk/reset sandi, dan layar chat penuh yang punya kolom ketik di bawah. */
export function useMobileNavVisible() {
  const { pathname } = useLocation();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname === "/auth" || pathname === "/reset-password") return false;
  if (/^\/discuss\/pesan\/[^/]+/.test(pathname)) return false;
  return true;
}

// Menu bawah mengambang (pil): putih dengan ikon abu-abu, aktif biru tua + garis oranye. Di halaman bertema gelap (repositori) jadi biru tua.
// Status aktif dibaca dari data-status milik Link; varian dark: lebih spesifik daripada varian aktif terang.
const tab = "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1.5 text-[11px] font-medium text-grey-500 transition active:scale-95 data-[status=active]:text-navy dark:text-header-foreground/75 dark:data-[status=active]:text-white";
const sheetItem = "flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent";

function TabInner({ active, Icon, label, fill, badge }: { active: boolean; Icon: LucideIcon; label: string; fill?: boolean; badge?: number }) {
  return (
    <>
      <span className="relative">
        <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} fill={fill && active ? "currentColor" : "none"} />
        {!!badge && (
          <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-card dark:ring-header">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className={cn(active && "font-semibold")}>{label}</span>
      <span aria-hidden className={cn("absolute bottom-0.5 h-[3px] w-9 rounded-full bg-primary transition-opacity", active ? "opacity-100" : "opacity-0")} />
    </>
  );
}

/** Menu bawah mengambang untuk layar di bawah lg: Beranda, Cari, tombol + oranye, Pesan, Profil. Di layar lebar, menu samping dan header yang dipakai. */
export function MobileBottomNav() {
  const visible = useMobileNavVisible();
  const { user, profile } = useAuth();
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const [createOpen, setCreateOpen] = useState(false);
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const signedIn = !!user && !!profile;
  // Kunci kuerinya sama dengan menu kiri beranda dan ChatDock, jadi cache dipakai bersama.
  const dm = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: signedIn && on("discuss"),
    refetchInterval: 60_000,
  });
  if (!visible) return null;

  const close = () => setCreateOpen(false);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <nav
          aria-label="Navigasi utama"
          className="pointer-events-auto mx-auto flex h-14 max-w-xl items-stretch rounded-2xl bg-card text-foreground shadow-[0_10px_30px_-10px_rgb(10_26_69/0.45)] ring-1 ring-black/5 dark:bg-header dark:text-header-foreground dark:ring-white/10"
        >
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }} className={tab}>
            {({ isActive }) => <TabInner active={isActive} Icon={Home} label="Beranda" fill />}
          </Link>

          <Link to="/search" search={{ q: "", type: "users" }} className={tab}>
            {({ isActive }) => <TabInner active={isActive} Icon={Search} label="Cari" />}
          </Link>

          {signedIn ? (
            <>
              <button type="button" aria-label="Buat baru" onClick={() => setCreateOpen(true)} className="flex flex-1 items-center justify-center">
                <span className="-mt-8 flex size-14 items-center justify-center rounded-full bg-sun text-navy shadow-glow ring-4 ring-card transition active:scale-95 dark:ring-header">
                  <Plus className="size-7" strokeWidth={3} />
                </span>
              </button>
              {on("discuss") ? (
                <Link to="/discuss/pesan" search={{}} className={tab}>
                  {({ isActive }) => <TabInner active={isActive} Icon={MessageSquare} label="Pesan" fill badge={dm.data ?? 0} />}
                </Link>
              ) : (
                <Link to="/pesanan" className={tab}>
                  {({ isActive }) => <TabInner active={isActive} Icon={Receipt} label="Pesanan" />}
                </Link>
              )}
              <Link to="/$username" params={{ username: profile.username }} className={tab}>
                {({ isActive }) => <TabInner active={isActive} Icon={User} label="Profil" fill />}
              </Link>
            </>
          ) : (
            <>
              <Link to="/explore" className={tab}>
                {({ isActive }) => <TabInner active={isActive} Icon={Compass} label="Jelajahi" />}
              </Link>
              <Link to="/auth" className={tab}>
                {() => <TabInner active={false} Icon={LogIn} label="Masuk" />}
              </Link>
            </>
          )}
        </nav>
      </div>

      {signedIn && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl bg-card pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader><SheetTitle>Buat baru</SheetTitle></SheetHeader>
            <div className="mt-3 flex flex-col">
              {on("discuss") && <Link to="/discuss" search={{}} hash="tulis" onClick={close} className={sheetItem}><MessageSquare className="size-5 text-primary" /> Tulis post</Link>}
              {roleCan(role, "post_job") && on("jobs") && <Link to="/lowongan/baru" onClick={close} className={sheetItem}><Briefcase className="size-5 text-primary" /> Pasang lowongan</Link>}
              {roleCan(role, "jasa") && on("jasa") && <Link to="/studio/jasa" onClick={close} className={sheetItem}><Pencil className="size-5 text-primary" /> Kelola jasa</Link>}
              {roleCan(role, "karya") && on("karya") && <Link to="/studio/karya/$id" params={{ id: "baru" }} onClick={close} className={sheetItem}><Package className="size-5 text-primary" /> Unggah karya</Link>}
              {roleCan(role, "repos") && on("repos") && <Link to="/new" onClick={close} className={sheetItem}><BookMarked className="size-5 text-primary" /> Repositori baru</Link>}
              {roleCan(role, "github") && on("github") && <Link to="/import" onClick={close} className={sheetItem}><Download className="size-5 text-primary" /> Impor dari GitHub</Link>}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
