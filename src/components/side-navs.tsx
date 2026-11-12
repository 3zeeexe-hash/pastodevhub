import type { ReactNode } from "react";
import { BadgeCheck, BookMarked, Bot, Briefcase, Download, FileCode2, FolderKanban, Images, LayoutDashboard, LibraryBig, MessageSquare, Package, Plus, Receipt, Search, Settings, Share2, Store, Wrench } from "lucide-react";
import { useRole } from "@/lib/use-role";
import { ROLE_INFO, type Role } from "@/lib/roles";
import { SideNavLayout, type NavGroup } from "@/components/side-nav-layout";

export const DEV_NAV: NavGroup[] = [
  { group: "Jualan", items: [
    { to: "/studio", label: "Ringkasan & saldo", Icon: LayoutDashboard, exact: true },
    { to: "/studio/karya", label: "Karya", Icon: Package, feature: "karya" },
    { to: "/studio/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
    { to: "/studio/portofolio", label: "Portofolio", Icon: FolderKanban, feature: "jasa" },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  { group: "Freelance", items: [
    { to: "/lowongan", label: "Cari lowongan", Icon: Search, feature: "jobs" },
    { to: "/studio/lamaran", label: "Lamaran saya", Icon: Briefcase, feature: "jobs" },
  ] },
  { group: "Tools", items: [
    { to: "/studio/hosting", label: "Hosting HTML", Icon: FileCode2, feature: "hosting" },
    { to: "/studio/files", label: "Berbagi file", Icon: Share2, feature: "hosting" },
    { to: "/studio/images", label: "Cloud gambar", Icon: Images, feature: "hosting" },
    { to: "/studio/toko", label: "Toko saya", Icon: Store, feature: "toko" },
    { to: "/studio/ai", label: "AI untuk repo", Icon: Bot, feature: "ai_editor" },
  ] },
  { group: "Akun", items: [
    { to: "/studio/verifikasi", label: "Verifikasi (centang biru)", Icon: BadgeCheck },
    { to: "/settings", label: "Pengaturan", Icon: Settings },
  ] },
];

export const CLIENT_NAV: NavGroup[] = [
  { group: "Utama", items: [
    { to: "/dashboard", label: "Ringkasan", Icon: LayoutDashboard, exact: true },
    { to: "/pesanan", label: "Pesanan saya", Icon: Receipt },
  ] },
  { group: "Proyek", items: [
    { to: "/lowongan/baru", label: "Pasang lowongan", Icon: Plus, feature: "jobs" },
    { to: "/lowongan", label: "Semua lowongan", Icon: Briefcase, feature: "jobs" },
  ] },
  { group: "Cari", items: [
    { to: "/search", label: "Cari developer", Icon: Search, search: { q: "", type: "users" } },
    { to: "/jasa", label: "Pesan jasa", Icon: Wrench, feature: "jasa" },
    { to: "/karya", label: "Beli karya", Icon: Download, feature: "karya" },
    { to: "/katalog", label: "Katalog", Icon: LibraryBig, feature: "karya" },
  ] },
  { group: "Komunitas", items: [
    { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
    { to: "/settings", label: "Pengaturan", Icon: Settings },
  ] },
];

const devGroup = (name: string) => DEV_NAV.find((g) => g.group === name)!;

/** Ruang pribadi: alat sendiri tanpa menu jualan, supaya menu tetap ringkas. */
const PERSONAL_NAV: NavGroup[] = [
  { group: "Ruang pribadi", items: [
    { to: "/studio", label: "Ringkasan", Icon: LayoutDashboard, exact: true },
    { to: "/new", label: "Repositori baru", Icon: BookMarked, feature: "repos" },
    { to: "/import", label: "Impor dari GitHub", Icon: Download, feature: "github" },
  ] },
  devGroup("Tools"),
  { group: "Jelajah", items: [
    { to: "/katalog", label: "Katalog karya", Icon: LibraryBig, feature: "karya" },
    { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  devGroup("Akun"),
];

/** Menu samping sesuai peran: urutan dan isi grup mengikuti kebutuhan tiap peran. */
export function navForRole(role: Role): NavGroup[] {
  switch (role) {
    case "client": return CLIENT_NAV;
    case "freelancer": return [devGroup("Freelance"), devGroup("Jualan"), devGroup("Tools"), devGroup("Akun")];
    case "personal": return PERSONAL_NAV;
    default: return DEV_NAV;
  }
}

/** Side menu matching the active role (client dashboard, or the developer/freelancer/personal studio). */
export function AccountSideNav({ children }: { children: ReactNode }) {
  const { role } = useRole();
  return <SideNavLayout title={ROLE_INFO[role].workspaceLabel} nav={navForRole(role)}>{children}</SideNavLayout>;
}
