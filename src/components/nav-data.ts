import { BadgeCheck, Bot, Briefcase, ClipboardList, Download, FileCode2, FileSignature, FolderKanban, Images, LayoutDashboard, LibraryBig, MessageSquare, Package, Plus, PlusCircle, Receipt, Search, Settings, Share2, Store, UserCog, Wallet, Wrench, BookMarked } from "lucide-react";
import type { Role } from "@/lib/roles";
import type { NavGroup } from "@/components/nav-list";

/**
 * Data menu per peran. Dipisah dari komponen tampilan supaya sidebar gabungan (app-rail), menu utama (laci GOBI di header)
 * dan layout halaman (side-nav-layout) sama-sama bisa memakainya tanpa saling impor.
 * Menu studio/dashboard tiap peran tidak punya laci sendiri lagi: semuanya digabung ke menu utama lewat `useRailGroups`.
 */

/** Menu GOBI WORK (lowongan, lamaran, kontrak, pesan kerja, pembayaran, profil kerja), dipakai semua peran yang melihat fitur lowongan. */
export const WORK_NAV: NavGroup = {
  group: "GOBI WORK",
  items: [
    { to: "/kerja", label: "Ringkasan kerja", Icon: LayoutDashboard, exact: true, feature: "jobs" },
    { to: "/lowongan", label: "Explore Jobs", Icon: Search, exact: true, feature: "jobs" },
    { to: "/lowongan/baru", label: "Buat Lowongan", Icon: PlusCircle, feature: "jobs" },
    { to: "/kerja/lamaran", label: "Lamaran Saya", Icon: Briefcase, feature: "jobs" },
    { to: "/kerja/kontrak", label: "Proyek & Kontrak", Icon: FileSignature, feature: "jobs" },
    { to: "/kerja/pesan", label: "Pesan Kerja", Icon: MessageSquare, feature: "jobs" },
    { to: "/kerja/pembayaran", label: "Pembayaran", Icon: Wallet, feature: "jobs" },
    { to: "/kerja/profil", label: "Profil Kerja", Icon: UserCog, feature: "jobs" },
  ],
};

export const DEV_NAV: NavGroup[] = [
  { group: "Jualan", items: [
    { to: "/studio", label: "Ringkasan & saldo", Icon: LayoutDashboard, exact: true },
    { to: "/studio/karya", label: "Karya", Icon: Package, feature: "karya" },
    { to: "/studio/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
    { to: "/studio/portofolio", label: "Portofolio", Icon: FolderKanban, feature: "jasa" },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
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
    { to: "/lowongan/saya", label: "Lowongan saya", Icon: ClipboardList, feature: "jobs" },
    { to: "/lowongan/baru", label: "Pasang lowongan", Icon: Plus, feature: "jobs" },
    { to: "/lowongan", label: "Semua lowongan", Icon: Briefcase, exact: true, feature: "jobs" },
  ] },
  { group: "Cari", items: [
    { to: "/search", label: "Cari developer", Icon: Search, search: { q: "", type: "users" } },
    { to: "/jasa", label: "Pesan jasa", Icon: Wrench, feature: "jasa" },
    { to: "/karya", label: "Beli karya", Icon: Download, feature: "karya" },
    { to: "/katalog", label: "Katalog", Icon: LibraryBig, feature: "karya" },
  ] },
  { group: "Komunitas", items: [
    { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
  ] },
  { group: "Akun", items: [
    { to: "/verifikasi", label: "Verifikasi (centang biru)", Icon: BadgeCheck },
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
  { group: "Tools", items: devGroup("Tools").items.filter((i) => i.to !== "/studio/toko") },
  { group: "Jelajah", items: [
    { to: "/katalog", label: "Katalog karya", Icon: LibraryBig, feature: "karya" },
    { to: "/discuss", label: "Diskusi", Icon: MessageSquare, feature: "discuss" },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  devGroup("Akun"),
];

/** Freelancer: cari proyek, jasa dan portofolio, tanpa repositori, karya, toko, atau AI repo. */
const FREELANCER_NAV: NavGroup[] = [
  { group: "Ruang freelance", items: [
    { to: "/studio", label: "Ringkasan & saldo", Icon: LayoutDashboard, exact: true },
  ] },
  WORK_NAV,
  { group: "Jasa", items: [
    { to: "/studio/jasa", label: "Jasa", Icon: Wrench, feature: "jasa" },
    { to: "/studio/portofolio", label: "Portofolio", Icon: FolderKanban, feature: "jasa" },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  { group: "Tools", items: devGroup("Tools").items.filter((i) => i.feature === "hosting") },
  devGroup("Akun"),
];

/** Menu per peran: urutan dan isi grup mengikuti kebutuhan tiap peran. GOBI WORK ikut ke developer, freelancer, dan client. */
export function navForRole(role: Role): NavGroup[] {
  switch (role) {
    case "client": return [CLIENT_NAV[0], CLIENT_NAV[1], WORK_NAV, ...CLIENT_NAV.slice(2)];
    case "freelancer": return FREELANCER_NAV;
    case "personal": return PERSONAL_NAV;
    default: return [DEV_NAV[0], WORK_NAV, ...DEV_NAV.slice(1)];
  }
}
