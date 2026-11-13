import { Link } from "@tanstack/react-router";
import { Briefcase, FilePlus2, FileText, FolderKanban, MessageSquare, UserCog } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canPostJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95";

/**
 * Menu pintas GOBI WORK. Hanya tautan ke halaman yang sudah ada, dan menyesuaikan peran:
 *  - semua: Explore Jobs
 *  - client: Buat Lowongan
 *  - developer: Lamaran Saya dan Profil Kerja
 *  - masuk akun: Proyek & Pembayaran (pesanan escrow) dan Pesan Kerja
 * Di mobile baris ini bisa digeser ke samping.
 */
export function WorkNav({ active = "explore", className }: { active?: "explore"; className?: string }) {
  const { user, profile } = useAuth();
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const isDev = viewer.accountType === "developer";
  const idle = "bg-secondary text-foreground hover:bg-secondary/70";
  return (
    <nav aria-label="Menu GOBI WORK" className={cn("flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <Link to="/lowongan" className={cn(CHIP, active === "explore" ? "bg-navy text-white" : idle)}><Briefcase className="size-4" /> Explore Jobs</Link>
      {canPostJob(viewer) && <Link to="/lowongan/baru" className={cn(CHIP, idle)}><FilePlus2 className="size-4" /> Buat Lowongan</Link>}
      {isDev && <Link to="/studio/lamaran" className={cn(CHIP, idle)}><FileText className="size-4" /> Lamaran Saya</Link>}
      {user && <Link to="/pesanan" className={cn(CHIP, idle)}><FolderKanban className="size-4" /> Proyek &amp; Pembayaran</Link>}
      {user && <Link to="/discuss/pesan" className={cn(CHIP, idle)}><MessageSquare className="size-4" /> Pesan Kerja</Link>}
      {isDev && <Link to="/studio/portofolio" className={cn(CHIP, idle)}><UserCog className="size-4" /> Profil Kerja</Link>}
    </nav>
  );
}
