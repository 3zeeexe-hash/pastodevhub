import { useQuery } from "@tanstack/react-query";
import { Activity, BadgeCheck, Briefcase, CreditCard, Flag, Home, Landmark, LayoutDashboard, MessageSquareWarning, Plug, Settings, ToggleRight, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isActive, type NavItem } from "@/components/nav-list";
import { useAdminWorkActivity } from "@/lib/use-admin-work-activity";

/**
 * Menu sidebar admin (/admin), satu sumber untuk sidebar layar lebar dan laci menu di ponsel (`AdminShell`).
 * Hanya berisi halaman admin dan beberapa pintasan; sengaja tidak digabung dengan menu peran (developer/client).
 * `title` dan `desc` dipakai sebagai judul dan keterangan di kepala halaman.
 */
export type AdminNavItem = NavItem & { title: string; desc: string };
export type AdminNavGroup = { group: string; items: AdminNavItem[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(table: string, apply?: (q: any) => any): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count: n } = await q;
  return n ?? 0;
}

type AdminBadges = { verifikasi: number; pembayaran: number; escrow: number; kerja: number };

/** Jumlah pekerjaan yang menunggu admin, untuk lencana merah di sidebar. Kunci kuerinya dipakai bersama sehingga hanya satu permintaan. */
function useAdminBadges() {
  return useQuery({
    queryKey: ["admin-badges"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AdminBadges> => {
      const [verifikasi, review, payouts, refunds, reports, disputes, jobs, withdrawals] = await Promise.all([
        count("verification_requests", (q) => q.eq("status", "pending")),
        count("orders", (q) => q.eq("status", "payment_review")),
        count("payouts", (q) => q.eq("status", "requested")),
        count("payments", (q) => q.eq("needs_refund", true)),
        count("work_reports", (q) => q.in("status", ["open", "reviewing"])),
        count("work_disputes", (q) => q.in("status", ["open", "under_review"])),
        count("jobs", (q) => q.eq("moderation_status", "pending")),
        count("client_withdrawals", (q) => q.eq("status", "requested")),
      ]);
      return { verifikasi, pembayaran: review + payouts, escrow: refunds, kerja: reports + disputes + jobs + withdrawals };
    },
  });
}

function Count({ k }: { k: keyof AdminBadges }) {
  const { data } = useAdminBadges();
  const n = data?.[k] ?? 0;
  if (!n) return null;
  return <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white">{n > 99 ? "99+" : n}</span>;
}
const VerifBadge = () => <Count k="verifikasi" />;
const PayBadge = () => <Count k="pembayaran" />;
const EscrowBadge = () => <Count k="escrow" />;
/** Lencana GOBI WORK: angka merah = menunggu tindakan admin, pil biru "+n" = data baru sejak terakhir dilihat. */
function WorkBadge() {
  const { data } = useAdminWorkActivity();
  const todo = data?.totalPending ?? 0;
  const fresh = data?.totalFresh ?? 0;
  if (!todo && !fresh) return null;
  return (
    <span className="ml-auto flex items-center gap-1">
      {fresh > 0 && <span title={`${fresh} data baru sejak terakhir dilihat`} className="rounded-full bg-sky-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white">+{fresh > 99 ? "99" : fresh}</span>}
      {todo > 0 && <span title={`${todo} menunggu tindakan`} className="min-w-5 rounded-full bg-red-500 px-1.5 text-center font-mono text-[11px] leading-5 text-white">{todo > 99 ? "99+" : todo}</span>}
    </span>
  );
}

export const ADMIN_NAV: AdminNavGroup[] = [
  { group: "Utama", items: [
    { to: "/admin", label: "Ringkasan", title: "Ringkasan", desc: "Hal yang perlu ditindaklanjuti dan angka utama platform.", Icon: LayoutDashboard, exact: true },
    { to: "/admin/pengguna", label: "Pengguna", title: "Pengguna", desc: "Cari akun, beri centang biru, ubah jenis akun, blokir, atau jadikan admin.", Icon: Users },
    { to: "/admin/verifikasi", label: "Verifikasi developer", title: "Verifikasi developer", desc: "Tinjau pengajuan centang biru dari developer.", Icon: BadgeCheck, Badge: VerifBadge },
    { to: "/admin/pantau", label: "Pantau aktivitas", title: "Pantau aktivitas", desc: "Pesanan, chat, lowongan, pembayaran, dan log admin, diperbarui otomatis.", Icon: Activity },
  ] },
  { group: "Situs", items: [
    { to: "/admin/fitur", label: "Fitur & pengumuman", title: "Fitur & pengumuman", desc: "Nyalakan atau matikan fitur dan atur pengumuman untuk semua pengguna.", Icon: ToggleRight },
    { to: "/admin/moderasi", label: "Moderasi konten", title: "Moderasi konten", desc: "Tinjau, sembunyikan, atau hapus repositori, diskusi, lowongan, karya, dan jasa.", Icon: Flag },
    { to: "/admin/laporan", label: "Laporan Diskusi", title: "Laporan Diskusi", desc: "Laporan dari pengguna terhadap postingan dan komentar.", Icon: MessageSquareWarning },
  ] },
  { group: "GOBI WORK", items: [
    { to: "/admin/kerja", label: "Lowongan, kontrak & sengketa", title: "GOBI WORK", desc: "Kelola lowongan, kontrak, sengketa, dan laporan pekerjaan.", Icon: Briefcase, Badge: WorkBadge },
  ] },
  { group: "Keuangan", items: [
    { to: "/admin/escrow", label: "Escrow & saldo", title: "Escrow & saldo", desc: "Dana yang ditahan, siap diteruskan, atau perlu refund.", Icon: Landmark, Badge: EscrowBadge },
    { to: "/admin/pembayaran", label: "Pembayaran & pencairan", title: "Pembayaran & pencairan", desc: "Cek pembayaran masuk dan proses permintaan pencairan developer.", Icon: Wallet, Badge: PayBadge },
    { to: "/admin/midtrans", label: "Midtrans", title: "Midtrans", desc: "Pengaturan dan status gerbang pembayaran Midtrans.", Icon: CreditCard },
  ] },
  { group: "Sistem", items: [
    { to: "/admin/integrasi", label: "Integrasi", title: "Integrasi", desc: "Layanan pihak ketiga yang terhubung ke platform.", Icon: Plug },
  ] },
  { group: "Pintasan", items: [
    { to: "/", label: "Lihat situs", title: "Beranda", desc: "", Icon: Home, exact: true },
    { to: "/settings", label: "Pengaturan akun", title: "Pengaturan akun", desc: "", Icon: Settings },
  ] },
];

/** Halaman admin yang sedang dibuka (untuk judul dan keterangan), atau null kalau bukan halaman admin. */
export function adminMeta(pathname: string) {
  for (const g of ADMIN_NAV) {
    for (const item of g.items) {
      if (item.to.startsWith("/admin") && isActive(pathname, item)) return { group: g.group, ...item };
    }
  }
  return null;
}
