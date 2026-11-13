import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Search, BookMarked, LogOut, Settings, User, Download, MessageSquare, Star, LayoutDashboard, Receipt, ShieldCheck, Store,
  Menu, Briefcase, LayoutGrid, Users, Package, Bell, Wrench, BadgeCheck, ChevronDown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ROLE_INFO, roleCan, workspacePath, type Role } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { isFeatureOn } from "@/lib/features";
import { fetchUnreadCount } from "@/lib/feed";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { BrandMark } from "@/components/brand";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Jasa sebelumnya tidak ada di menu header sama sekali (hanya di menu kiri beranda layar lebar), jadi di mobile tidak terjangkau.
const NAV = [
  { to: "/explore", label: "Proyek", Icon: BookMarked, feature: null },
  { to: "/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
  { to: "/katalog", label: "Katalog", Icon: LayoutGrid, feature: "karya" },
  { to: "/lowongan", label: "Lowongan", Icon: Briefcase, feature: "jobs" },
  { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
] as const;

const WORKSPACE_SHORT: Record<Role, string> = { developer: "Studio", freelancer: "Freelance", client: "Dashboard", personal: "Ruang saya" };

// Tombol ikon di kartu header: biru tua di latar putih (terang), putih di latar biru tua (halaman repositori bertema gelap).
const ctl = "text-navy/75 hover:bg-accent hover:text-navy dark:text-header-foreground/85 dark:hover:bg-white/10 dark:hover:text-white";

/**
 * Header global bergaya topbar GOBI: kartu putih membulat mengambang (biru tua di tema gelap) berisi logo, garis pemisah,
 * pencarian pil dengan petunjuk Ctrl + K, lonceng notifikasi, dan avatar dengan panah menu akun.
 * Tinggi total tetap 3,5rem supaya elemen lengket lain (top-14) tidak bergeser.
 * Lebar isinya sama dengan beranda (max-w-6xl, xl: max-w-7xl) supaya tepi kiri/kanan sejajar.
 */
export function SiteHeader() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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

  // Ctrl + K (Cmd + K di Mac) memfokuskan kolom pencarian.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const el = searchRef.current;
        if (!el || el.offsetParent === null) return;
        e.preventDefault();
        el.focus();
        el.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 px-3 py-1 sm:px-4">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 rounded-2xl bg-card px-2.5 text-foreground shadow-[0_8px_24px_-12px_rgb(10_26_69/0.35)] ring-1 ring-black/5 dark:bg-header dark:text-header-foreground dark:ring-white/10 sm:px-3 xl:max-w-7xl">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost" className={`${ctl} size-9 lg:hidden`} aria-label="Buka menu"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-card">
            <SheetHeader><SheetTitle className="flex items-center gap-2"><BrandMark size={28} /> Go<span className="text-primary">Bi</span></SheetTitle></SheetHeader>
            <form onSubmit={doSearch} className="relative mt-4">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari talenta…" className="pl-8" />
            </form>
            <nav className="mt-4 flex flex-col gap-1">
              <Link to="/search" search={{ q: "", type: "users" }} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent">
                <Users className="size-4 text-primary" />Talenta
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
          <span className="hidden text-lg font-bold tracking-tight sm:inline">Go<span className="text-primary">Bi</span></span>
        </Link>
        <span aria-hidden className="mx-1 hidden h-7 w-px bg-border dark:bg-white/20 md:block" />

        <form className="relative hidden min-w-0 flex-1 md:block md:max-w-xs xl:max-w-md" onSubmit={doSearch}>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-navy/60 dark:text-white/70" />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari di website…"
            aria-label="Kata kunci pencarian"
            className="h-9 rounded-full border-0 bg-muted pl-10 pr-20 text-sm text-foreground shadow-none placeholder:text-navy/50 dark:bg-white/10 dark:text-white dark:placeholder:text-white/60"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground lg:inline dark:bg-white/10 dark:text-white/70">Ctrl + K</kbd>
        </form>

        <nav className="ml-1 hidden items-center gap-0.5 text-sm font-semibold lg:flex">
          <Link to="/search" search={{ q: "", type: "users" }} className={`rounded-full px-3 py-1.5 transition ${ctl}`}>Talenta</Link>
          {nav.map((n) => (
            <Link key={n.to} to={n.to}
              className={`rounded-full px-3 py-1.5 transition ${ctl} data-[status=active]:bg-accent data-[status=active]:text-navy dark:data-[status=active]:bg-white/15 dark:data-[status=active]:text-white`}>{n.label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link to="/search" search={{ q: "", type: "users" }} aria-label="Cari" className={`rounded-full p-2 md:hidden ${ctl}`}><Search className="size-5" /></Link>
          {user && profile ? (
            <>
              {on("discuss") && (
                <Link to="/discuss/notifikasi" aria-label="Notifikasi" className={`relative rounded-full p-2 ${ctl}`}>
                  <Bell className="size-5" />
                  {!!unread.data && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center font-mono text-[10px] leading-4 text-white ring-2 ring-card dark:ring-header">{unread.data > 99 ? "99+" : unread.data}</span>}
                </Link>
              )}
              <Button asChild size="sm" variant="ghost" className={`hidden rounded-full xl:inline-flex ${ctl}`}><Link to={dashTo}><LayoutDashboard /> {WORKSPACE_SHORT[role]}</Link></Button>
              {/* Tombol Buat baru di header hanya untuk layar lebar; di mobile ada tombol + di menu bawah. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="Buat baru" className="hidden rounded-full border-border bg-transparent text-navy hover:bg-accent dark:border-white/30 dark:text-header-foreground dark:hover:bg-white/10 dark:hover:text-white lg:inline-flex"><Plus /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {roleCan(role, "post_job") && on("jobs") && <DropdownMenuItem asChild><Link to="/lowongan/baru"><Briefcase /> Pasang lowongan</Link></DropdownMenuItem>}
                  {roleCan(role, "karya") && on("karya") && <DropdownMenuItem asChild><Link to="/studio/karya/$id" params={{ id: "baru" }}><Package /> Unggah karya</Link></DropdownMenuItem>}
                  {roleCan(role, "jasa") && on("jasa") && <DropdownMenuItem asChild><Link to="/studio/jasa"><Wrench /> Kelola jasa</Link></DropdownMenuItem>}
                  {roleCan(role, "repos") && on("repos") && <DropdownMenuItem asChild><Link to="/new"><BookMarked /> Repositori baru</Link></DropdownMenuItem>}
                  {roleCan(role, "github") && on("github") && <DropdownMenuItem asChild><Link to="/import"><Download /> Impor dari GitHub</Link></DropdownMenuItem>}
                  {on("discuss") && <DropdownMenuItem asChild><Link to="/discuss"><MessageSquare /> Diskusi baru</Link></DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Menu akun" className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="rounded-full ring-2 ring-border dark:ring-white/60"><AvatarMini name={profile.username} url={profile.avatar_url} size={32} /></span>
                  <ChevronDown className="size-4 text-primary" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="flex items-center gap-1 font-semibold"><span className="truncate">{profile.display_name || profile.username}</span><VerifiedBadge username={profile.username} verified={profile.is_verified} size={15} /></span>
                    <span className="block font-mono text-xs text-muted-foreground">@{profile.username} · {profile.account_type ? ROLE_INFO[role].title : "—"}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to={dashTo}><LayoutDashboard /> {workspaceLabel}</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }}><User /> Profil kamu</Link></DropdownMenuItem>
                  {roleCan(role, "repos") && <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }} search={{ tab: "repos" }}><BookMarked /> Repositori kamu</Link></DropdownMenuItem>}
                  {roleCan(role, "repos") && <DropdownMenuItem asChild><Link to="/$username" params={{ username: profile.username }} search={{ tab: "stars" }}><Star /> Bintang kamu</Link></DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  {roleCan(role, "lamaran") && on("jobs") && <DropdownMenuItem asChild><Link to="/studio/lamaran"><Briefcase /> Lamaran saya</Link></DropdownMenuItem>}
                  {roleCan(role, "toko") && on("toko") && <DropdownMenuItem asChild><Link to="/toko/$username" params={{ username: profile.username }}><Store /> Toko kamu</Link></DropdownMenuItem>}
                  <DropdownMenuItem asChild><Link to="/verifikasi"><BadgeCheck /> Verifikasi akun</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/pesanan"><Receipt /> Pesanan</Link></DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><ShieldCheck /> Admin</Link></DropdownMenuItem>}
                  <DropdownMenuItem asChild><Link to="/settings"><Settings /> Pengaturan</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}><LogOut /> Keluar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild size="sm" className="rounded-full"><Link to="/auth">Masuk</Link></Button>
          )}
        </div>
      </div>
    </header>
  );
}
