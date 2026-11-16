import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Briefcase, CheckCircle2, FileSignature, Percent, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { rp, workRpc } from "@/lib/work-db";
import { CONTRACT_STATUS_LABEL, type ContractStatus } from "@/lib/work";
import { bucketByDay, dayLabel, deltaPct, lastDays, lastTwo, monthLabel, pct, rpCompact } from "@/lib/admin-work-activity";
import { cn } from "@/lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/work-ui";

type AStats = {
  clients: number; freelancers: number; jobs: number; jobs_pending_moderation: number; applications: number;
  contracts_active: number; contracts_completed: number; transactions: number; volume: number; commission: number;
  disputes_open: number; reports_open: number;
};
type Analytics = {
  monthly: { month: string; volume: number; commission: number; count: number }[];
  user_growth: { month: string; count: number }[];
  top_jobs: { id: string; title: string; applications: number }[];
  categories: { category: string; count: number }[];
  completed: number; cancelled: number; completion_rate: number | null;
};

const STATUSES: ContractStatus[] = ["draft", "waiting_approval", "active", "completed", "cancelled", "disputed"];
const STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "var(--muted-foreground)", waiting_approval: "var(--chart-3)", active: "var(--chart-1)",
  completed: "var(--success)", cancelled: "var(--destructive)", disputed: "var(--chart-5)",
};
const DAYS = 14;
const REFRESH = 60_000;

type Extra = { statuses: Record<ContractStatus, number>; days: string[]; applications: number[]; contracts: number[]; cases: number[] };

async function loadExtra(): Promise<Extra> {
  const days = lastDays(DAYS);
  const since = new Date(`${days[0]}T00:00:00`).toISOString();
  const created = async (table: string) => {
    const { data, error } = await looseDb.from(table).select("created_at").gte("created_at", since).limit(5000);
    if (error) throw error;
    return ((data ?? []) as { created_at: string }[]).map((r) => r.created_at);
  };
  const countStatus = async (s: ContractStatus) => {
    const { count, error } = await looseDb.from("work_contracts").select("*", { count: "exact", head: true }).eq("status", s);
    if (error) throw error;
    return count ?? 0;
  };
  const [counts, apps, contracts, reports, disputes] = await Promise.all([
    Promise.all(STATUSES.map(countStatus)), created("job_applications"), created("work_contracts"), created("work_reports"), created("work_disputes"),
  ]);
  const statuses = Object.fromEntries(STATUSES.map((s, i) => [s, counts[i]])) as Record<ContractStatus, number>;
  const r = bucketByDay(reports, days), d = bucketByDay(disputes, days);
  return { statuses, days, applications: bucketByDay(apps, days), contracts: bucketByDay(contracts, days), cases: r.map((n, i) => n + (d[i] ?? 0)) };
}

function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">belum ada pembanding</span>;
  if (value === 0) return <span className="text-xs text-muted-foreground">sama seperti bulan lalu</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      <Icon className="size-3.5" aria-hidden /> {Math.abs(value)}% <span className="sr-only">{up ? "naik" : "turun"}</span><span className="font-normal text-muted-foreground">vs bulan lalu</span>
    </span>
  );
}

