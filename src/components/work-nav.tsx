import { Link } from "@tanstack/react-router";
import { Bell, Briefcase, FilePlus2, FileText, FileSignature, LayoutDashboard, MessageSquare, UserCog } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canPostJob } from "@/lib/jobs";
import { CountDot, WorkChatBadge, WorkNotifBadge } from "@/components/work-badges";
import { cn } from "@/lib/utils";

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition active:scale-95";

/**
 * Menu pintas GOBI WORK. Semua tujuan sama dengan menu samping di /kerja, supaya alurnya satu dan tidak membingungkan:
 *  - semua: Cari Lowongan
 *  - masuk akun: Ringkasan, Lamaran &amp; Lowongan Saya, Proyek &amp; Kontrak, Pesan Kerja, Notifikasi
 *  - client: Pasang Lowongan
 *  - developer: Profil Kerja
 * Di mobile baris ini bisa digeser ke samping.
 */
export function WorkNav({ active = "explore", className }: { active?: "explore"; className?: string }) {
  const { user, profile } = useAuth();
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const isDev = viewer.accountType === "developer";
  const idle = "bg-secondary text-foreground hover:bg-secondary/70";
  return (
    <nav aria-label="Menu GOBI WORK" className={cn("flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {user && <Link to="/kerja" className={cn(CHIP, idle)}><LayoutDashboard className="size-4" /> Ringkasan</Link>}
      <Link to="/lowongan" className={cn(CHIP, active === "explore" ? "bg-navy text-white" : idle)}><Briefcase className="size-4" /> Cari Lowongan</Link>
      {canPostJob(viewer) && <Link to="/lowongan/baru" className={cn(CHIP, idle)}><FilePlus2 className="size-4" /> Pasang Lowongan</Link>}
      {user && <Link to="/kerja/lamaran" className={cn(CHIP, idle)}><FileText className="size-4" /> Lamaran &amp; Lowongan Saya</Link>}
      {user && <Link to="/kerja/kontrak" className={cn(CHIP, idle)}><FileSignature className="size-4" /> Proyek &amp; Kontrak</Link>}
      {user && <Link to="/kerja/pesan" className={cn(CHIP, idle)}><MessageSquare className="size-4" /> Pesan Kerja <WorkChatBadge /></Link>}
      {user && <Link to="/kerja/notifikasi" className={cn(CHIP, idle)}><Bell className="size-4" /> Notifikasi <WorkNotifBadge /></Link>}
      {isDev && <Link to="/kerja/profil" className={cn(CHIP, idle)}><UserCog className="size-4" /> Profil Kerja</Link>}
    </nav>
  );
}

export { CountDot };
