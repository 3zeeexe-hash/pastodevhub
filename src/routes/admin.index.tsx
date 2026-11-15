/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  Activity, BadgeCheck, Ban, BookMarked, Briefcase, CheckCircle2, FileText, Flag, Gavel, GitCommit, Heart,
  Landmark, MessageCircle, Newspaper, Package, Receipt, RefreshCw, RotateCcw, ScrollText, ShieldCheck,
  ShoppingBag, Star, UserPlus, Users, Wallet, Wrench, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { featureLabel, type FeatureKey } from "@/lib/features";
import { formatRupiah } from "@/lib/market";
import { escrowStage, methodLabel } from "@/lib/midtrans-shared";
import { CONTRACT_STATUS_LABEL, type ContractStatus } from "@/lib/work";
import { workRpc } from "@/lib/work-db";
import { cn } from "@/lib/utils";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Ringkasan admin — GoBi" }, { name: "robots", content: "noindex" }] }),
  component: OverviewPage,
});

const sb = supabase as any;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("id-ID"));
const rupiah = (n: number | null | undefined) => (n == null ? "—" : formatRupiah(n, "Rp0"));

/** Link dengan `to` string biasa (rute admin dan rute dinamis dipakai bersama). */
const ALink = Link as unknown as ComponentType<{ to: string; params?: Record<string, string>; className?: string; children?: ReactNode }>;

/** Hitung baris; null kalau tabelnya belum ada atau query gagal, supaya tampil "—" dan bukan angka 0 yang menyesatkan. */
async function cnt(table: string, apply?: (q: any) => any): Promise<number | null> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

async function rows<T>(table: string, cols: string, apply?: (q: any) => any): Promise<T[]> {
  let q = sb.from(table).select(cols);
  if (apply) q = apply(q);
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

function dayBuckets(items: { at: string; v?: number }[], days = 14) {
  const out: { label: string; value: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    idx.set(d.toLocaleDateString("en-CA"), out.length);
    out.push({ label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }), value: 0 });
  }
  for (const it of items) {
    const i = idx.get(new Date(it.at).toLocaleDateString("en-CA"));
    if (i !== undefined) out[i].value += it.v ?? 1;
  }
  return out;
}

const sum = (list: { [k: string]: any }[], key: string) => list.reduce((a, r) => a + Number(r[key] ?? 0), 0);

/* ---------- Komponen tampilan ---------- */

const ICON_TONE = {
  default: "bg-secondary text-muted-foreground",
  brand: "bg-primary/15 text-primary",
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  bad: "bg-red-500/15 text-red-600 dark:text-red-400",
} as const;

type Tone = keyof typeof ICON_TONE;
type M = { label: string; value: number | string | null | undefined; hint?: string; Icon: LucideIcon; to?: string; tone?: Tone };

function Metric({ m, loading, urgent }: { m: M; loading?: boolean; urgent?: boolean }) {
  const n = typeof m.value === "number" ? m.value : null;
  const hot = urgent && (n ?? 0) > 0;
  const quiet = urgent && n === 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("grid size-9 place-items-center rounded-xl", hot ? ICON_TONE.warn : ICON_TONE[m.tone ?? "default"])}><m.Icon className="size-[18px]" /></span>
        {hot && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Perlu dicek</span>}
      </div>
      <div className="mt-3 text-2xl font-extrabold tabular-nums leading-none">
        {loading ? <Skeleton className="h-7 w-16" /> : typeof m.value === "number" ? num(m.value) : (m.value ?? "—")}
      </div>
      <p className="mt-1.5 text-sm text-foreground/80">{m.label}</p>
      {m.hint && !loading && <p className="mt-0.5 text-xs text-muted-foreground">{m.hint}</p>}
    </>
  );
  const cls = cn(
    "block rounded-2xl bg-card p-4 shadow-sm ring-1 transition",
    hot ? "ring-2 ring-amber-500/60" : "ring-border",
    quiet && "opacity-70",
    m.to && "hover:ring-primary/60 hover:shadow-md",
  );
  return m.to ? <ALink to={m.to} className={cls}>{body}</ALink> : <div className={cls}>{body}</div>;
}

