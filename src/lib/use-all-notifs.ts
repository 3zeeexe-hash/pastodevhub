// Notifikasi gabungan: aktivitas Diskusi, GOBI WORK, dan pesan langsung dihitung jadi satu angka belum dibaca
// untuk lonceng di header, menu samping, dan halaman /notifikasi.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn } from "@/lib/features";
import { fetchUnreadCount } from "@/lib/feed";
import { useSiteConfig } from "@/lib/use-site-config";
import { useWorkNotifUnread } from "@/lib/use-work-unread";

/** Sumber notifikasi yang aktif menurut fitur yang dihidupkan admin: Diskusi (aktivitas dan pesan) dan GOBI WORK (kerja). */
export function useNotifSources() {
  const { flags } = useSiteConfig();
  return { discuss: isFeatureOn(flags, "discuss"), jobs: isFeatureOn(flags, "jobs") };
}

/**
 * Jumlah semua yang belum dibaca: notifikasi aktivitas Diskusi + notifikasi kerja + percakapan pesan langsung yang belum dibuka.
 * Kunci kuerinya sama dengan ChatDock, menu samping, dan halaman /notifikasi, jadi cache dipakai bersama dan tidak ada permintaan ganda.
 */
export function useNotifUnreadTotal(): number {
  const { user } = useAuth();
  const { discuss, jobs } = useNotifSources();
  const feed = useQuery({
    queryKey: ["feed-unread", user?.id ?? null],
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user && discuss,
    refetchInterval: 60_000,
  });
  const dm = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user && discuss,
    refetchInterval: 60_000,
  });
  const work = useWorkNotifUnread(jobs);
  return (discuss ? (feed.data ?? 0) + (dm.data ?? 0) : 0) + (jobs ? (work.data ?? 0) : 0);
}
