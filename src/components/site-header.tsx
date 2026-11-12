import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus, Search, BookMarked, LogOut, Settings, User, Download, MessageSquare, Star, LayoutDashboard, Receipt, ShieldCheck, Store,
  Menu, Briefcase, LayoutGrid, Users, Package, Bell,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ROLE_INFO, workspacePath, type Role } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { isFeatureOn } from "@/lib/features";
import { fetchUnreadCount } from "@/lib/feed";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { RoleSwitcher } from "@/components/role-ui";
import { BrandMark } from "@/components/brand";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/explore", label: "Proyek", Icon: BookMarked, feature: null },
  { to: "/katalog", label: "Katalog", Icon: LayoutGrid, feature: "karya" },
  { to: "/lowongan", label: "Lowongan", Icon: Briefcase, feature: "jobs" },
  { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
] as const;

const WORKSPACE_SHORT: Record<Role, string> = { developer: "Studio", freelancer: "Freelance", client: "Dashboard", personal: "Ruang saya" };

export function SiteHeader() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const isDev = profile?.account_type === "developer";
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const on = (key: Parameters<typeof isFeatureOn>[1]) => isFeatureOn(flags, key);
  const nav = NAV.filter((n) => !n.feature || on(n.feature));
  const unread = useQuery({
    queryKey: ["feed-unread", user?.id ?? null],
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user && on("discuss"),
    refetchInterval: 60_000,
  });
  const dashTo = workspacePath(profile?.account_type);
  const workspaceLabel = ROLE_INFO[role].workspaceLabel;
  const doSearch = (e: React.FormEvent) => { e.preventDefault(); setOpen(false); navigate({ to: "/search", search: { q, type: "users" } }); };
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-header/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Buka menu"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-header">
            <SheetHeader><SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> pasto<span className="-ml-2 text-primary">dev</span></SheetTitle></SheetHeader>
            <form onSubmit={doSearch} className="relative mt-4">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari developer…" className="pl-8" />
            </form>
            <nav className="mt-4 flex flex-col gap-1">
              <Link to="/search" search={{ q: "", type: "users" }} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent">
                <Users className="size-4 text-primary" />Developer
              </Link>
              {nav.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent" activeProps={{ className: "bg-accent font-semibold" }}>
                  <n.Icon className="size-4 text-primary" />{n.label}
                </Link>
              ))}
              {user && profile && (
                <Link to={dashTo} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-accent">
                  <LayoutDashboard className="size-4 text-primary" />{workspaceLabel}
                </Link>
              )}
              {!user && <Button asChild className="mt-3" onClick={() => setOpen(false)}><Link to="/auth">Masuk / Daftar</Link></Button>}
            </nav>
          </SheetContent>
        </Sheet>
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <BrandMark size={32} />
          <span className="hidden text-lg font-bold tracking-tight sm:inline">pasto<span className="text-primary">dev</span></span>
        </Link>
        <nav className="ml-3 hidden items-center gap-0.5 text-sm lg:flex">
          <Link to="/search" search={{ q: "", type: "users" }} className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">Developer</Link>
          {nav.map((n) => (
            <Link key={n.to} to={n.to}
              className="rounded-md px-2.5 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" activeProps={{ className: "text-foreground" }}>{n.label}</Link>
          ))}
        </nav>
        <form className="relative ml-auto hidden w-56 md:block xl:w-72" onSubmit={doSearch}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari developer, proyek…" className="h-8 bg-background pl-8 text-sm" />
        </form>
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <Link to="/search" search={{ q: "", type: "users" }} aria-label="Cari" className="rounded-md p-2 text-muted-foreground hover:bg-accent md:hidden"><Search className="size-4" /></Link>
          {user && profile ? (
            <>
              {on("discuss") && (
                <Link to="/discuss/notifikasi" aria-label="Notifikasi" className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Bell className="size-4" />
                  {!!unread.data && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">{unread.data > 99 ? "99+" : unread.data}</span>}
                </Link>
              )}
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to={dashTo}><LayoutDashboard /> {WORKSPACE_SHORT[role]}</Link></Button>
              {profile.account_type && <RoleSwitcher />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="Buat baru"><Plus /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {!isDev && on("jobs") && <DropdownMenuItem asChild><Link to="/lowongan/baru"><Briefcase /> Pasang lowongan</Link></DropdownMenuItem>}
                  {isDev && role !== "personal" && on("karya") && <DropdownMenuItem asChild><Link to="/studio/karya/$id" params={{ id: "baru" }}><Package /> Unggah karya</Link></DropdownMenuItem>}
                  {on("repos") && <DropdownMenuItem asChild><Link to="/new"><BookMarked /> Repositori baru</Link></DropdownMenuItem>}
                  {on("github") && <DropdownMenuItem asChild><Link to="/import"><Download /> Impor dari GitHub</Link></DropdownMenuItem>}
                  {on("discuss") && <DropdownMenuItem asChild><Link to="/discuss"><MessageSquare /> Diskusi baru</Link></DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Menu akun" className="rounded-full">
                  <AvatarMini name={profile.username} url={profile.avatar_url} size={30} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block font-semibold">{profile.display_name || profile.username}</span>
                    <span className="block font-mono text-xs text-muted-foreground">@{profile.username} · {profile.account_type ? ROLE_INFO[role].title : "—"}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to={dashTo}><LayoutDashboard /> {workspaceLabel}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }}><User /> Profil kamu</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }} search={{ tab: "repos" }}><BookMarked /> Repositori kamu</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }} search={{ tab: "stars" }}><Star /> Bintang kamu</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isDev && (
                    <>
                      {on("jobs") && <DropdownMenuItem asChild><Link to="/studio/lamaran"><Briefcase /> Lamaran saya</Link></DropdownMenuItem>}
                      {on("toko") && <DropdownMenuItem asChild><Link to="/toko/$username" params={{ username: profile.username }}><Store /> Toko kamu</Link></DropdownMenuItem>}
                    </>
                  )}
                  <DropdownMenuItem asChild><Link to="/pesanan"><Receipt /> Pesanan</Link></DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck /> Admin</Link></DropdownMenuItem>}
                  <DropdownMenuItem asChild><Link to="/settings"><Settings /> Pengaturan</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}><LogOut /> Keluar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth">Masuk</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
