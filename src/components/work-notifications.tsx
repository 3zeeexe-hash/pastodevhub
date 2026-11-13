import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronRight, FileSignature, FileText, MessageSquare, Wallet, type LucideIcon } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { GROUP_LABEL, markWorkNotifRead, notifGroup, notifTone, refreshWorkNotifs, type NotifGroup, type WorkNotif } from "@/lib/use-work-unread";
import { cn } from "@/lib/utils";

const ICON: Record<NotifGroup, LucideIcon> = { lamaran: FileText, kontrak: FileSignature, pembayaran: Wallet, pesan: MessageSquare, lainnya: Bell };
const TONE = { ok: "bg-emerald-500/15 text-emerald-600", bad: "bg-red-500/15 text-red-600", info: "bg-primary/15 text-primary" } as const;

/**
 * Daftar notifikasi GOBI WORK. Satu ketukan: menandai dibaca lalu membuka tujuan di dalam aplikasi
 * (tanpa muat ulang halaman). Notifikasi pesan membuka obrolan di chat mengambang tab GOBI Work.
 */
export function WorkNotifList({ items }: { items: WorkNotif[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  function open(n: WorkNotif) {
    if (!n.read_at) void markWorkNotifRead(n.id).then(() => refreshWorkNotifs(qc));
    if (!n.link) return;
    let u: URL;
    try { u = new URL(n.link, window.location.origin); } catch { return; }
    if (u.pathname === "/kerja/pesan") {
      openChatDock({ view: "work", applicationId: u.searchParams.get("application") ?? undefined });
      return;
    }
    navigate({ to: u.pathname as never, search: Object.fromEntries(u.searchParams) as never });
  }

  return (
    <ul className="space-y-2">
      {items.map((n) => {
        const g = notifGroup(n.kind);
        const Icon = ICON[g];
        const unread = !n.read_at;
        return (
          <li key={n.id}>
            <button type="button" onClick={() => open(n)} className={cn("flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition hover:border-primary/50", unread ? "border-primary/30 bg-primary/5" : "border-border bg-card")}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONE[notifTone(n.kind)])}><Icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", unread ? "font-semibold" : "text-muted-foreground")}>{n.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5">{GROUP_LABEL[g]}</span>
                  {timeAgo(n.created_at)}
                </span>
              </span>
              {unread && <span aria-label="Belum dibaca" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-red-500" />}
              {n.link && <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
