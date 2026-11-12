import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { BookMarked, Briefcase, Compass, Download, Home, LogIn, MessageSquare, Package, Pencil, Plus, Receipt, Search, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { AvatarMini } from "@/components/avatar-mini";
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

const tab = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] text-muted-foreground transition-colors active:bg-accent/50";
const tabOn = { className: "text-foreground" };
const sheetItem = "flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-accent";

/** Menu bawah ala Instagram / X untuk layar di bawah lg. Di layar lebar, menu kiri beranda dan header yang dipakai. */
export function MobileBottomNav() {
  const visible = useMobileNavVisible();
  const { user, profile } = useAuth();
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const [createOpen, setCreateOpen] = useState(false);
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  if (!visible) return null;

  const signedIn = !!user && !!profile;
  const isDev = profile?.account_type === "developer";
  const close = () => setCreateOpen(false);

  return (
    <>
      <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-header/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-xl items-stretch">
          <Link to="/" activeOptions={{ exact: true, includeSearch: false }} className={tab} activeProps={tabOn}>
            {({ isActive }) => (<><Home className="size-6" strokeWidth={isActive ? 2.6 : 1.8} /><span className={cn(isActive && "font-semibold")}>Beranda</span></>)}
          </Link>

          {on("jasa") ? (
            <Link to="/jasa" className={tab} activeProps={tabOn}>
              {({ isActive }) => (<><Wrench className="size-6" strokeWidth={isActive ? 2.6 : 1.8} /><span className={cn(isActive && "font-semibold")}>Jasa</span></>)}
            </Link>
          ) : (
            <Link to="/explore" className={tab} activeProps={tabOn}>
              {({ isActive }) => (<><Compass className="size-6" strokeWidth={isActive ? 2.6 : 1.8} /><span className={cn(isActive && "font-semibold")}>Jelajahi</span></>)}
            </Link>
          )}

          {signedIn ? (
            <>
              <button type="button" aria-label="Buat baru" onClick={() => setCreateOpen(true)} className="flex flex-1 items-center justify-center">
                <span className="flex h-9 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Plus className="size-5" /></span>
              </button>
              <Link to="/pesanan" className={tab} activeProps={tabOn}>
                {({ isActive }) => (<><Receipt className="size-6" strokeWidth={isActive ? 2.6 : 1.8} /><span className={cn(isActive && "font-semibold")}>Pesanan</span></>)}
              </Link>
              <Link to="/$username" params={{ username: profile.username }} className={tab} activeProps={tabOn}>
                {({ isActive }) => (
                  <>
                    <span className={cn("rounded-full p-0.5", isActive ? "ring-2 ring-foreground" : "ring-1 ring-transparent")}><AvatarMini name={profile.username} url={profile.avatar_url} size={24} /></span>
                    <span className={cn(isActive && "font-semibold")}>Profil</span>
                  </>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link to="/search" search={{ q: "", type: "users" }} className={tab} activeProps={tabOn}>
                {({ isActive }) => (<><Search className="size-6" strokeWidth={isActive ? 2.6 : 1.8} /><span className={cn(isActive && "font-semibold")}>Cari</span></>)}
              </Link>
              <Link to="/auth" className={tab} activeProps={tabOn}>
                {() => (<><LogIn className="size-6" strokeWidth={1.8} /><span>Masuk</span></>)}
              </Link>
            </>
          )}
        </div>
      </nav>

      {signedIn && (
        <Sheet open={createOpen} onOpenChange={setCreateOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl bg-header pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader><SheetTitle>Buat baru</SheetTitle></SheetHeader>
            <div className="mt-3 flex flex-col">
              {on("discuss") && <Link to="/" search={{}} hash="tulis" onClick={close} className={sheetItem}><MessageSquare className="size-5 text-primary" /> Tulis post</Link>}
              {!isDev && on("jobs") && <Link to="/lowongan/baru" onClick={close} className={sheetItem}><Briefcase className="size-5 text-primary" /> Pasang lowongan</Link>}
              {isDev && on("jasa") && <Link to="/studio/jasa" onClick={close} className={sheetItem}><Pencil className="size-5 text-primary" /> Kelola jasa</Link>}
              {isDev && role !== "personal" && on("karya") && <Link to="/studio/karya/$id" params={{ id: "baru" }} onClick={close} className={sheetItem}><Package className="size-5 text-primary" /> Unggah karya</Link>}
              {on("repos") && <Link to="/new" onClick={close} className={sheetItem}><BookMarked className="size-5 text-primary" /> Repositori baru</Link>}
              {on("github") && <Link to="/import" onClick={close} className={sheetItem}><Download className="size-5 text-primary" /> Impor dari GitHub</Link>}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
