import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Briefcase, CheckCircle2, ClipboardList, Eye, FileSignature, Hourglass, ListChecks, MessageSquare, Plus, Receipt, Search, Send, Star, Trophy, UserCog, UserPlus, Users, Wallet } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { useRole } from "@/lib/use-role";
import { rp, workRpc } from "@/lib/work-db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/work-ui";
import { SectionCard, ShortcutGrid, StatGrid, StatTile, SummaryHero, heroOutline, type Shortcut } from "@/components/summary-ui";

export const Route = createFileRoute("/kerja/")({ component: KerjaOverview });

type Stats = {
  client: Record<string, number>;
  freelancer: Record<string, number | null>;
  unread_notifications: number;
};
type Notif = { id: number; kind: string; title: string; link: string | null; read_at: string | null; created_at: string };
type Mode = "freelancer" | "client";

const FREELANCER_SHORTCUTS: Shortcut[] = [
  { to: "/lowongan", label: "Explore Jobs", desc: "Cari proyek yang cocok", Icon: Search },
  { to: "/kerja/lamaran", label: "Lamaran saya", desc: "Pantau status lamaran", Icon: Briefcase },
  { to: "/kerja/kontrak", label: "Proyek & kontrak", desc: "Milestone dan hasil kerja", Icon: FileSignature },
  { to: "/kerja/pesan", label: "Pesan kerja", desc: "Obrolan dengan client", Icon: MessageSquare },
  { to: "/kerja/pembayaran", label: "Pembayaran", desc: "Escrow dan komisi", Icon: Receipt },
  { to: "/kerja/profil", label: "Profil kerja", desc: "Keahlian dan tarif", Icon: UserCog },
];
const CLIENT_SHORTCUTS: Shortcut[] = [
  { to: "/lowongan/baru", label: "Buat lowongan", desc: "Ceritakan proyekmu", Icon: Plus },
  { to: "/lowongan/saya", label: "Lowongan saya", desc: "Kelola pelamar", Icon: ClipboardList },
  { to: "/kerja/kontrak", label: "Proyek & kontrak", desc: "Milestone dan persetujuan", Icon: FileSignature },
  { to: "/kerja/pesan", label: "Pesan kerja", desc: "Obrolan dengan freelancer", Icon: MessageSquare },
  { to: "/kerja/pembayaran", label: "Pembayaran", desc: "Bayar dan pantau escrow", Icon: Receipt },
];

