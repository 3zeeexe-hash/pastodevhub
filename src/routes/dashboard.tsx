import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Download, FileSignature, ListChecks, Plus, Receipt, Search, Sparkles, UserPlus, Users, Wallet, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { budgetLabel, type JobStatus } from "@/lib/jobs";
import { MODERATION_LABEL, normalizeModeration } from "@/lib/job-review";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { useClientWallet } from "@/components/client-wallet";
import { GobiLoader } from "@/components/gobi-loader";
import { JobStatusBadge } from "@/components/job-card";
import { OrderStatusBadge } from "@/components/order-status";
import { SideNavLayout } from "@/components/side-nav-layout";
import { CLIENT_NAV } from "@/components/side-navs";
import { ActionList, EmptyHint, SectionCard, ShortcutGrid, StatGrid, StatTile, StepsCard, SummaryHero, heroOutline, type ActionItem, type Shortcut, type Step } from "@/components/summary-ui";

type DashJob = {
  id: string; title: string; status: string; budget_min: number; budget_max: number; applications_count: number; created_at: string;
  moderation_status?: string | null;
};
const DASH_JOB_COLS = "id,title,status,budget_min,budget_max,applications_count,created_at";

type ClientStats = { client: Record<string, number | null> };

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard client — Pastodev" },
      { name: "description", content: "Kelola lowongan, pelamar, dan pesanan kamu di Pastodev." },
      { property: "og:title", content: "Dashboard client — Pastodev" },
      { property: "og:description", content: "Dashboard client Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type Sc = Shortcut & { feature?: FeatureKey };
const SHORTCUTS: Sc[] = [
  { to: "/lowongan/baru", label: "Pasang lowongan", desc: "Ceritakan proyekmu", Icon: Plus, feature: "jobs" },
  { to: "/search", search: { q: "", type: "users" }, label: "Cari developer", desc: "Temukan talenta yang cocok", Icon: Search },
  { to: "/jasa", label: "Pesan jasa", desc: "Layanan siap pakai", Icon: Wrench, feature: "jasa" },
  { to: "/katalog", label: "Katalog karya", desc: "Template, kode, dan aset", Icon: Download, feature: "karya" },
  { to: "/kerja/kontrak", label: "Proyek & kontrak", desc: "Milestone dan pembayaran", Icon: FileSignature, feature: "jobs" },
  { to: "/saldo", label: "Saldo & penarikan", desc: "Dana kembali dan tarik ke rekening", Icon: Wallet },
  { to: "/pesanan", label: "Pesanan saya", desc: "Pantau semua pesanan", Icon: Receipt },
];

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { flags } = useSiteConfig();
  const enabled = !!user && profile?.account_type !== "developer";
  const { data } = useQuery({
    queryKey: ["client-dash", user?.id],
    enabled,
    queryFn: async () => {
      // Kolom peninjauan ada setelah SQL GOBI WORK; jika belum ada, pakai kolom lama (semua lowongan dianggap disetujui).
      const withReview = await looseDb.from("jobs").select(`${DASH_JOB_COLS},moderation_status`).eq("client_id", user!.id).order("created_at", { ascending: false }).limit(50);
      const [jobsRes, orders, toPay] = await Promise.all([
        withReview.error
          ? supabase.from("jobs").select(DASH_JOB_COLS).eq("client_id", user!.id).order("created_at", { ascending: false }).limit(50)
          : Promise.resolve(withReview),
        supabase.from("orders").select("id,number,title,amount,status,kind,updated_at").eq("buyer_id", user!.id).order("updated_at", { ascending: false }).limit(8),
        looseDb.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user!.id).in("status", ["awaiting_payment", "delivered"]),
      ]);
      return { jobs: (jobsRes.data ?? []) as unknown as DashJob[], orders: orders.data ?? [], toHandle: toPay.count ?? 0 };
    },
  });
  const work = useQuery({
    queryKey: ["work-stats"],
    enabled,
    queryFn: () => workRpc<ClientStats>("work_dashboard_stats"),
  });
  const wallet = useClientWallet();
  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4"><GobiLoader page /></main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk membuka dashboard." /></main>;
  if (profile?.account_type === "developer") return <Navigate to="/studio" />;

  const jobs = data?.jobs ?? [];
  const orders = data?.orders ?? [];
  const c = work.data?.client;
  const openJobs = jobs.filter((j) => j.status === "open" && normalizeModeration(j.moderation_status) === "approved").length;
  const applicants = jobs.reduce((n, j) => n + j.applications_count, 0);
  const activeOrders = orders.filter((o) => !["completed", "cancelled", "declined"].includes(o.status)).length;
  const inReview = jobs.filter((j) => normalizeModeration(j.moderation_status) === "pending").length;
  const rejected = jobs.filter((j) => normalizeModeration(j.moderation_status) === "rejected").length;
  const newApplicants = Number(c?.["applicants_new"] ?? 0);
  const walletAvailable = wallet.data?.wallet.available;
  const shortcuts = SHORTCUTS.filter((s) => !s.feature || isFeatureOn(flags, s.feature))
    .map((s) => (s.to === "/saldo" && walletAvailable !== undefined ? { ...s, desc: `Tersedia ${formatRupiah(walletAvailable, "Rp0")}` } : s));
  const name = profile?.display_name || profile?.username || "";

  const actions: ActionItem[] = [
    { key: "newapp", to: "/lowongan/saya", label: "Pelamar baru menunggu jawabanmu", Icon: UserPlus, count: newApplicants },
    { key: "orders", to: "/pesanan", label: "Pesanan perlu dibayar atau diperiksa", Icon: Receipt, count: data?.toHandle },
    { key: "review", to: "/lowongan/saya", label: "Lowongan sedang ditinjau admin", Icon: Briefcase, count: inReview },
    { key: "rejected", to: "/lowongan/saya", label: "Lowongan ditolak, perlu diperbaiki", Icon: Briefcase, count: rejected },
  ];
  const steps: Step[] = !data ? [] : [
    { key: "post", label: "Pasang lowongan pertama", to: "/lowongan/baru", done: jobs.length > 0 },
    { key: "cand", label: "Terima pelamar pertama", to: "/lowongan/saya", done: applicants > 0 },
    { key: "order", label: "Buat pesanan pertama", to: "/jasa", done: orders.length > 0 },
  ];

  return (
    <SideNavLayout title="Dashboard client" nav={CLIENT_NAV}>
      <div className="space-y-5">
        <SummaryHero eyebrow="dashboard client" title={`Halo, ${name}`} subtitle="Pasang proyek, pilih developer terbaik, dan pantau pesananmu." avatar={{ name: profile!.username, url: profile!.avatar_url ?? null }}>
          {isFeatureOn(flags, "jobs") && <Button asChild className="shadow-glow"><Link to="/lowongan/baru"><Plus /> Pasang lowongan</Link></Button>}
          <Button asChild variant="outline" className={heroOutline}><Link to="/search" search={{ q: "", type: "users" }}><Search /> Cari developer</Link></Button>
          <Button asChild variant="outline" className={heroOutline}><Link to="/saldo"><Wallet /> Saldo</Link></Button>
          {isFeatureOn(flags, "karya") && <Button asChild variant="outline" className={heroOutline}><Link to="/katalog"><Download /> Katalog</Link></Button>}
        </SummaryHero>

        <StatGrid>
          <StatTile label="Lowongan dibuka" value={openJobs} Icon={Briefcase} to="/lowongan/saya" />
          <StatTile label="Total pelamar" value={applicants} Icon={Users} to="/lowongan/saya" hint={newApplicants > 0 ? `${newApplicants} baru` : undefined} accent={newApplicants > 0} />
          <StatTile label="Pesanan berjalan" value={activeOrders} Icon={Receipt} to="/pesanan" />
          <StatTile label="Kontrak aktif" value={c ? Number(c["contracts_active"] ?? 0) : "—"} Icon={FileSignature} to="/kerja/kontrak" hint={c ? `Total dibayar ${formatRupiah(Number(c["paid_total"] ?? 0), "Rp0")}` : undefined} />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <SectionCard title="Perlu tindakan" Icon={Sparkles}>
              <ActionList items={actions} />
            </SectionCard>

            <SectionCard title="Lowongan saya" Icon={Briefcase} more={<Link to="/lowongan/baru">+ Baru</Link>}>
              <ul className="mt-1 divide-y divide-border">
                {jobs.map((j) => {
                  const mod = normalizeModeration(j.moderation_status);
                  return (
                    <li key={j.id}>
                      <Link to="/lowongan/$id" params={{ id: j.id }} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{budgetLabel(j.budget_min, j.budget_max)} · {timeAgo(j.created_at)}</p>
                        </div>
                        <span className="flex items-center gap-1 text-sm"><Users className="size-4 text-primary" />{j.applications_count}</span>
                        {mod === "approved"
                          ? <JobStatusBadge status={j.status as JobStatus} />
                          : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${mod === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"}`}>{MODERATION_LABEL[mod]}</span>}
                      </Link>
                    </li>
                  );
                })}
                {jobs.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Belum ada lowongan. <Link to="/lowongan/baru" className="text-link hover:underline">Pasang proyek pertamamu</Link> dan biarkan developer melamar.
                  </li>
                )}
              </ul>
            </SectionCard>

            <SectionCard title="Pintasan" Icon={ListChecks}>
              <ShortcutGrid items={shortcuts} />
            </SectionCard>
          </div>

          <div className="order-first min-w-0 space-y-5 xl:order-none">
            <StepsCard steps={steps} Icon={ListChecks} />
            <SectionCard title="Pesanan terbaru" Icon={Receipt} more={<Link to="/pesanan">Semua</Link>}>
              <ul className="mt-1 divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link to="/pesanan/$id" params={{ id: o.id }} className="block px-4 py-3 hover:bg-accent/40">
                      <p className="truncate text-sm font-medium">{o.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>#{o.number} · {o.amount ? formatRupiah(o.amount) : "—"}</span>
                        <OrderStatusBadge status={o.status as OrderStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
                {orders.length === 0 && <li><EmptyHint>Belum ada pesanan.</EmptyHint></li>}
              </ul>
            </SectionCard>
          </div>
        </div>
      </div>
    </SideNavLayout>
  );
}
