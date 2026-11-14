import { useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { MenuPanel } from "@/components/menu-panel";
import { AdminDialogProvider } from "@/components/admin-dialog";
import { ADMIN_NAV, adminMeta } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Kerangka halaman /admin: sidebar admin sendiri (kartu biru tua, sama gayanya dengan sidebar linimasa) di layar md ke atas,
 * dan tombol "Menu admin" yang membuka laci kiri di ponsel. Isi menunya sama persis (`ADMIN_NAV`) dan bisa dicari.
 * Kepala halaman (judul + keterangan) diambil dari menu yang aktif, jadi halaman anak tidak perlu membuat judul besar sendiri.
 * Gaya tab di dalam halaman dibuat bisa digeser ke samping supaya tidak menumpuk berbaris-baris di layar sempit.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const meta = adminMeta(pathname);
  const Icon = meta?.Icon ?? ShieldCheck;

  return (
    <AdminDialogProvider>
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 md:grid md:grid-cols-[250px_minmax(0,1fr)] md:gap-8 md:py-6 xl:max-w-7xl">
      <aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-3xl bg-gradient-to-b from-navy to-navy-deep p-3 text-white shadow-lg ring-1 ring-white/10 md:block">
        <Link to="/admin" aria-label="Admin" className="mb-3 flex items-center gap-2 border-b border-white/10 px-2.5 pb-3 pt-1">
          <BrandMark size={32} />
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">Admin</span>
            <span className="block truncate text-xs text-white/60">Panel pengelola</span>
          </span>
        </Link>
        <MenuPanel groups={ADMIN_NAV} navy />
      </aside>

      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-2 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm"><Menu /> Menu admin</Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85%] max-w-sm overflow-y-auto p-4">
              <SheetHeader className="mb-4 border-b border-border pb-3 pr-6 text-left">
                <SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> Admin</SheetTitle>
                <SheetDescription className="sr-only">Menu halaman admin</SheetDescription>
              </SheetHeader>
              <MenuPanel groups={ADMIN_NAV} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <p className="truncate text-sm text-muted-foreground">{meta?.title ?? "Dasbor admin"}</p>
        </div>

        <header className="mb-6 border-b border-border pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin{meta ? ` / ${meta.group}` : ""}</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><Icon className="size-6 shrink-0 text-primary" /> <span className="min-w-0 break-words">{meta?.title ?? "Dasbor admin"}</span></h1>
          {meta?.desc ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{meta.desc}</p> : null}
        </header>

        <div className="min-w-0 [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-nowrap [&_[role=tablist]]:justify-start [&_[role=tablist]]:overflow-x-auto [&_[role=tablist]>*]:shrink-0">
          {children}
        </div>
      </section>
    </div>
    </AdminDialogProvider>
  );
}
