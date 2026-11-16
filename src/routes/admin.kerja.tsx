import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, CheckCheck, CheckCircle2, ChevronRight, Flag, Loader2, RefreshCw, Scale, ShieldCheck, Wallet } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import { workRpc } from "@/lib/work-db";
import { sumCounts } from "@/lib/admin-work-activity";
import { markWorkSeen, useAdminWorkActivity, useMarkSeenOnLeave, useRefreshWorkAdmin } from "@/lib/use-admin-work-activity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, Pill } from "@/components/work-ui";
import { WorkOverview } from "@/components/admin-work-overview";
import { ApplicationsTab, AuditTab, PayoutsTab, TransactionsTab } from "@/components/admin-work-extra";
import { CasesTab, DisputesTab2, ReportsTab2 } from "@/components/admin-work-cases";
import { ClientWithdrawalsTab } from "@/components/admin-client-withdrawals";
import { JobsTab, SettingsTab, UsersTab } from "@/components/admin-work-manage";
import { useAskAdmin } from "@/lib/admin-ask";

const TAB_KEYS = ["ringkasan", "laporan", "sengketa", "kasus", "transaksi", "pencairan", "pengguna", "lowongan", "lamaran", "rekonsiliasi", "kategori", "pengaturan", "audit"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const searchSchema = z.object({ tab: z.enum(TAB_KEYS).optional().catch(undefined) });

export const Route = createFileRoute("/admin/kerja")({ validateSearch: searchSchema, component: AdminWork });

const TAB_LABEL: Record<TabKey, string> = {
  ringkasan: "Ringkasan", laporan: "Laporan", sengketa: "Sengketa", kasus: "Kasus & riwayat", transaksi: "Transaksi", pencairan: "Pencairan",
  pengguna: "Pengguna", lowongan: "Lowongan", lamaran: "Lamaran", rekonsiliasi: "Rekonsiliasi", kategori: "Kategori", pengaturan: "Pengaturan", audit: "Audit log",
};

type Todo = { tab: TabKey; label: string; hint: string; n: number; fresh: number; Icon: ComponentType<{ className?: string }> };

function CountPill({ n, tone }: { n: number; tone: "red" | "blue" }) {
  if (!n) return null;
  return <span className={cn("ml-1.5 min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] leading-5 text-white", tone === "red" ? "bg-red-500" : "bg-sky-500")}>{tone === "blue" ? "+" : ""}{n > 99 ? "99+" : n}</span>;
}

function AdminWork() {
  const { tab = "ringkasan" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (t: string) => void navigate({ search: { tab: (TAB_KEYS as readonly string[]).includes(t) ? (t as TabKey) : "ringkasan" }, replace: true });
  const activity = useAdminWorkActivity();
  const refresh = useRefreshWorkAdmin();
  const [spin, setSpin] = useState(false);
  useMarkSeenOnLeave();

  const a = activity.data;
  const todos: Todo[] = a ? [
    { tab: "laporan", label: "Laporan terbuka", hint: "Laporan dari pengguna yang belum ditutup", n: a.pending.reports, fresh: a.fresh.reports, Icon: Flag },
    { tab: "sengketa", label: "Sengketa aktif", hint: "Dana tertahan sampai admin memutuskan", n: a.pending.disputes, fresh: a.fresh.disputes, Icon: Scale },
    { tab: "lowongan", label: "Lowongan menunggu moderasi", hint: "Belum tayang sebelum disetujui", n: a.pending.jobs, fresh: a.fresh.jobs, Icon: ShieldCheck },
    { tab: "pencairan", label: "Pencairan client", hint: "Permintaan penarikan saldo client", n: a.pending.withdrawals, fresh: a.fresh.withdrawals, Icon: Wallet },
  ] : [];
  const badge: Partial<Record<TabKey, { todo?: number; fresh?: number }>> = a ? {
    laporan: { todo: a.pending.reports }, sengketa: { todo: a.pending.disputes }, lowongan: { todo: a.pending.jobs },
    pencairan: { todo: a.pending.withdrawals }, lamaran: { fresh: a.fresh.applications }, kasus: { fresh: a.fresh.contracts },
  } : {};

  async function reload() {
    setSpin(true);
    try { await refresh(); toast.success("Data diperbarui"); } finally { setSpin(false); }
  }

  return (
    <div className="space-y-5">
      {/* Bilah status: pembaruan terakhir, muat ulang, tandai dilihat */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" /></span>
          Pantauan langsung · diperbarui otomatis tiap 30 detik
          {activity.dataUpdatedAt ? <span className="hidden sm:inline">· terakhir {new Date(activity.dataUpdatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
        </p>
        <div className="flex gap-2">
          {a && a.totalFresh > 0 && <Button size="sm" variant="outline" className="rounded-full" onClick={() => { markWorkSeen(); toast.success("Semua pembaruan ditandai sudah dilihat"); }}><CheckCheck /> Tandai sudah dilihat ({a.totalFresh})</Button>}
          <Button size="sm" variant="outline" className="rounded-full" disabled={spin} onClick={reload}><RefreshCw className={cn(spin && "animate-spin")} /> Muat ulang</Button>
        </div>
      </div>

      {/* Pusat tindakan */}
      <section aria-labelledby="todo-h">
        <h2 id="todo-h" className="mb-2 flex items-center gap-2 text-sm font-extrabold">
          Perlu ditindaklanjuti
          {a && a.totalPending > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 font-mono text-[11px] text-white">{a.totalPending}</span>}
        </h2>
        {activity.isLoading && <Skeleton className="h-24 rounded-2xl" />}
        {activity.error && <ErrorState error={activity.error} onRetry={() => activity.refetch()} />}
        {a && sumCounts(a.pending) === 0 && (
          <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-5 shrink-0" aria-hidden /> Semua beres. Tidak ada laporan, sengketa, lowongan, atau pencairan yang menunggu.</p>
        )}
        {a && sumCounts(a.pending) > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {todos.map((t) => (
              <li key={t.tab}>
                <button type="button" onClick={() => go(t.tab)} className={cn("group flex h-full w-full flex-col rounded-2xl p-4 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md", t.n > 0 ? "bg-red-500/5 ring-red-500/30" : "bg-card ring-border")}>
                  <span className="flex items-center justify-between"><t.Icon className={cn("size-5", t.n > 0 ? "text-red-500" : "text-muted-foreground")} /><ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden /></span>
                  <span className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-extrabold tabular-nums">{t.n}</span>{t.fresh > 0 && <span className="rounded-full bg-sky-500 px-1.5 font-mono text-[11px] leading-5 text-white">+{t.fresh} baru</span>}</span>
                  <span className="mt-1 text-sm font-semibold">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.n > 0 ? t.hint : "Beres"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {a && a.totalFresh > 0 && (a.fresh.applications > 0 || a.fresh.contracts > 0) && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 text-sky-500" aria-hidden /> Sejak kunjungan terakhir:
            {a.fresh.applications > 0 && <button type="button" className="font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-400" onClick={() => go("lamaran")}>{a.fresh.applications} lamaran baru</button>}
            {a.fresh.contracts > 0 && <button type="button" className="font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-400" onClick={() => go("kasus")}>{a.fresh.contracts} kontrak baru</button>}
          </p>
        )}
      </section>

      <Tabs value={tab} onValueChange={go}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-secondary/60 p-1.5">
          {TAB_KEYS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {TAB_LABEL[k]}
              <CountPill n={badge[k]?.todo ?? 0} tone="red" />
              <CountPill n={badge[k]?.fresh ?? 0} tone="blue" />
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="ringkasan" className="mt-4"><WorkOverview /></TabsContent>
        <TabsContent value="laporan" className="mt-4"><ReportsTab2 /></TabsContent>
        <TabsContent value="sengketa" className="mt-4"><DisputesTab2 /></TabsContent>
        <TabsContent value="kasus" className="mt-4"><CasesTab /></TabsContent>
        <TabsContent value="transaksi" className="mt-4"><TransactionsTab /></TabsContent>
        <TabsContent value="pencairan" className="mt-4 space-y-8"><PayoutsTab /><ClientWithdrawalsTab /></TabsContent>
        <TabsContent value="pengguna" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="lowongan" className="mt-4"><JobsTab /></TabsContent>
        <TabsContent value="lamaran" className="mt-4"><ApplicationsTab /></TabsContent>
        <TabsContent value="rekonsiliasi" className="mt-4"><ReconcileTab /></TabsContent>
        <TabsContent value="kategori" className="mt-4"><CategoriesTab /></TabsContent>
        <TabsContent value="pengaturan" className="mt-4"><SettingsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Rekonsiliasi ---------- */
type Rec = { kind: string; ref_id: string; detail: string };
function ReconcileTab() {
  const ask = useAskAdmin();
  const [rows, setRows] = useState<Rec[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(apply: boolean) {
    if (apply && !(await ask({ title: "Perbaiki item yang aman?", description: "Hanya item yang aman diperbaiki yang diubah. Aksi ini tercatat di audit log.", confirmLabel: "Perbaiki" }))) return;
    setBusy(true);
    try { setRows(await workRpc<Rec[]>("work_admin_reconcile", { _apply: apply })); if (apply) toast.success("Rekonsiliasi dijalankan"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Mencocokkan pesanan Midtrans yang sudah dibayar dengan status milestone dan catatan escrow. "Periksa" hanya melaporkan; "Perbaiki" hanya mengubah yang aman.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => run(false)}>{busy && <Loader2 className="animate-spin" />} Periksa</Button>
        <Button className="rounded-full" disabled={busy} onClick={() => run(true)}>Perbaiki yang aman</Button>
      </div>
      {rows && rows.length === 0 && <EmptyState>Semua cocok. Tidak ada selisih.</EmptyState>}
      <ul className="space-y-2">
        {rows?.map((r, i) => (
          <li key={`${r.ref_id}-${i}`} className="rounded-xl bg-card p-3 text-sm shadow-sm ring-1 ring-border"><Pill tone={r.kind === "diperbaiki" ? "ok" : "warn"}>{r.kind}</Pill> <span className="ml-1">{r.detail}</span></li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Kategori ---------- */
type Cat = { slug: string; label: string; sort_order: number; active: boolean };
function CategoriesTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["work-admin-cats"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("job_categories").select("slug,label,sort_order,active").order("sort_order");
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as Cat[];
    },
  });
  const [f, setF] = useState({ slug: "", label: "", sort: "99" });
  async function save(c: { slug: string; label: string; active: boolean; sort: number }) {
    try { await workRpc("work_admin_set_category", { _slug: c.slug, _label: c.label, _active: c.active, _sort: c.sort }); toast.success("Kategori disimpan"); qc.invalidateQueries({ queryKey: ["work-admin-cats"] }); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-4">
      {q.isLoading && <Skeleton className="h-28 rounded-2xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <ul className="space-y-1.5">
        {q.data?.map((c) => (
          <li key={c.slug} className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2 text-sm shadow-sm ring-1 ring-border">
            <span className="min-w-0 truncate">{c.label} <span className="font-mono text-xs text-muted-foreground">{c.slug}</span></span>
            <Switch checked={c.active} aria-label={`Aktifkan ${c.label}`} onCheckedChange={(v) => save({ slug: c.slug, label: c.label, active: v, sort: c.sort_order })} />
          </li>
        ))}
      </ul>
      <form className="grid gap-2 rounded-2xl border border-dashed border-border p-3 md:grid-cols-[1fr_1fr_100px_auto]" onSubmit={(e) => { e.preventDefault(); save({ slug: f.slug.trim(), label: f.label.trim(), active: true, sort: Math.round(Number(f.sort) || 0) }).then(() => setF({ slug: "", label: "", sort: "99" })); }}>
        <div className="space-y-1.5"><Label htmlFor="cs">Slug</Label><Input id="cs" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="game-development" /></div>
        <div className="space-y-1.5"><Label htmlFor="cl">Nama</Label><Input id="cl" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="co">Urutan</Label><Input id="co" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></div>
        <div className="flex items-end"><Button type="submit" className="rounded-full">Tambah / ubah</Button></div>
      </form>
    </div>
  );
}
