import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRailGroups } from "@/components/app-rail";
import { NavList } from "@/components/nav-list";
import { BrandMark } from "@/components/brand";

/**
 * Menu utama GOBI (laci dari kiri di ponsel dan tablet). Satu-satunya laci menu di aplikasi:
 * isinya gabungan menu utama, menu dashboard sesuai peran (Developer, Freelancer, Client, Pribadi), GOBI WORK, dan Jelajah,
 * sama dengan sidebar layar lebar (`useRailGroups`). Halaman studio, dashboard, dan GOBI WORK tidak punya laci sendiri lagi.
 * `trigger`: tombol pembuka (dipasang di header). `top`: isi tambahan di atas daftar menu (mis. kolom pencarian), menerima fungsi `close`.
 */
export function MainMenuDrawer({ trigger, top }: { trigger: ReactNode; top?: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = useRailGroups();
  const signedIn = !!user && !!profile;
  const close = () => setOpen(false);
  const row = "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto bg-card p-4">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> Go<span className="text-primary">Bi</span></SheetTitle>
        </SheetHeader>
        {top && <div className="mt-4">{top(close)}</div>}
        <div className="mt-4">
          <NavList nav={groups} pathname={pathname} onNavigate={close} />
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