function Kpi({ icon: Icon, label, value, children, tone = "brand" }: { icon: typeof Wallet; label: string; value: ReactNode; children?: ReactNode; tone?: "brand" | "ok" | "info" | "warn" }) {
  const toneCls = { brand: "bg-primary/15 text-primary", ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", info: "bg-sky-500/15 text-sky-600 dark:text-sky-400", warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }[tone];
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-full", toneCls)}><Icon className="size-4" aria-hidden /></span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
      <div className="mt-0.5 min-h-4">{children}</div>
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: ReactNode; hint?: string | undefined }) {
  return (
    <div className="rounded-xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-border">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, sub, children, className }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <h3 className="text-sm font-extrabold">{title}</h3>
      {sub && <p className="mb-3 text-xs text-muted-foreground">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}
const None = ({ children = "Belum ada data." }: { children?: ReactNode }) => <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const;
const moneyTip = (labels: Record<string, string>) => (v: unknown, name: unknown) => (
  <div className="flex w-full items-center justify-between gap-3"><span className="text-muted-foreground">{labels[String(name)] ?? String(name)}</span><span className="font-mono font-medium">{rp(Number(v))}</span></div>
);

export function WorkOverview() {
  const s = useQuery({ queryKey: ["work-admin-stats"], queryFn: () => workRpc<AStats>("work_admin_stats"), refetchInterval: REFRESH });
  const a = useQuery({ queryKey: ["work-admin-analytics"], queryFn: () => workRpc<Analytics>("work_admin_analytics"), refetchInterval: REFRESH });
  const x = useQuery({ queryKey: ["work-admin-extra"], queryFn: loadExtra, refetchInterval: REFRESH });

  const monthly = a.data?.monthly ?? [];
  const { cur, prev } = lastTwo(monthly);
  const volDelta = cur ? deltaPct(Number(cur.volume), prev ? Number(prev.volume) : null) : null;
  const comDelta = cur ? deltaPct(Number(cur.commission), prev ? Number(prev.commission) : null) : null;
  const growth = lastTwo(a.data?.user_growth ?? []);
  const growthDelta = growth.cur ? deltaPct(Number(growth.cur.count), growth.prev ? Number(growth.prev.count) : null) : null;

  const st = s.data;
  const volume = Number(st?.volume ?? 0);
  const commission = Number(st?.commission ?? 0);
  const trx = Number(st?.transactions ?? 0);
  const contractsMade = x.data ? STATUSES.filter((k) => k !== "draft").reduce((n, k) => n + x.data!.statuses[k], 0) : 0;

  const monthlyRows = monthly.map((m) => ({ label: monthLabel(m.month), volume: Number(m.volume), commission: Number(m.commission) }));
  const growthRows = (a.data?.user_growth ?? []).map((m) => ({ label: monthLabel(m.month), count: Number(m.count) }));
  const catRows = (a.data?.categories ?? []).map((c) => ({ label: c.category, count: Number(c.count) })).slice(0, 8);
  const activityRows = x.data ? x.data.days.map((d, i) => ({ label: dayLabel(d), Lamaran: x.data!.applications[i], Kontrak: x.data!.contracts[i], Kasus: x.data!.cases[i] })) : [];
  const pieRows = x.data ? STATUSES.map((k) => ({ key: k, name: CONTRACT_STATUS_LABEL[k], value: x.data!.statuses[k] })).filter((r) => r.value > 0) : [];
  const totalContracts = pieRows.reduce((n, r) => n + r.value, 0);

  const funnel = st && x.data ? [
    { label: "Lowongan", value: Number(st.jobs), note: `${st.jobs_pending_moderation} menunggu moderasi` },
    { label: "Lamaran", value: Number(st.applications), note: Number(st.jobs) > 0 ? `rata-rata ${(Number(st.applications) / Number(st.jobs)).toFixed(1).replace(".", ",")} per lowongan` : "" },
    { label: "Kontrak dibuat", value: contractsMade, note: pct(contractsMade, Number(st.applications)) === null ? "" : `${pct(contractsMade, Number(st.applications))}% dari lamaran` },
    { label: "Selesai", value: x.data.statuses.completed, note: pct(x.data.statuses.completed, contractsMade) === null ? "" : `${pct(x.data.statuses.completed, contractsMade)}% dari kontrak` },
  ] : [];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const volumeCfg: ChartConfig = { volume: { label: "Volume", color: "var(--chart-1)" }, commission: { label: "Komisi", color: "var(--chart-2)" } };
  const growthCfg: ChartConfig = { count: { label: "Pengguna baru", color: "var(--chart-4)" } };
  const catCfg: ChartConfig = { count: { label: "Lowongan", color: "var(--chart-3)" } };
  const actCfg: ChartConfig = { Lamaran: { label: "Lamaran", color: "var(--chart-1)" }, Kontrak: { label: "Kontrak", color: "var(--success)" }, Kasus: { label: "Laporan & sengketa", color: "var(--destructive)" } };
  const pieCfg = Object.fromEntries(STATUSES.map((k) => [k, { label: CONTRACT_STATUS_LABEL[k], color: STATUS_COLOR[k] }])) as ChartConfig;

  return (
    <div className="space-y-6">
      {/* Angka utama */}
      {s.isLoading && <Skeleton className="h-64 rounded-2xl" />}
      {s.error && <ErrorState error={s.error} onRetry={() => s.refetch()} />}
      {st && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Wallet} label="Volume transaksi" value={rp(volume)}><span className="text-xs text-muted-foreground">{trx} transaksi dibayar · </span><Delta value={volDelta} /></Kpi>
            <Kpi icon={TrendingUp} label="Komisi platform" value={rp(commission)} tone="ok"><Delta value={comDelta} /></Kpi>
            <Kpi icon={FileSignature} label="Proyek aktif" value={Number(st.contracts_active)} tone="info"><span className="text-xs text-muted-foreground">{Number(st.contracts_completed)} sudah selesai</span></Kpi>
            <Kpi icon={CheckCircle2} label="Tingkat penyelesaian" value={a.data ? (a.data.completion_rate === null ? "—" : `${a.data.completion_rate}%`) : "…"} tone="ok"><span className="text-xs text-muted-foreground">{a.data ? `${a.data.completed} selesai · ${a.data.cancelled} dibatalkan` : ""}</span></Kpi>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Mini label="Client" value={Number(st.clients)} />
            <Mini label="Freelancer" value={Number(st.freelancers)} hint={growthDelta === null ? undefined : `${growthDelta >= 0 ? "+" : ""}${growthDelta}% pendaftar bulan ini`} />
            <Mini label="Lowongan" value={Number(st.jobs)} hint={`${st.jobs_pending_moderation} menunggu moderasi`} />
            <Mini label="Lamaran" value={Number(st.applications)} />
            <Mini label="Rata-rata transaksi" value={trx > 0 ? rpCompact(volume / trx) : "—"} />
            <Mini label="Komisi dari volume" value={volume > 0 ? `${((commission / volume) * 100).toFixed(1).replace(".", ",")}%` : "—"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/admin/kerja" search={{ tab: "sengketa" }} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition hover:ring-primary/50">
              <span><span className="block text-xs text-muted-foreground">Sengketa aktif</span><span className="text-2xl font-extrabold tabular-nums">{Number(st.disputes_open)}</span></span>
              <Receipt className="size-5 text-muted-foreground" aria-hidden />
            </Link>
            <Link to="/admin/kerja" search={{ tab: "laporan" }} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition hover:ring-primary/50">
              <span><span className="block text-xs text-muted-foreground">Laporan terbuka</span><span className="text-2xl font-extrabold tabular-nums">{Number(st.reports_open)}</span></span>
              <Users className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </>
      )}

      {/* Grafik */}
      {a.error && <ErrorState error={a.error} onRetry={() => a.refetch()} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Volume & komisi per bulan" sub="Batang = volume transaksi (kiri), garis = komisi platform (kanan). 6 bulan terakhir.">
          {a.isLoading ? <Skeleton className="h-56 rounded-xl" /> : monthlyRows.length === 0 ? <None /> : (
            <ChartContainer config={volumeCfg} className="h-56 w-full" role="img" aria-label="Grafik volume transaksi dan komisi per bulan">
              <ComposedChart data={monthlyRows} margin={{ left: 0, right: 0, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis yAxisId="l" width={62} tickFormatter={rpCompact} {...axis} />
                <YAxis yAxisId="r" orientation="right" width={62} tickFormatter={rpCompact} {...axis} />
                <ChartTooltip content={<ChartTooltipContent formatter={moneyTip({ volume: "Volume", commission: "Komisi" })} />} />
                <Bar yAxisId="l" dataKey="volume" fill="var(--color-volume)" radius={[6, 6, 0, 0]} />
                <Line yAxisId="r" dataKey="commission" type="monotone" stroke="var(--color-commission)" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ChartContainer>
          )}
        </Card>

        <Card title={`Aktivitas ${DAYS} hari terakhir`} sub="Lamaran, kontrak baru, serta laporan dan sengketa per hari.">
          {x.isLoading ? <Skeleton className="h-56 rounded-xl" /> : x.error ? <ErrorState error={x.error} onRetry={() => x.refetch()} /> : activityRows.every((r) => !r.Lamaran && !r.Kontrak && !r.Kasus) ? <None>Belum ada aktivitas dalam {DAYS} hari terakhir.</None> : (
            <ChartContainer config={actCfg} className="h-56 w-full" role="img" aria-label="Grafik aktivitas harian GOBI WORK">
              <LineChart data={activityRows} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" interval={1} {...axis} />
                <YAxis allowDecimals={false} width={28} {...axis} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="Lamaran" type="monotone" stroke="var(--color-Lamaran)" strokeWidth={2.5} dot={false} />
                <Line dataKey="Kontrak" type="monotone" stroke="var(--color-Kontrak)" strokeWidth={2.5} dot={false} />
                <Line dataKey="Kasus" type="monotone" stroke="var(--color-Kasus)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ChartContainer>
          )}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(["Lamaran", "Kontrak", "Kasus"] as const).map((k) => <li key={k} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: `var(--color-${k}, ${actCfg[k]?.color ?? "currentColor"})` }} />{actCfg[k]?.label}{x.data ? `: ${(k === "Lamaran" ? x.data.applications : k === "Kontrak" ? x.data.contracts : x.data.cases).reduce((n, v) => n + v, 0)}` : ""}</li>)}
          </ul>
        </Card>

        <Card title="Status kontrak" sub="Sebaran seluruh kontrak GOBI WORK saat ini.">
          {x.isLoading ? <Skeleton className="h-56 rounded-xl" /> : pieRows.length === 0 ? <None>Belum ada kontrak.</None> : (
            <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
              <ChartContainer config={pieCfg} className="mx-auto h-48 w-48" role="img" aria-label="Diagram donat status kontrak">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
                  <Pie data={pieRows} dataKey="value" nameKey="key" innerRadius={52} outerRadius={84} paddingAngle={2} strokeWidth={0}>
                    {pieRows.map((r) => <Cell key={r.key} fill={STATUS_COLOR[r.key]} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <ul className="space-y-1.5 text-sm">
                {pieRows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[r.key] }} />{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{r.value} <span className="text-xs">({pct(r.value, totalContracts)}%)</span></span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1.5 font-semibold"><span>Total</span><span className="tabular-nums">{totalContracts}</span></li>
              </ul>
            </div>
          )}
        </Card>

        <Card title="Corong GOBI WORK" sub="Dari lowongan sampai proyek selesai.">
          {s.isLoading || x.isLoading ? <Skeleton className="h-56 rounded-xl" /> : funnel.length === 0 ? <None /> : (
            <ol className="space-y-3">
              {funnel.map((f, i) => (
                <li key={f.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{i + 1}. {f.label}</span><span className="font-bold tabular-nums">{f.value}</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, (f.value / funnelMax) * 100)}%`, opacity: 1 - i * 0.15 }} /></div>
                  {f.note && <p className="mt-0.5 text-xs text-muted-foreground">{f.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Pertumbuhan pengguna" sub="Pendaftar baru per bulan.">
          {a.isLoading ? <Skeleton className="h-48 rounded-xl" /> : growthRows.length === 0 ? <None /> : (
            <ChartContainer config={growthCfg} className="h-48 w-full" role="img" aria-label="Grafik pertumbuhan pengguna per bulan">
              <BarChart data={growthRows} margin={{ left: 0, right: 0, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...axis} />
                <YAxis allowDecimals={false} width={32} {...axis} />
                <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </Card>

        <Card title="Kategori populer" sub="Jumlah lowongan per kategori.">
          {a.isLoading ? <Skeleton className="h-48 rounded-xl" /> : catRows.length === 0 ? <None /> : (
            <ChartContainer config={catCfg} className="w-full" style={{ height: Math.max(160, catRows.length * 34) }} role="img" aria-label="Grafik kategori lowongan populer">
              <BarChart data={catRows} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axis} />
                <YAxis type="category" dataKey="label" width={96} {...axis} />
                <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </Card>

        <Card title="Lowongan terpopuler" sub="Berdasarkan jumlah pelamar." className="lg:col-span-2">
          {a.isLoading ? <Skeleton className="h-24 rounded-xl" /> : !a.data?.top_jobs.length ? <None /> : (
            <ol className="divide-y divide-border text-sm">
              {a.data.top_jobs.map((j, i) => (
                <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{i + 1}</span><Link to="/lowongan/$id" params={{ id: j.id }} className="truncate hover:text-primary">{j.title}</Link></span>
                  <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground"><Briefcase className="size-3.5" aria-hidden />{j.applications} pelamar</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Percent className="size-3" aria-hidden /> Data diperbarui otomatis tiap menit. Volume dan komisi hanya dihitung dari pesanan yang sudah dibayar.</p>
    </div>
  );
}
