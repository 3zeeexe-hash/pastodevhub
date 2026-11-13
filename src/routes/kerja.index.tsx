import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileSignature, MessageSquare, PlusCircle, Search, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canPostJob } from "@/lib/jobs";
import { openChatDock } from "@/lib/chat-dock";
import { useWorkNotifs } from "@/lib/use-work-unread";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Stat } from "@/components/work-ui";
import { WorkFlow, WorkTodos } from "@/components/work-guide";
import { WorkNotifList } from "@/components/work-notifications";

export const Route = createFileRoute("/kerja/")({ component: KerjaOverview });

type Stats = {
  client: Record<string, number>;
  freelancer: Record<string, number | null>;
  unread_notifications: number;
};

/**
 * Ringkasan GOBI WORK, urutannya mengikuti kebutuhan pengguna:
 * 1) apa yang harus dikerjakan sekarang, 2) alur lengkap dari awal sampai dana cair, 3) angka ringkas, 4) kabar terbaru.
 */
function KerjaOverview() {
  const { user, profile } = useAuth();
  const viewer = { id: user?.id ?? null, accountType: profile?.account_type ?? null };
  const stats = useQuery({ queryKey: ["work-stats"], queryFn: () => workRpc<Stats>("work_dashboard_stats") });
  const notifs = useWorkNotifs(5);
  const s = stats.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">GOBI WORK</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cari kerja atau cari freelancer. Lowongan, lamaran, kontrak, milestone, dan pembayaran escrow ada di satu tempat.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/lowongan"><Search /> Cari lowongan</Link></Button>
          {canPostJob(viewer) && <Button asChild size="sm" variant="outline"><Link to="/lowongan/baru"><PlusCircle /> Pasang lowongan</Link></Button>}
          <Button asChild size="sm" variant="outline"><Link to="/kerja/kontrak"><FileSignature /> Proyek &amp; kontrak</Link></Button>
          <Button size="sm" variant="outline" onClick={() => openChatDock({ view: "work" })}><MessageSquare /> Pesan kerja</Button>
        </div>
      </header>

      <WorkTodos applicantsNew={Number(s?.client.applicants_new ?? 0)} />

      <WorkFlow defaultRole={profile?.account_type === "client" ? "client" : "freelancer"} />

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
          <h2 id="notif" className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-primary" /> Kabar terbaru{s ? ` (${s.unread_notifications} baru)` : ""}</h2>
          <Button asChild size="sm" variant="ghost"><Link to="/kerja/notifikasi">Lihat semua</Link></Button>
        </div>
        {notifs.isLoading && <Skeleton className="h-24 rounded-xl" />}
        {notifs.error && <ErrorState error={notifs.error} onRetry={() => notifs.refetch()} />}
        {notifs.data?.length === 0 && <EmptyState>Belum ada kabar. Lamaran, kontrak, pembayaran, dan pesan akan muncul di sini.</EmptyState>}
        {notifs.data && notifs.data.length > 0 && <WorkNotifList items={notifs.data} />}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Pembayaran lewat Midtrans dan escrow Pastodev; dana baru diteruskan admin setelah hasil disetujui client.</p>
    </div>
  );
}
