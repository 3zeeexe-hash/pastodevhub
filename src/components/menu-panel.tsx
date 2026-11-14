import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { NavList, filterNavGroups, type NavGroup } from "@/components/nav-list";
import { cn } from "@/lib/utils";

/**
 * Isi menu utama GOBI, satu komponen untuk semua ukuran layar: dipakai laci menu di ponsel/tablet (`MainMenuDrawer`, tampilan terang)
 * dan sidebar di layar lebar (`AppRail`, tampilan biru tua). Isinya sama persis:
 *  1. Kolom "Cari menu…" yang hanya menyaring menu di sini (tidak mencari ke halaman lain).
 *  2. Daftar menu (`groups`, sudah disaring menurut peran dan fitur oleh `useRailGroups`).
 *  3. Tombol Keluar (atau Masuk kalau belum login).
 * Status pencarian ikut hilang saat panel ditutup/dilepas, dan dikosongkan setelah memilih menu.
 */
export function MenuPanel({ groups, navy = false, onNavigate }: { groups: NavGroup[]; navy?: boolean; onNavigate?: () => void }) {
  const [q, setQ] = useState("");
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const shown = filterNavGroups(groups, q);
  const signedIn = !!user && !!profile;
  const done = () => { setQ(""); onNavigate?.(); };
  const row = cn(
    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
    navy ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

  return (
    <div className="flex flex-col">
      <div className="relative">
        <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2", navy ? "text-white/50" : "text-muted-foreground")} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari menu…"
          aria-label="Cari menu"
          autoComplete="off"
          className={cn(
            "h-10 w-full rounded-xl border pl-9 pr-9 text-sm outline-none focus-visible:ring-2 [&::-webkit-search-cancel-button]:hidden",
            navy
              ? "border-white/15 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/30"
              : "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring",
          )}
        />
        {q && (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() => setQ("")}
            className={cn("absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full", navy ? "text-white/60 hover:bg-white/10" : "text-muted-foreground hover:bg-accent")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4">
        {shown.length > 0
          ? <NavList nav={shown} pathname={pathname} onNavigate={done} navy={navy} />
          : <p className={cn("px-2.5 py-6 text-center text-sm", navy ? "text-white/60" : "text-muted-foreground")}>Menu “{q.trim()}” tidak ditemukan.</p>}
      </div>

      <div className={cn("mt-4 border-t pt-3", navy ? "border-white/10" : "border-border")}>
        {signedIn ? (
          <button
            type="button"
            onClick={async () => { done(); await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className={row}
          >
            <LogOut className="size-4 shrink-0" /> Keluar
          </button>
        ) : navy ? (
          <Link to="/auth" onClick={done} className={row}><LogIn className="size-4 shrink-0" /> Masuk</Link>
        ) : (
          <Link to="/auth" onClick={done} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground">
            <LogIn className="size-4" /> Masuk / Daftar
          </Link>
        )}
      </div>
    </div>
  );
}