function MetricGrid({ items, loading, urgent, cols = "lg:grid-cols-4" }: { items: M[]; loading?: boolean; urgent?: boolean; cols?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", cols)}>{items.map((m) => <Metric key={m.label} m={m} loading={loading} urgent={urgent} />)}</div>;
}

function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <h3 className="text-sm font-extrabold">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const Empty = ({ children = "Belum ada data." }: { children?: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

function ColumnChart({ data, fmt = num, empty }: { data: { label: string; value: number }[]; fmt?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <Empty>{empty ?? "Belum ada aktivitas dalam 14 hari terakhir."}</Empty>;
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Total 14 hari: <b className="text-foreground">{fmt(total)}</b></p>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`Grafik 14 hari terakhir, total ${fmt(total)}`}>
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className="flex h-full flex-1 items-end" title={`${d.label}: ${fmt(d.value)}`}>
            <div className={cn("w-full rounded-t transition hover:bg-primary", d.value ? "bg-primary/80" : "bg-secondary")} style={{ height: `${d.value ? Math.max(6, (d.value / max) * 100) : 3}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
    </div>
  );
}

function Stacked({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <Empty />;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-secondary" role="img" aria-label="Komposisi">
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={p.cls} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${num(p.value)}`} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", p.cls)} />{p.label}</span>
            <span className="tabular-nums text-muted-foreground">{num(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Data ---------- */

type AStats = Record<string, number>;
type Group = "member" | "transaksi" | "konten" | "admin";
type Kind = "member" | "verify" | "order" | "payment" | "payout" | "contract" | "post" | "job" | "application" | "audit" | "report";
type Ev = { id: string; at: string; group: Group; kind: Kind; title: string; sub: string; to?: string; params?: Record<string, string> };

const KIND_ICON: Record<Kind, LucideIcon> = {
  member: UserPlus, verify: BadgeCheck, order: ShoppingBag, payment: Receipt, payout: Wallet, contract: ScrollText,
  post: Newspaper, job: Briefcase, application: FileText, audit: ShieldCheck, report: Flag,
};
const GROUPS: { key: "all" | Group; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "member", label: "Member" }, { key: "transaksi", label: "Transaksi" }, { key: "konten", label: "Konten" }, { key: "admin", label: "Admin & laporan" },
];

const ACCOUNT_LABEL = (t: string | null) => (t === "developer" ? "Developer" : t === "client" ? "Client" : "Belum memilih jenis akun");

function useActions() {
  return useQuery({
    queryKey: ["admin-overview", "actions"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [verif, pay, payouts, refunds, feedReports, held, off] = await Promise.all([
        cnt("verification_requests", (q) => q.eq("status", "pending")),
        cnt("orders", (q) => q.eq("status", "payment_review")),
        cnt("payouts", (q) => q.eq("status", "requested")),
        cnt("payments", (q) => q.eq("needs_refund", true)),
        cnt("feed_reports", (q) => q.is("resolved_at", null)),
        // Tabel escrow baru ada setelah SQL docs/sql/midtrans-escrow dijalankan; sebelum itu hasilnya kosong.
        rows<{ kind: string; status: string; net: number; order: { status: string } | null }>("escrow_ledger", "kind,status,net,order:orders(status)", (q) => q.eq("status", "held").limit(1000)),
        rows<{ key: string }>("feature_flags", "key", (q) => q.eq("enabled", false)),
      ]);
      const ready = held.filter((r) => escrowStage(r, r.kind, r.order?.status ?? "") === "ready_for_admin").length;
      return { verif, pay, payouts, refunds, feedReports, ready, heldCount: held.length, heldNet: sum(held, "net"), off: off.map((r) => r.key) };
    },
  });
}

function useMembers() {
  return useQuery({
    queryKey: ["admin-overview", "members"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [total, devs, clients, noType, verified, banned, admins, new7, new30, hire, follows, signups, latest] = await Promise.all([
        cnt("profiles"),
        cnt("profiles", (q) => q.eq("account_type", "developer")),
        cnt("profiles", (q) => q.eq("account_type", "client")),
        cnt("profiles", (q) => q.is("account_type", null)),
        cnt("profiles", (q) => q.eq("is_verified", true)),
        cnt("user_bans"),
        cnt("user_roles", (q) => q.eq("role", "admin")),
        cnt("profiles", (q) => q.gte("created_at", ago(7 * DAY))),
        cnt("profiles", (q) => q.gte("created_at", ago(30 * DAY))),
        cnt("profiles", (q) => q.eq("available_for_hire", true)),
        cnt("follows"),
        rows<{ created_at: string }>("profiles", "created_at", (q) => q.gte("created_at", ago(14 * DAY)).limit(5000)),
        rows<{ id: string; username: string; display_name: string | null; avatar_url: string | null; account_type: string | null; is_verified: boolean; created_at: string }>(
          "profiles", "id,username,display_name,avatar_url,account_type,is_verified,created_at", (q) => q.order("created_at", { ascending: false }).limit(8),
        ),
      ]);
      return { total, devs, clients, noType, verified, banned, admins, new7, new30, hire, follows, signups: dayBuckets(signups.map((r) => ({ at: r.created_at }))), latest };
    },
  });
}

function useCommunity() {
  return useQuery({
    queryKey: ["admin-overview", "community"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [posts, posts24, stories, dmConv, dm24, repos, repos7, commits7, issues, prs, stars, postRows] = await Promise.all([
        cnt("feed_posts"),
        cnt("feed_posts", (q) => q.gte("created_at", ago(DAY))),
        cnt("feed_stories", (q) => q.gt("expires_at", new Date().toISOString())),
        cnt("dm_conversations"),
        cnt("dm_messages", (q) => q.gte("created_at", ago(DAY))),
        cnt("repositories"),
        cnt("repositories", (q) => q.gte("created_at", ago(7 * DAY))),
        cnt("commits", (q) => q.gte("created_at", ago(7 * DAY))),
        cnt("issues"),
        cnt("pull_requests"),
        cnt("stars"),
        rows<{ created_at: string }>("feed_posts", "created_at", (q) => q.gte("created_at", ago(14 * DAY)).limit(5000)),
      ]);
      return { posts, posts24, stories, dmConv, dm24, repos, repos7, commits7, issues, prs, stars, perDay: dayBuckets(postRows.map((r) => ({ at: r.created_at }))) };
    },
  });
}

function useMarket() {
  return useQuery({
    queryKey: ["admin-overview", "market"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [products, productsPub, services, servicesOn, jobs, apps, apps7, orders, ordersPaid, ordersDone, reviews, ratings, paid30, payoutRows, refunds, ...cs] = await Promise.all([
        cnt("products"),
        cnt("products", (q) => q.eq("is_published", true)),
        cnt("services"),
        cnt("services", (q) => q.eq("is_active", true)),
        cnt("jobs"),
        cnt("job_applications"),
        cnt("job_applications", (q) => q.gte("created_at", ago(7 * DAY))),
        cnt("orders"),
        cnt("orders", (q) => q.not("paid_at", "is", null)),
        cnt("orders", (q) => q.not("completed_at", "is", null)),
        cnt("work_reviews"),
        rows<{ rating: number }>("work_reviews", "rating", (q) => q.limit(2000)),
        rows<{ gross_amount: number; paid_at: string }>("payments", "gross_amount,paid_at", (q) => q.not("paid_at", "is", null).gte("paid_at", ago(30 * DAY)).limit(5000)),
        rows<{ amount: number }>("payouts", "amount", (q) => q.eq("status", "requested").limit(1000)),
        cnt("payments", (q) => q.eq("needs_refund", true)),
        ...(["draft", "waiting_approval", "active", "completed", "cancelled", "disputed"] as const).map((s) => cnt("work_contracts", (q) => q.eq("status", s))),
      ]);
      const [cDraft, cWait, cActive, cDone, cCancel, cDisp] = cs as (number | null)[];
      return {
        products, productsPub, services, servicesOn, jobs, apps, apps7, orders, ordersPaid, ordersDone, reviews,
        avgRating: ratings.length ? sum(ratings, "rating") / ratings.length : null,
        paid30Count: paid30.length, paid30Sum: sum(paid30, "gross_amount"),
        paidPerDay: dayBuckets(paid30.map((r) => ({ at: r.paid_at, v: Number(r.gross_amount) }))),
        payoutCount: payoutRows.length, payoutSum: sum(payoutRows, "amount"), refunds,
        contracts: { draft: cDraft, wait: cWait, active: cActive, done: cDone, cancel: cCancel, disp: cDisp },
      };
    },
  });
}

function useWorkStats() {
  return useQuery({ queryKey: ["admin-overview", "work-stats"], refetchInterval: 60_000, retry: false, queryFn: () => workRpc<AStats>("work_admin_stats") });
}

function useTimeline() {
  return useQuery({
    queryKey: ["admin-overview", "timeline"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const desc = (col: string) => (q: any) => q.order(col, { ascending: false }).limit(8);
      const [members, verifies, orders, payments, payouts, contracts, posts, jobs, apps, audits, fReports, wReports] = await Promise.all([
        rows<any>("profiles", "id,username,account_type,created_at", desc("created_at")),
        rows<any>("verification_requests", "id,status,created_at,user:profiles!verification_requests_user_id_fkey(username)", desc("created_at")),
        rows<any>("orders", "id,number,title,status,amount,created_at,buyer:profiles!orders_buyer_id_fkey(username),seller:profiles!orders_seller_id_fkey(username)", desc("created_at")),
        rows<any>("payments", "id,gross_amount,method,paid_at,order:orders(id,number,title)", (q) => q.not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(8)),
        rows<any>("payouts", "id,amount,status,created_at,developer:profiles!payouts_developer_id_fkey(username)", desc("created_at")),
        rows<any>("work_contracts", "id,title,status,total_amount,updated_at,client:profiles!work_contracts_client_id_fkey(username),freelancer:profiles!work_contracts_freelancer_id_fkey(username)", desc("updated_at")),
        rows<any>("feed_posts", "id,body,created_at,author:profiles!feed_posts_author_id_fkey(username)", desc("created_at")),
        rows<any>("jobs", "id,title,category,created_at,client:profiles!jobs_client_id_fkey(username)", desc("created_at")),
        rows<any>("job_applications", "id,job_id,bid_amount,created_at,developer:profiles!job_applications_developer_id_fkey(username),job:jobs(title)", desc("created_at")),
        rows<any>("admin_audit_log", "id,admin_label,action,target_type,note,created_at", desc("created_at")),
        rows<any>("feed_reports", "id,reason,created_at,reporter:profiles!feed_reports_reporter_id_fkey(username)", desc("created_at")),
        rows<any>("work_reports", "id,reason,target_type,created_at,reporter:profiles!work_reports_reporter_id_fkey(username)", desc("created_at")),
      ]);
      const u = (x: any) => (x?.username ? `@${x.username}` : "pengguna");
      const out: Ev[] = [
        ...members.map((r): Ev => ({ id: `m${r.id}`, at: r.created_at, group: "member", kind: "member", title: `${u(r)} bergabung`, sub: ACCOUNT_LABEL(r.account_type), to: "/$username", params: { username: r.username } })),
        ...verifies.map((r): Ev => ({ id: `v${r.id}`, at: r.created_at, group: "member", kind: "verify", title: `${u(r.user)} mengajukan verifikasi`, sub: `Status: ${r.status}`, to: "/admin/verifikasi" })),
        ...orders.map((r): Ev => ({ id: `o${r.id}`, at: r.created_at, group: "transaksi", kind: "order", title: `Pesanan #${r.number} · ${r.title}`, sub: `${u(r.buyer)} → ${u(r.seller)} · ${r.status} · ${rupiah(r.amount)}`, to: "/pesanan/$id", params: { id: r.id } })),
        ...payments.map((r): Ev => ({ id: `p${r.id}`, at: r.paid_at, group: "transaksi", kind: "payment", title: `Pembayaran masuk ${rupiah(r.gross_amount)}`, sub: `${r.order ? `#${r.order.number} · ${r.order.title} · ` : ""}${methodLabel(r.method)}`, ...(r.order ? { to: "/pesanan/$id", params: { id: r.order.id } } : { to: "/admin/pembayaran" }) })),
        ...payouts.map((r): Ev => ({ id: `w${r.id}`, at: r.created_at, group: "transaksi", kind: "payout", title: `${u(r.developer)} mengajukan pencairan ${rupiah(r.amount)}`, sub: `Status: ${r.status}`, to: "/admin/pembayaran" })),
        ...contracts.map((r): Ev => ({ id: `c${r.id}`, at: r.updated_at, group: "transaksi", kind: "contract", title: `Kontrak · ${r.title}`, sub: `${u(r.client)} ↔ ${u(r.freelancer)} · ${CONTRACT_STATUS_LABEL[r.status as ContractStatus] ?? r.status} · ${rupiah(r.total_amount)}`, to: "/kerja/kontrak/$id", params: { id: r.id } })),
        ...posts.map((r): Ev => ({ id: `f${r.id}`, at: r.created_at, group: "konten", kind: "post", title: `${u(r.author)} memposting`, sub: String(r.body ?? "").replace(/\s+/g, " ").slice(0, 100) || "(tanpa teks)", to: "/discuss/status/$id", params: { id: r.id } })),
        ...jobs.map((r): Ev => ({ id: `j${r.id}`, at: r.created_at, group: "konten", kind: "job", title: `Lowongan baru · ${r.title}`, sub: `${u(r.client)} · ${r.category}`, to: "/lowongan/$id", params: { id: r.id } })),
        ...apps.map((r): Ev => ({ id: `a${r.id}`, at: r.created_at, group: "konten", kind: "application", title: `${u(r.developer)} melamar · ${r.job?.title ?? "lowongan"}`, sub: `Tawaran ${rupiah(r.bid_amount)}`, to: "/lowongan/$id", params: { id: r.job_id } })),
        ...audits.map((r): Ev => ({ id: `u${r.id}`, at: r.created_at, group: "admin", kind: "audit", title: `${r.admin_label ?? "admin"} · ${r.action}`, sub: [r.target_type, r.note].filter(Boolean).join(" · ") || "Tindakan admin", to: "/admin/pantau" })),
        ...fReports.map((r): Ev => ({ id: `r${r.id}`, at: r.created_at, group: "admin", kind: "report", title: `Laporan konten dari ${u(r.reporter)}`, sub: String(r.reason ?? ""), to: "/admin/laporan" })),
        ...wReports.map((r): Ev => ({ id: `x${r.id}`, at: r.created_at, group: "admin", kind: "report", title: `Laporan GOBI Work dari ${u(r.reporter)}`, sub: `${r.target_type} · ${r.reason}`, to: "/admin/kerja" })),
      ];
      return out.filter((e) => e.at).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 60);
    },
  });
}

/* ---------- Halaman ---------- */

function OverviewPage() {
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ["admin-overview"] }) > 0;
  const actions = useActions();
  const members = useMembers();
  const community = useCommunity();
  const market = useMarket();
  const work = useWorkStats();
  const timeline = useTimeline();
  const [group, setGroup] = useState<"all" | Group>("all");

  const a = actions.data;
  const w = work.data;
  const mk = market.data;
  const mb = members.data;
  const cm = community.data;

  const todo: M[] = [
    { label: "Pengajuan verifikasi", to: "/admin/verifikasi", Icon: BadgeCheck, value: a?.verif },
    { label: "Pembayaran perlu dicek", to: "/admin/pembayaran", Icon: Receipt, value: a?.pay },
    { label: "Dana jasa siap diteruskan", to: "/admin/escrow", Icon: Landmark, value: a?.ready },
    { label: "Pembayaran perlu refund", to: "/admin/escrow", Icon: RotateCcw, value: a?.refunds },
    { label: "Pencairan menunggu", to: "/admin/pembayaran", Icon: Wallet, value: a?.payouts },
    { label: "Laporan konten terbuka", to: "/admin/laporan", Icon: Flag, value: a?.feedReports },
    { label: "Laporan GOBI Work terbuka", to: "/admin/kerja", Icon: Flag, value: w?.reports_open },
    { label: "Sengketa kontrak aktif", to: "/admin/kerja", Icon: Gavel, value: w?.disputes_open },
    { label: "Lowongan menunggu moderasi", to: "/admin/kerja", Icon: Briefcase, value: w?.jobs_pending_moderation },
  ];
  const pending = todo.reduce((s, t) => s + (typeof t.value === "number" ? t.value : 0), 0);
  const todoSorted = [...todo].sort((x, y) => (Number(y.value) || 0) - (Number(x.value) || 0));
  const todoLoading = actions.isLoading;
  const updated = Math.max(0, actions.dataUpdatedAt, members.dataUpdatedAt, market.dataUpdatedAt, timeline.dataUpdatedAt);

  const memberMetrics: M[] = [
    { label: "Total member", value: mb?.total, hint: `+${num(mb?.new30)} dalam 30 hari`, Icon: Users, to: "/admin/pengguna", tone: "brand" },
    { label: "Baru 7 hari", value: mb?.new7, Icon: UserPlus, to: "/admin/pengguna", tone: "ok" },
    { label: "Developer", value: mb?.devs, Icon: Users, to: "/admin/pengguna" },
    { label: "Client", value: mb?.clients, Icon: Users, to: "/admin/pengguna" },
    { label: "Belum pilih jenis akun", value: mb?.noType, Icon: Users, to: "/admin/pengguna" },
    { label: "Developer siap menerima kerja", value: mb?.hire, Icon: Briefcase, to: "/admin/pengguna" },
    { label: "Centang biru", value: mb?.verified, Icon: BadgeCheck, to: "/admin/verifikasi", tone: "brand" },
    { label: "Admin", value: mb?.admins, Icon: ShieldCheck, to: "/admin/pengguna" },
    { label: "Akun diblokir", value: mb?.banned, Icon: Ban, to: "/admin/pengguna", tone: (mb?.banned ?? 0) > 0 ? "bad" : "default" },
    { label: "Total follow", value: mb?.follows, Icon: Heart },
  ];

  const communityMetrics: M[] = [
    { label: "Postingan feed", value: cm?.posts, hint: `${num(cm?.posts24)} dalam 24 jam`, Icon: Newspaper, to: "/admin/pantau", tone: "brand" },
    { label: "Story aktif", value: cm?.stories, Icon: Activity },
    { label: "Percakapan pribadi", value: cm?.dmConv, hint: `${num(cm?.dm24)} pesan dalam 24 jam`, Icon: MessageCircle },
    { label: "Repositori", value: cm?.repos, hint: `+${num(cm?.repos7)} dalam 7 hari`, Icon: BookMarked, to: "/admin/moderasi" },
    { label: "Commit 7 hari", value: cm?.commits7, Icon: GitCommit },
    { label: "Issue", value: cm?.issues, Icon: Flag },
    { label: "Pull request", value: cm?.prs, Icon: GitCommit },
    { label: "Bintang repositori", value: cm?.stars, Icon: Star },
  ];

  const c = mk?.contracts;
  const marketMetrics: M[] = [
    { label: "Karya", value: mk?.products, hint: `${num(mk?.productsPub)} terbit`, Icon: Package, to: "/admin/moderasi" },
    { label: "Jasa", value: mk?.services, hint: `${num(mk?.servicesOn)} aktif`, Icon: Wrench, to: "/admin/moderasi" },
    { label: "Lowongan", value: mk?.jobs, hint: w ? `${num(w.jobs_pending_moderation)} menunggu moderasi` : undefined, Icon: Briefcase, to: "/admin/kerja" },
    { label: "Lamaran", value: mk?.apps, hint: `+${num(mk?.apps7)} dalam 7 hari`, Icon: FileText, to: "/admin/kerja" },
    { label: "Kontrak berjalan", value: c?.active, hint: `${num(c?.done)} selesai`, Icon: ScrollText, to: "/admin/kerja", tone: "ok" },
    { label: "Pesanan", value: mk?.orders, hint: `${num(mk?.ordersPaid)} dibayar · ${num(mk?.ordersDone)} selesai`, Icon: ShoppingBag, to: "/admin/pantau" },
    { label: "Ulasan", value: mk?.reviews, hint: mk?.avgRating != null ? `Rata-rata ★ ${mk.avgRating.toFixed(1)}` : undefined, Icon: Star },
    { label: "Tingkat penyelesaian proyek", value: work.isError ? "—" : (work.isLoading ? undefined : `${(w as any)?.completion_rate ?? (c && (c.done ?? 0) + (c.cancel ?? 0) > 0 ? Math.round(((c.done ?? 0) / ((c.done ?? 0) + (c.cancel ?? 0))) * 100) : "—")}${typeof (w as any)?.completion_rate === "number" || (c && (c.done ?? 0) + (c.cancel ?? 0) > 0) ? "%" : ""}`), Icon: CheckCircle2, tone: "ok" },
  ];

  const financeMetrics: M[] = [
    { label: "Pembayaran masuk 30 hari", value: rupiah(mk?.paid30Sum), hint: `${num(mk?.paid30Count)} transaksi`, Icon: Receipt, to: "/admin/pembayaran", tone: "ok" },
    { label: "Dana escrow ditahan", value: rupiah(a?.heldNet), hint: `${num(a?.heldCount)} catatan`, Icon: Landmark, to: "/admin/escrow", tone: "brand" },
    { label: "Pencairan menunggu", value: rupiah(mk?.payoutSum), hint: `${num(mk?.payoutCount)} pengajuan`, Icon: Wallet, to: "/admin/pembayaran", tone: (mk?.payoutCount ?? 0) > 0 ? "warn" : "default" },
    { label: "Perlu refund", value: mk?.refunds, Icon: RotateCcw, to: "/admin/escrow", tone: (mk?.refunds ?? 0) > 0 ? "bad" : "default" },
    { label: "Volume GOBI Work", value: w ? rupiah(Number(w.volume)) : "—", hint: w ? `${num(w.transactions)} transaksi dibayar` : "Butuh SQL GOBI Work", Icon: Briefcase, to: "/admin/kerja" },
    { label: "Komisi platform", value: w ? rupiah(Number(w.commission)) : "—", Icon: Landmark, to: "/admin/kerja", tone: "ok" },
  ];

  const shown = (timeline.data ?? []).filter((e) => group === "all" || e.group === group).slice(0, 25);

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="relative overflow-hidden rounded-3xl bg-header-gradient p-5 text-white shadow-md sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-semibold text-primary">admin · ringkasan</p>
            <h1 className="mt-1 text-2xl font-extrabold">Ringkasan GoBi</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/80">
              {todoLoading ? "Memuat data…" : pending > 0 ? `${num(pending)} hal menunggu tindakan kamu. Lihat daftar di bawah.` : "Semua beres, tidak ada yang menunggu tindakan."}{" "}
              Data diperbarui otomatis tiap 30 detik.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/70">{updated ? `Diperbarui ${new Date(updated).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            <Button size="sm" variant="secondary" className="rounded-full" disabled={fetching} onClick={() => qc.invalidateQueries({ queryKey: ["admin-overview"] })}>
              <RefreshCw className={cn(fetching && "animate-spin")} /> Muat ulang
            </Button>
          </div>
        </div>
      </header>

      {/* Perlu tindakan */}
      <Section title="Perlu tindakan" hint="Urut dari yang paling banyak menunggu. Kartu menyala berarti ada yang harus kamu proses.">
        {!todoLoading && pending === 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-sm ring-1 ring-emerald-500/30">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <span>Tidak ada verifikasi, pembayaran, pencairan, refund, laporan, atau sengketa yang menunggu.</span>
          </div>
        )}
        <MetricGrid items={todoSorted} loading={todoLoading} urgent cols="lg:grid-cols-3" />
      </Section>

      {/* Member */}
      <Section title="Member" hint="Siapa saja yang ada di GoBi, pertumbuhannya, dan yang baru bergabung.">
        <MetricGrid items={memberMetrics} loading={members.isLoading} cols="lg:grid-cols-5" />
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Pendaftar baru per hari" hint="14 hari terakhir">
            {members.isLoading ? <Skeleton className="h-32" /> : <ColumnChart data={mb?.signups ?? []} empty="Belum ada pendaftar dalam 14 hari terakhir." />}
          </Panel>
          <Panel title="Komposisi akun">
            {members.isLoading ? <Skeleton className="h-24" /> : (
              <Stacked parts={[
                { label: "Developer", value: mb?.devs ?? 0, cls: "bg-primary" },
                { label: "Client", value: mb?.clients ?? 0, cls: "bg-sky-500" },
                { label: "Belum memilih", value: mb?.noType ?? 0, cls: "bg-muted-foreground/40" },
              ]} />
            )}
          </Panel>
          <Panel title="Member terbaru" hint="Klik untuk membuka profil">
            {members.isLoading ? <Skeleton className="h-32" /> : !mb?.latest.length ? <Empty /> : (
              <ul className="space-y-2.5">
                {mb.latest.map((u) => (
                  <li key={u.id} className="flex items-center gap-2.5">
                    <AvatarMini name={u.username} url={u.avatar_url} size={32} />
                    <div className="min-w-0 flex-1">
                      <ALink to="/$username" params={{ username: u.username }} className="flex items-center gap-1 truncate text-sm font-semibold hover:underline">
                        <span className="truncate">{u.display_name || u.username}</span><VerifiedBadge verified={!!u.is_verified} size={14} />
                      </ALink>
                      <p className="truncate text-xs text-muted-foreground">@{u.username} · {u.account_type === "developer" ? "Developer" : u.account_type === "client" ? "Client" : "Belum memilih"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(u.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* Komunitas */}
      <Section title="Aktivitas komunitas" hint="Feed, pesan, repositori, dan kegiatan developer.">
        <MetricGrid items={communityMetrics} loading={community.isLoading} />
        <Panel title="Postingan feed per hari" hint="14 hari terakhir">
          {community.isLoading ? <Skeleton className="h-32" /> : <ColumnChart data={cm?.perDay ?? []} />}
        </Panel>
      </Section>

      {/* Marketplace */}
      <Section title="Marketplace dan GOBI Work" hint="Karya, jasa, lowongan, lamaran, kontrak, dan pesanan.">
        <MetricGrid items={marketMetrics} loading={market.isLoading || work.isLoading} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Status kontrak GOBI Work" hint="Semua kontrak berdasarkan statusnya">
            {market.isLoading ? <Skeleton className="h-24" /> : (
              <Stacked parts={[
                { label: "Draf", value: c?.draft ?? 0, cls: "bg-muted-foreground/40" },
                { label: "Menunggu persetujuan", value: c?.wait ?? 0, cls: "bg-amber-500" },
                { label: "Berjalan", value: c?.active ?? 0, cls: "bg-emerald-500" },
                { label: "Selesai", value: c?.done ?? 0, cls: "bg-primary" },
                { label: "Dibatalkan", value: c?.cancel ?? 0, cls: "bg-red-400" },
                { label: "Sengketa", value: c?.disp ?? 0, cls: "bg-red-600" },
              ]} />
            )}
          </Panel>
          <Panel title="Pembayaran masuk per hari" hint="14 hari terakhir, nilai dalam rupiah">
            {market.isLoading ? <Skeleton className="h-32" /> : <ColumnChart data={mk?.paidPerDay ?? []} fmt={(n) => formatRupiah(n, "Rp0")} empty="Belum ada pembayaran masuk dalam 14 hari terakhir." />}
          </Panel>
        </div>
      </Section>

      {/* Keuangan */}
      <Section title="Keuangan" hint="Uang yang masuk, ditahan, dan menunggu dicairkan.">
        <MetricGrid items={financeMetrics} loading={market.isLoading || actions.isLoading} cols="lg:grid-cols-3" />
        {work.isError && <p className="text-xs text-muted-foreground">Volume dan komisi GOBI Work butuh SQL di docs/sql/gobi-work/ dijalankan di database.</p>}
      </Section>

      {/* Aktivitas terbaru + fitur */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Aktivitas terbaru" hint="Gabungan kejadian terbaru di seluruh platform.">
          <div className="lg:col-span-2" />
        </Section>
      </div>
      <div className="-mt-[4.5rem] grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap gap-1.5 lg:mt-14" role="tablist" aria-label="Saring aktivitas">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                role="tab"
                aria-selected={group === g.key}
                onClick={() => setGroup(g.key)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium transition", group === g.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {timeline.isLoading && <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
            {!timeline.isLoading && shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Belum ada aktivitas untuk filter ini.</p>}
            <ul className="divide-y divide-border">
              {shown.map((e) => {
                const Icon = KIND_ICON[e.kind];
                const row = (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", e.group === "transaksi" ? ICON_TONE.ok : e.group === "admin" ? ICON_TONE.warn : e.group === "member" ? ICON_TONE.brand : ICON_TONE.default)}><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.sub}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.at)}</span>
                  </div>
                );
                return <li key={e.id}>{e.to ? <ALink to={e.to} params={e.params} className="block transition hover:bg-secondary/50">{row}</ALink> : row}</li>;
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">Menampilkan {shown.length} kejadian terbaru. Untuk riwayat lengkap dan pencarian, buka <ALink to="/admin/pantau" className="text-link hover:underline">Pantau aktivitas</ALink>.</p>
        </div>

        <div className="space-y-3 lg:mt-14">
          <Panel title="Fitur yang sedang dimatikan">
            {actions.isLoading && <Skeleton className="h-10" />}
            {a && a.off.length === 0 && <Empty>Semua fitur menyala.</Empty>}
            {a && a.off.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {a.off.map((k) => <li key={k} className="rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive">{featureLabel(k as FeatureKey)}</li>)}
              </ul>
            )}
            <ALink to="/admin/fitur" className="mt-3 inline-block text-sm text-link hover:underline">Atur fitur dan pengumuman</ALink>
          </Panel>
        </div>
      </div>
    </div>
  );
}
