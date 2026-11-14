import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Search, BookMarked, LogOut, Settings, User, Download, MessageSquare, Star, LayoutDashboard, Receipt, ShieldCheck, Store,
  Menu, Briefcase, LayoutGrid, Package, Bell, Wrench, BadgeCheck, ChevronDown,
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
import { MainMenuDrawer } from "@/components/main-menu-drawer";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Jasa sebelumnya tidak ada di menu header sama sekali (hanya di menu kiri beranda layar lebar), jadi di mobile tidak terjangkau.
const NAV = [
  { to: "/explore", label: "Proyek", Icon: BookMarked, feature: null },
  { to: "/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
  { to: "/katalog", label: "Katalog", Icon: LayoutGrid, feature: "karya" },
  { to: "/lowongan", label: "Lowongan", Icon: Briefcase, feature: "jobs" },
  { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
] as const;

const WORKSPACE_SHORT: Record<Role, string> = { developer: "Studio", freelancer: "Freelance", client: "Dashboard", personal: "Ruang saya" };

// Tombol ikon dan tautan di navbar biru tua: putih redup, sorotan putih transparan saat disentuh.
const ctl = "text-white/80 hover:bg-white/10 hover:text-white";

/**
 * Navbar atas GOBI: bar biru tua (gradasi) membulat dan mengambang, berisi logo, garis pemisah, pencarian pil dengan petunjuk Ctrl + K,
 * tautan menu, lonceng notifikasi, dan avatar dengan panah menu akun. Warnanya biru tua di semua halaman.
 * Tinggi total tetap 3,5rem supaya elemen lengket lain (top-14) tidak bergeser.
 * Lebar isinya sama dengan beranda (max-w-6xl, xl: max-w-7xl) supaya tepi kiri/kanan sejajar.
 * Tombol menu di kiri (di bawah lg) membuka laci menu utama (`MainMenuDrawer`) yang sudah berisi menu studio/dashboard sesuai peran dan GOBI WORK.
 */
export function SiteHeader() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
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
  const doSearch = (e: React.FormEvent) => { e.preventDefault(); navigate({ to: "/search", search: { q, type: "users" } }); };

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
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-2 rounded-2xl bg-gradient-to-r from-navy-deep via-navy to-navy-mid px-2.5 text-header-foreground shadow-[0_10px_28px_-12px_rgb(7_19_54/0.7)] ring-1 ring-white/10 sm:px-3 xl:max-w-7xl">
        <MainMenuDrawer
          trigger={<Button size="icon" variant="ghost" className={`${ctl} size-9 lg:hidden`} aria-label="Buka menu"><Menu /></Button>}
          top={(close) => (
            <form onSubmit={(e) => { close(); doSearch(e); }} className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari talenta…" className="pl-8" />
            </form>
          )}
        />

        <Link to="/" className="flex shrink-0 items-center gap-2">
          <BrandMark size={32} />
          <span className="hidden text-lg font-bold tracking-tight text-white sm:inline">Go<span className="text-primary">Bi</span></span>
        </Link>
        <span aria-hidden className="mx-1 hidden h-7 w-px bg-white/20 md:block" />

        <form className="relative hidden min-w-0 flex-1 md:block md:max-w-xs xl:max-w-md" onSubmit={doSearch}>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/70" />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari di website…"
            aria-label="Kata kunci pencarian"
            className="h-9 rounded-full border-0 bg-white/10 pl-10 pr-20 text-sm text-white shadow-none placeholder:text-white/60 focus-visible:bg-white/15"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white/70 lg:inline">Ctrl + K</kbd>
        </form>

        <nav className="ml-1 hidden items-center gap-0.5 text-sm font-semibold lg:flex">
          <Link to="/search" search={{ q: "", type: "users" }} className={`rounded-full px-3 py-1.5 transition ${ctl}`}>Talenta</Link>
          {nav.map((n) => (
            <Link key={n.to} to={n.to}
              className={`rounded-full px-3 py-1.5 transition ${ctl} data-[status=active]:bg-white/15 data-[status=active]:text-white`}>{n.label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link to="/search" search={{ q: "", type: "users" }} aria-label="Cari" className={`rounded-full p-2 md:hidden ${ctl}`}><Search className="size-5" /></Link>
          {user && profile ? (
            <>
              {on("discuss") && (
                <Link to="/discuss/notifikasi" aria-label="Notifikasi" className={`relative rounded-full p-2 ${ctl}`}>
                  <Bell className="size-5" />
                  {!!unread.data && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center font-mono text-[10px] leading-4 text-white ring-2 ring-navy">{unread.data > 99 ? "99+" : unread.data}</span>}
                </Link>
              )}
              <Button asChild size="sm" variant="ghost" className={`hidden rounded-full xl:inline-flex ${ctl}`}><Link to={dashTo}><LayoutDashboard /> {WORKSPACE_SHORT[role]}</Link></Button>
              {/* Tombol Buat baru di header hanya untuk layar lebar; di mobile ada tombol + di menu bawah. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="Buat baru" className="hidden rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white lg:inline-flex"><Plus /></Button>
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
                  <span className="rounded-full ring-2 ring-white/60"><AvatarMini name={profile.username} url={profile.avatar_url} size={32} /></span>
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