function KerjaOverview() {
  const qc = useQueryClient();
  const { role } = useRole();
  const [picked, setPicked] = useState<Mode | null>(null);
  const mode: Mode = picked ?? (role === "client" ? "client" : "freelancer");
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
  const f = s?.freelancer;
  const c = s?.client;
  const dash = "—";

  return (
    <div className="space-y-5">
      <SummaryHero
        eyebrow="gobi work"
        title="GOBI WORK"
        subtitle="Lowongan, lamaran, kontrak, milestone, dan pembayaran escrow dalam satu tempat."
        aside={s && s.unread_notifications > 0 ? <a href="#notif" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"><Bell className="size-3.5" /> {s.unread_notifications} baru</a> : undefined}
      >
        <Button asChild className="shadow-glow"><Link to="/lowongan"><Search /> Explore Jobs</Link></Button>
        <Button asChild variant="outline" className={heroOutline}><Link to="/kerja/kontrak"><FileSignature /> Kontrak</Link></Button>
        <Button asChild variant="outline" className={heroOutline}><Link to="/kerja/pesan"><MessageSquare /> Pesan kerja</Link></Button>
      </SummaryHero>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Ringkasan {mode === "client" ? "sebagai client" : "sebagai freelancer"}</h2>
        <div role="group" aria-label="Pilih sudut pandang" className="flex rounded-full bg-muted p-1 text-xs">
          {([["freelancer", "Freelancer"], ["client", "Client"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setPicked(k)}
              className={cn("rounded-full px-3 py-1 font-medium transition", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
      </div>

      {stats.isLoading && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>}
      {stats.error && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      {s && mode === "client" && c && (
        <StatGrid>
          <StatTile label="Lowongan aktif" value={c["jobs_open"] ?? dash} Icon={Briefcase} to="/lowongan/saya" />
          <StatTile label="Pelamar baru" value={c["applicants_new"] ?? dash} Icon={UserPlus} to="/lowongan/saya" accent={Number(c["applicants_new"] ?? 0) > 0} />
          <StatTile label="Kontrak aktif" value={c["contracts_active"] ?? dash} Icon={FileSignature} to="/kerja/kontrak" />
          <StatTile label="Proyek selesai" value={c["projects_done"] ?? dash} Icon={Trophy} to="/kerja/kontrak" />
          <StatTile label="Total lowongan" value={c["jobs_total"] ?? dash} Icon={ClipboardList} to="/lowongan/saya" />
          <StatTile label="Total pelamar" value={c["applicants_total"] ?? dash} Icon={Users} to="/lowongan/saya" />
          <StatTile label="Total dibayar" value={rp(c["paid_total"])} Icon={Wallet} to="/kerja/pembayaran" />
          <StatTile label="Transaksi" value={c["transactions"] ?? dash} Icon={Receipt} to="/kerja/pembayaran" />
        </StatGrid>
      )}
      {s && mode === "freelancer" && f && (
        <StatGrid>
          <StatTile label="Lamaran terkirim" value={f["applications_sent"] ?? dash} Icon={Send} to="/kerja/lamaran" />
          <StatTile label="Lamaran dilihat" value={f["applications_viewed"] ?? dash} Icon={Eye} to="/kerja/lamaran" />
          <StatTile label="Lamaran diterima" value={f["applications_accepted"] ?? dash} Icon={CheckCircle2} to="/kerja/lamaran" />
          <StatTile label="Proyek aktif" value={f["projects_active"] ?? dash} Icon={FileSignature} to="/kerja/kontrak" />
          <StatTile label="Proyek selesai" value={f["projects_done"] ?? dash} Icon={Trophy} to="/kerja/kontrak" />
          <StatTile label="Dana diteruskan" value={rp(f["earned"])} Icon={Wallet} to="/studio/saldo" hint="Sudah masuk saldo Studio" />
          <StatTile label="Dana tertahan" value={rp(f["pending_payout"])} Icon={Hourglass} to="/kerja/pembayaran" hint="Menunggu persetujuan / admin" />
          <StatTile label="Rating" value={f["rating"] ? `${f["rating"]} (${f["reviews"] ?? 0})` : "Belum ada"} Icon={Star} to="/kerja/profil" />
        </StatGrid>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section id="notif" aria-labelledby="notif-title" className="min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <h2 id="notif-title" className="flex items-center gap-2 text-base font-bold"><Bell className="size-4 text-primary" /> Notifikasi{s ? ` (${s.unread_notifications} baru)` : ""}</h2>
            <Button size="sm" variant="ghost" onClick={markAll} disabled={!s || s.unread_notifications === 0}>Tandai dibaca</Button>
          </div>
          <div className="p-3">
            {notifs.isLoading && <Skeleton className="h-24 rounded-xl" />}
            {notifs.error && <ErrorState error={notifs.error} onRetry={() => notifs.refetch()} />}
            {notifs.data?.length === 0 && <EmptyState>Belum ada notifikasi GOBI WORK.</EmptyState>}
            <ul className="space-y-1.5">
              {notifs.data?.map((n) => {
                const body = (
                  <>
                    <span className={n.read_at ? "text-muted-foreground" : "font-medium"}>{n.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </>
                );
                return (
                  <li key={n.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                    {!n.read_at && <span aria-label="Belum dibaca" className="size-2 shrink-0 rounded-full bg-red-500" />}
                    {n.link ? <a href={n.link} className="min-w-0 flex-1 hover:underline">{body}</a> : <span className="min-w-0 flex-1">{body}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <SectionCard title="Pintasan" Icon={ListChecks} className="min-w-0">
          <ShortcutGrid items={mode === "client" ? CLIENT_SHORTCUTS : FREELANCER_SHORTCUTS} />
        </SectionCard>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Briefcase className="size-3.5" /> Pembayaran lewat Midtrans dan escrow Pastodev; dana baru diteruskan admin setelah hasil disetujui client.</p>
    </div>
  );
}
