import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { errMsg } from "@/lib/market";
import { GROUP_LABEL, notifGroup, refreshWorkNotifs, useWorkNotifs, type NotifGroup } from "@/lib/use-work-unread";
import { workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/work-ui";
import { WorkNotifList } from "@/components/work-notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kerja/notifikasi")({
  head: () => ({ meta: [{ title: "Notifikasi GOBI WORK — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: WorkNotificationsPage,
});

const GROUPS: NotifGroup[] = ["lamaran", "kontrak", "pembayaran", "pesan", "lainnya"];

/** Semua aktivitas GOBI WORK di satu tempat, bisa disaring menurut jenisnya. */
function WorkNotificationsPage() {
  const qc = useQueryClient();
  const q = useWorkNotifs(100);
  const [group, setGroup] = useState<"all" | NotifGroup>("all");
  const all = q.data ?? [];
  const unread = all.filter((n) => !n.read_at).length;
  const countOf = (g: NotifGroup) => all.filter((n) => notifGroup(n.kind) === g && !n.read_at).length;
  const shown = group === "all" ? all : all.filter((n) => notifGroup(n.kind) === group);

  async function markAll() {
    try { await workRpc("work_mark_notifications_read"); await refreshWorkNotifs(qc); }
    catch (e) { toast.error(errMsg(e)); }
  }

  const chip = (g: "all" | NotifGroup, label: string, n: number) => (
    <button key={g} type="button" onClick={() => setGroup(g)} aria-pressed={group === g}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition", group === g ? "bg-navy text-white" : "bg-secondary text-foreground hover:bg-secondary/70")}>
      {label}{n > 0 && <span className={cn("rounded-full px-1.5 text-[11px] font-bold", group === g ? "bg-primary text-primary-foreground" : "bg-red-500 text-white")}>{n}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Notifikasi GOBI WORK</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lamaran, kontrak, pembayaran, dan pesan kerja. Ketuk satu kabar untuk langsung menuju halamannya.</p>
        </div>
        <Button size="sm" variant="outline" onClick={markAll} disabled={unread === 0}><CheckCheck /> Tandai semua dibaca</Button>
      </header>

      <div role="group" aria-label="Saring notifikasi" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip("all", "Semua", unread)}
        {GROUPS.map((g) => chip(g, GROUP_LABEL[g], countOf(g)))}
      </div>

      {q.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && shown.length === 0 && (
        <EmptyState>{group === "all" ? "Belum ada notifikasi. Saat ada pelamar baru, lamaran diterima, kontrak berubah, pembayaran masuk, atau pesan baru, kabarnya muncul di sini." : "Tidak ada notifikasi di kategori ini."}</EmptyState>
      )}
      {shown.length > 0 && <WorkNotifList items={shown} />}
    </div>
  );
}
