import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRailGroups } from "@/components/app-rail";
import { NavList, filterNavGroups } from "@/components/nav-list";
import { BrandMark } from "@/components/brand";

/**
 * Menu utama GOBI (laci dari kiri di ponsel dan tablet). Satu-satunya laci menu di aplikasi:
 * isinya gabungan menu utama, menu dashboard sesuai peran (Developer, Freelancer, Client, Pribadi), GOBI WORK, dan Jelajah,
 * sama dengan sidebar layar lebar (`useRailGroups`), dan hanya menu yang boleh diakses peran aktif.
 * Kolom pencarian di atas hanya menyaring menu di laci ini (tidak mencari ke halaman lain); pencarian situs ada di header.
 * `trigger`: tombol pembuka (dipasang di header).
 */
export function MainMenuDrawer({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = useRailGroups();
  const shown = filterNavGroups(groups, q);
  const signedIn = !!user && !!profile;
  const close = () => { setOpen(false); setQ(""); };
  const row = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto bg-card p-4">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> Go<span className="text-primary">Bi</span></SheetTitle>
        </SheetHeader>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari menu…"
            aria-label="Cari menu"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" aria-label="Hapus pencarian" onClick={() => setQ("")} className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-4">
          {shown.length > 0
            ? <NavList nav={shown} pathname={pathname} onNavigate={close} />
            : <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">Menu “{q.trim()}” tidak ditemukan.</p>}
        </div>
        <div className="mt-4 border-t border-border pt-3">
          {signedIn ? (
            <button
              type="button"
              onClick={async () => { close(); await supabase.auth.signOut(); navigate({ to: "/" }); }}
              className={row}
            >
              <LogOut className="size-4 shrink-0" /> Keluar
            </button>
          ) : (
            <Link to="/auth" onClick={close} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground">
              <LogIn className="size-4" /> Masuk / Daftar
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
