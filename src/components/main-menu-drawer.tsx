import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRailGroups } from "@/components/app-rail";
import { MenuPanel } from "@/components/menu-panel";
import { BrandMark } from "@/components/brand";

/**
 * Menu utama GOBI di ponsel dan tablet (laci dari kiri). Isinya `MenuPanel` yang sama persis dengan sidebar layar lebar (`AppRail`):
 * satu daftar menu (`useRailGroups`) yang sudah disaring menurut peran aktif, satu kolom "Cari menu…" yang hanya menyaring menu,
 * dan satu tombol Keluar/Masuk. Halaman studio, dashboard, dan GOBI WORK tidak punya laci sendiri.
 * `trigger`: tombol pembuka (dipasang di header).
 */
export function MainMenuDrawer({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const groups = useRailGroups();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs overflow-y-auto bg-card p-4">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> Go<span className="text-primary">Bi</span></SheetTitle>
        </SheetHeader>
        <MenuPanel groups={groups} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
