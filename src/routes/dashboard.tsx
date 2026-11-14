import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Download, Plus, Receipt, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { budgetLabel, type JobStatus } from "@/lib/jobs";
import { MODERATION_LABEL, normalizeModeration } from "@/lib/job-review";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { GobiLoader } from "@/components/gobi-loader";
import { JobStatusBadge } from "@/components/job-card";
import { OrderStatusBadge } from "@/components/order-status";
import { SideNavLayout } from "@/components/side-nav-layout";
import { CLIENT_NAV } from "@/components/side-navs";

type DashJob = {
  id: string; title: string; status: string; budget_min: number; budget_max: number; applications_count: number; created_at: string;
  moderation_status?: string | null;
};
const DASH_JOB_COLS = "id,title,status,budget_min,budget_max,applications_count,created_at";

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

function Dashboard() {
  const { user, profile, loading } = useAuth();
  const { data } = useQuery({
    queryKey: ["client-dash", user?.id],
    enabled: !!user && profile?.account_type !== "developer",
    queryFn: async () => {
      // Kolom peninjauan ada setelah SQL GOBI WORK; jika belum ada, pakai kolom lama (semua lowongan dianggap disetujui).
      const withReview = await looseDb.from("jobs").select(`${DASH_JOB_COLS},moderation_status`).eq("client_id", user!.id).order("created_at", { ascending: false }).limit(50);
      const [jobsRes, orders] = await Promise.all([
        withReview.error
          ? supabase.from("jobs").select(DASH_JOB_COLS).eq("client_id", user!.id).order("created_at", { ascending: false }).limit(50)
          : Promise.resolve(withReview),
        supabase.from("orders").select("id,number,title,amount,status,kind,updated_at").eq("buyer_id", user!.id).order("updated_at", { ascending: false }).limit(8),
      ]);
      return { jobs: (jobsRes.data ?? []) as unknown as DashJob[], orders: orders.data ?? [] };
    },
  });
  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4"><GobiLoader page /></main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk membuka dashboard." /></main>;
  if (profile?.account_type === "developer") return <Navigate to="/studio" />;

  const jobs = data?.jobs ?? [];
  const orders = data?.orders ?? [];
  const openJobs = jobs.filter((j) => j.status === "open" && normalizeModeration(j.moderation_status) === "approved").length;
  const applicants = jobs.reduce((n, j) => n + j.applications_count, 0);
  const activeOrders = orders.filter((o) => !["completed", "cancelled", "declined"].includes(o.status)).length;
  const stats = [
    { label: "Lowongan dibuka", value: openJobs, Icon: Briefcase },
    { label: "Total pelamar", value: applicants, Icon: Users },
    { label: "Pesanan berjalan", value: activeOrders, Icon: Receipt },
  ];

  return (
    <SideNavLayout title="Dashboard client" nav={CLIENT_NAV}>
    <div className="space-y-6">
      <section className="bg-hero overflow-hidden rounded-2xl border border-border p-6">
        <p className="font-mono text-sm text-primary">dashboard client</p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">Halo, {profile?.display_name || profile?.username} 👋</h1>
        <p className="mt-1 text-muted-foreground">Pasang proyek, pilih developer terbaik, dan pantau pesananmu.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild className="shadow-glow"><Link to="/lowongan/baru"><Plus /> Pasang lowongan</Link></Button>
          <Button asChild variant="outline"><Link to="/search" search={{ q: "", type: "users" }}><Search /> Cari developer</Link></Button>
          <Button asChild variant="outline"><Link to="/katalog"><Download /> Katalog</Link></Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <Icon className="size-5 text-primary" />
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="font-semibold">Lowongan saya</h2>
            <Button asChild size="sm" variant="ghost"><Link to="/lowongan/baru"><Plus /> Baru</Link></Button>
          </div>
          <ul className="divide-y divide-border">
            {jobs.map((j) => {
              const mod = normalizeModeration(j.moderation_status);
              return (
                <li key={j.id}>
                  <Link to="/lowongan/$id" params={{ id: j.id }} className="flex flex-wrap items-center gap-3 p-4 hover:bg-accent/40">
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
              <li className="p-8 text-center text-sm text-muted-foreground">
                Belum ada lowongan. <Link to="/lowongan/baru" className="text-link hover:underline">Pasang proyek pertamamu</Link> dan biarkan developer melamar.
              </li>
            )}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-semibold">Pesanan terbaru</h2>
              <Link to="/pesanan" className="text-sm text-link hover:underline">Semua</Link>
            </div>
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link to="/pesanan/$id" params={{ id: o.id }} className="block p-3 hover:bg-accent/40">
                    <p className="truncate text-sm font-medium">{o.title}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>#{o.number} · {o.amount ? formatRupiah(o.amount) : "—"}</span>
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </div>
                  </Link>
                </li>
              ))}
              {orders.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Belum ada pesanan.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
    </SideNavLayout>
  );
}
