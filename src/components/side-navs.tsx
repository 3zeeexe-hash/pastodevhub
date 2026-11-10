import type { ReactNode } from "react";
import { Bot, Briefcase, Download, FileCode2, FolderKanban, Images, LayoutDashboard, LibraryBig, MessageSquare, Package, Plus, Receipt, Search, Settings, Share2, Store, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SideNavLayout, type NavGroup } from "@/components/side-nav-layout";

export const DEV_NAV: NavGroup[] = [
  { group: "Jualan", items: [
    { to: "/studio", label: "Ringkasan & saldo", Icon: LayoutDashboard, exact: true },
    { to: "/studio/karya", label: "Karya", Icon: Package },
    { to: "/studio/jasa", label: "Jasa", Icon: Wrench },
    { to: "/studio/portofolio", label: "Portofolio", Icon: FolderKanban },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  { group: "Freelance", items: [
    { to: "/lowongan", label: "Cari lowongan", Icon: Search },
    { to: "/studio/lamaran", label: "Lamaran saya", Icon: Briefcase },
  ] },
  { group: "Tools", items: [
    { to: "/studio/hosting", label: "Hosting HTML", Icon: FileCode2 },
    { to: "/studio/files", label: "Berbagi file", Icon: Share2 },
    { to: "/studio/images", label: "Cloud gambar", Icon: Images },
    { to: "/studio/toko", label: "Toko saya", Icon: Store },
    { to: "/studio/ai", label: "AI untuk repo", Icon: Bot },
  ] },
  { group: "Akun", items: [
    { to: "/settings", label: "Pengaturan", Icon: Settings },
  ] },
];

export const CLIENT_NAV: NavGroup[] = [
  { group: "Utama", items: [
    { to: "/dashboard", label: "Ringkasan", Icon: LayoutDashboard, exact: true },
    { to: "/pesanan", label: "Pesanan saya", Icon: Receipt },
  ] },
  { group: "Proyek", items: [
    { to: "/lowongan/baru", label: "Pasang lowongan", Icon: Plus },
    { to: "/lowongan", label: "Semua lowongan", Icon: Briefcase },
  ] },
  { group: "Cari", items: [
    { to: "/search", label: "Cari developer", Icon: Search, search: { q: "", type: "users" } },
    { to: "/jasa", label: "Pesan jasa", Icon: Wrench },
    { to: "/karya", label: "Beli karya", Icon: Download },
    { to: "/katalog", label: "Katalog", Icon: LibraryBig },
  ] },
  { group: "Komunitas", items: [
    { to: "/discuss", label: "Diskusi", Icon: MessageSquare },
    { to: "/settings", label: "Pengaturan", Icon: Settings },
  ] },
];

/** Side menu matching the signed-in account type (developer studio or client dashboard). */
export function AccountSideNav({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const dev = profile?.account_type === "developer";
  return <SideNavLayout title={dev ? "Studio developer" : "Dashboard client"} nav={dev ? DEV_NAV : CLIENT_NAV}>{children}</SideNavLayout>;
}
