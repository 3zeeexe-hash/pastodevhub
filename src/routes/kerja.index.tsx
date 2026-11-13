import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Briefcase, FileSignature, MessageSquare, Search } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Stat } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/")({ component: KerjaOverview });

type Stats = {
  client: Record<string, number>;
  freelancer: Record<string, number | null>;
  unread_notifications: number;
};
type Notif = { id: number; kind: string; title: string; link: string | null; read_at: string | null; created_at: string };

function KerjaOverview() {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: ["work-stats"], queryFn: () => workRpc<Stats>("work_dashboard_stats") });
  const notifs = useQuery({
    queryKey: ["work-notifs"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_notifications").select("id,kind,title,link,read_at,created_at").order("created_at", { ascending: false }).limit(20);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as Notif[];
    },
  });
  async function markAll() {
    try { await workRpc("work_mark_notifications_read"); qc.invalidateQueries({ queryKey: ["work-notifs"] }); qc.invalidateQueries({ queryKey: ["work-stats"] }); }
    catch (e) { toast.error(errMsg(e)); }
  }
  const s = stats.data;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">GOBI WORK</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lowongan, lamaran, kontrak, milestone, dan pembayaran escrow dalam satu tempat.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/lowongan"><Search /> Explore Jobs</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/kerja/kontrak"><FileSignature /> Kontrak</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/kerja/pesan"><MessageSquare /> Pesan kerja</Link></Button>
        </div>
      </header>

      {stats.isLoading && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}
      {stats.error && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      {s && (
        <>
          <section aria-labelledby="as-client">
            <h2 id="as-client" className="mb-3 font-semibold">Sebagai client</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total lowongan" value={s.client.jobs_total} />
              <Stat label="Lowongan aktif" value={s.client.jobs_open} />
              <Stat label="Total pelamar" value={s.client.applicants_total} />
              <Stat label="Pelamar baru" value={s.client.applicants_new} />
              <Stat label="Kontrak aktif" value={s.client.contracts_active} />
              <Stat label="Proyek selesai" value={s.client.projects_done} />
              <Stat label="Total dibayar" value={rp(s.client.paid_total)} />
              <Stat label="Transaksi" value={s.client.transactions} />
            </div>
          </section>
          <section aria-labelledby="as-free">
            <h2 id="as-free" className="mb-3 font-semibold">Sebagai freelancer</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Lamaran terkirim" value={s.freelancer.applications_sent} />
              <Stat label="Lamaran dilihat" value={s.freelancer.applications_viewed} />
              <Stat label="Lamaran diterima" value={s.freelancer.applications_accepted} />
              <Stat label="Proyek aktif" value={s.freelancer.projects_active} />
              <Stat label="Proyek selesai" value={s.freelancer.projects_done} />
              <Stat label="Dana diteruskan" value={rp(s.freelancer.earned)} hint="Sudah masuk saldo Studio" />
              <Stat label="Dana tertahan" value={rp(s.freelancer.pending_payout)} hint="Menunggu persetujuan / admin" />
              <Stat label="Rating" value={s.freelancer.rating ? `${s.freelancer.rating} (${s.freelancer.reviews})` : "Belum ada"} />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="notif">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="notif" className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-primary" /> Notifikasi{s ? ` (${s.unread_notifications} baru)` : ""}</h2>
          <Button size="sm" variant="ghost" onClick={markAll} disabled={!s || s.unread_notifications === 0}>Tandai dibaca</Button>
        </div>
        {notifs.isLoading && <Skeleton className="h-24 rounded-xl" />}
        {notifs.error && <ErrorState error={notifs.error} onRetry={() => notifs.refetch()} />}
        {notifs.data?.length === 0 && <EmptyState>Belum ada notifikasi GOBI WORK.</EmptyState>}
        <ul className="space-y-2">
          {notifs.data?.map((n) => {
            const body = (
              <>
                <span className={n.read_at ? "text-muted-foreground" : "font-medium"}>{n.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
              </>
            );
            return (
              <li key={n.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                {!n.read_at && <span aria-label="Belum dibaca" className="size-2 shrink-0 rounded-full bg-red-500" />}
                {n.link ? <a href={n.link} className="min-w-0 flex-1 hover:underline">{body}</a> : <span className="min-w-0 flex-1">{body}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="size-3.5" /> Pembayaran lewat Midtrans dan escrow Pastodev; dana baru diteruskan admin setelah hasil disetujui client.</p>
    </div>
  );
}
