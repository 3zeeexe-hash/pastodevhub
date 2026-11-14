import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, BookMarked, Briefcase, Landmark, Package, Receipt, RotateCcw, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { featureLabel, type FeatureKey } from "@/lib/features";
import { escrowStage } from "@/lib/midtrans-shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Ringkasan admin — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: OverviewPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(table: string, apply?: (q: any) => any): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count: n } = await q;
  return n ?? 0;
}

type Stat = { label: string; to: string; Icon: LucideIcon; n: number | undefined };

function StatCard({ s, urgent }: { s: Stat; urgent?: boolean }) {
  const hot = urgent && (s.n ?? 0) > 0;
  return (
    <Link to={s.to} className={cn("rounded-xl border bg-card p-4 transition hover:border-primary/60", hot ? "border-primary" : "border-border")}>
      <s.Icon className={cn("size-5", hot ? "text-primary" : "text-muted-foreground")} />
      <p className="mt-2 text-2xl font-bold">{s.n ?? "—"}</p>
      <p className="text-sm text-muted-foreground">{s.label}</p>
    </Link>
  );
}

function OverviewPage() {
  const { data } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [users, devs, repos, products, services, jobs, bans, verif, pay, payouts, off, held, refunds] = await Promise.all([
        count("profiles"),
        count("profiles", (q) => q.eq("account_type", "developer")),
        count("repositories"),
        count("products"),
        count("services"),
        count("jobs"),
        count("user_bans"),
        count("verification_requests", (q) => q.eq("status", "pending")),
        count("orders", (q) => q.eq("status", "payment_review")),
        count("payouts", (q) => q.eq("status", "requested")),
        sb.from("feature_flags").select("key").eq("enabled", false),
        // Tabel escrow baru ada setelah SQL docs/sql/midtrans-escrow dijalankan; sebelum itu hasilnya kosong.
        sb.from("escrow_ledger").select("kind,status,order:orders(status)").eq("status", "held").limit(1000),
        count("payments", (q) => q.eq("needs_refund", true)),
      ]);
      const heldRows = ((held.data ?? []) as { kind: string; status: string; order: { status: string } | null }[]);
      const ready = heldRows.filter((r) => escrowStage(r, r.kind, r.order?.status ?? "") === "ready_for_admin").length;
      return { users, devs, repos, products, services, jobs, bans, verif, pay, payouts, ready, refunds, off: ((off.data ?? []) as { key: string }[]).map((r) => r.key) };
    },
  });

  const todo: Stat[] = [
    { label: "Pengajuan verifikasi", to: "/admin/verifikasi", Icon: BadgeCheck, n: data?.verif },
    { label: "Pembayaran perlu dicek", to: "/admin/pembayaran", Icon: Receipt, n: data?.pay },
    { label: "Dana jasa siap diteruskan", to: "/admin/escrow", Icon: Landmark, n: data?.ready },
    { label: "Pembayaran perlu refund", to: "/admin/escrow", Icon: RotateCcw, n: data?.refunds },
    { label: "Pencairan menunggu", to: "/admin/pembayaran", Icon: Wallet, n: data?.payouts },
  ];
  const stats: Stat[] = [
    { label: "Pengguna", to: "/admin/pengguna", Icon: Users, n: data?.users },
    { label: "Developer", to: "/admin/pengguna", Icon: Users, n: data?.devs },
    { label: "Diblokir", to: "/admin/pengguna", Icon: Ban, n: data?.bans },
    { label: "Repositori", to: "/admin/moderasi", Icon: BookMarked, n: data?.repos },
    { label: "Karya", to: "/admin/moderasi", Icon: Package, n: data?.products },
    { label: "Jasa", to: "/admin/moderasi", Icon: Wrench, n: data?.services },
    { label: "Lowongan", to: "/admin/moderasi", Icon: Briefcase, n: data?.jobs },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-semibold">Perlu tindakan</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{todo.map((s) => <StatCard key={s.label} s={s} urgent />)}</div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Platform</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{stats.map((s) => <StatCard key={s.label} s={s} />)}</div>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Fitur yang sedang dimatikan</h2>
        {data && data.off.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Semua fitur menyala.</p>}
        {data && data.off.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.off.map((k) => <li key={k} className="rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive">{featureLabel(k as FeatureKey)}</li>)}
          </ul>
        )}
        <Link to="/admin/fitur" className="mt-3 inline-block text-sm text-link hover:underline">Atur fitur dan pengumuman</Link>
      </section>
    </div>
  );
}
