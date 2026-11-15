import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/work-ui";
import { WorkNotifList } from "@/components/work-notifications";
import { useWorkNotifs } from "@/lib/use-work-unread";

export const Route = createFileRoute("/kerja/notifikasi")({
  head: () => ({ meta: [{ title: "Notifikasi Kerja — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: WorkNotifications,
});

function WorkNotifications() {
  const notifs = useWorkNotifs(100);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Notifikasi kerja</h1>
      {notifs.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {notifs.error && <ErrorState error={notifs.error} onRetry={() => notifs.refetch()} />}
      {notifs.data && notifs.data.length === 0 && <EmptyState>Belum ada notifikasi. Kabar lamaran, kontrak, pembayaran dan pesan akan muncul di sini.</EmptyState>}
      {notifs.data && notifs.data.length > 0 && <WorkNotifList items={notifs.data} />}
    </div>
  );
}
