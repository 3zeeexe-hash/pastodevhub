import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, Pill, Stat } from "@/components/work-ui";
import { ApplicationsTab, AuditTab, PayoutsTab, TransactionsTab } from "@/components/admin-work-extra";
import { CasesTab, DisputesTab2, ReportsTab2 } from "@/components/admin-work-cases";
import { ClientWithdrawalsTab } from "@/components/admin-client-withdrawals";
import { JobsTab, SettingsTab, UsersTab } from "@/components/admin-work-manage";

export const Route = createFileRoute("/admin/kerja")({ component: AdminWork });

function AdminWork() {
  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl bg-header-gradient p-5 text-white shadow-md sm:p-6">
        <div className="pointer-events-none absolute -left-12 bottom-0 size-40 rounded-full bg-primary/30 blur-2xl" />
        <div className="relative">
          <p className="font-mono text-sm font-semibold text-primary">admin · GOBI WORK</p>
          <h2 className="mt-1 text-2xl font-extrabold">Pusat kendali GOBI WORK</h2>
          <p className="mt-1 max-w-3xl text-sm text-white/80">
            Pengguna, moderasi lowongan, lamaran, kasus kontrak lengkap (lowongan, profil kedua pihak, pembayaran, riwayat), transaksi, sengketa, laporan, rekonsiliasi, kategori, komisi, dan audit log.
            Semua aksi mengubah data lewat fungsi database khusus admin dan tercatat di audit log; tab lamaran dan transaksi hanya untuk melihat. Penarikan saldo client diproses di tab Pencairan.
          </p>
        </div>
      </header>
      <Tabs defaultValue="ringkasan">
        <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-2xl bg-secondary/60 p-1.5">
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="laporan">Laporan</TabsTrigger>
          <TabsTrigger value="sengketa">Sengketa</TabsTrigger>
          <TabsTrigger value="kasus">Kasus & riwayat</TabsTrigger>
          <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
          <TabsTrigger value="pencairan">Pencairan</TabsTrigger>
          <TabsTrigger value="pengguna">Pengguna</TabsTrigger>
          <TabsTrigger value="lowongan">Lowongan</TabsTrigger>
          <TabsTrigger value="lamaran">Lamaran</TabsTrigger>
          <TabsTrigger value="rekonsiliasi">Rekonsiliasi</TabsTrigger>
          <TabsTrigger value="kategori">Kategori</TabsTrigger>
          <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="ringkasan" className="mt-4"><Overview /></TabsContent>
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

/* ---------- Ringkasan & analitik ---------- */
type AStats = Record<string, number>;
type Analytics = {
  monthly: { month: string; volume: number; commission: number; count: number }[];
  user_growth: { month: string; count: number }[];
  top_jobs: { id: string; title: string; applications: number }[];
  categories: { category: string; count: number }[];
  completed: number; cancelled: number; completion_rate: number | null;
};

function Bars({ rows, fmt }: { rows: { label: string; value: number }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[84px_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="tabular-nums">{fmt ? fmt(r.value) : r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Overview() {
  const s = useQuery({ queryKey: ["work-admin-stats"], queryFn: () => workRpc<AStats>("work_admin_stats") });
  const a = useQuery({ queryKey: ["work-admin-analytics"], queryFn: () => workRpc<Analytics>("work_admin_analytics") });
  return (
    <div className="space-y-6">
      {s.isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {s.error && <ErrorState error={s.error} onRetry={() => s.refetch()} />}
      {s.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total client" value={s.data.clients} />
          <Stat label="Total freelancer" value={s.data.freelancers} />
          <Stat label="Total lowongan" value={s.data.jobs} hint={`${s.data.jobs_pending_moderation} menunggu moderasi`} />
          <Stat label="Total lamaran" value={s.data.applications} />
          <Stat label="Proyek aktif" value={s.data.contracts_active} />
          <Stat label="Proyek selesai" value={s.data.contracts_completed} />
          <Stat label="Transaksi dibayar" value={s.data.transactions} hint={rp(s.data.volume)} />
          <Stat label="Komisi platform" value={rp(s.data.commission)} />
          <Stat label="Sengketa aktif" value={s.data.disputes_open} />
          <Stat label="Laporan terbuka" value={s.data.reports_open} />
        </div>
      )}
      {a.isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {a.error && <ErrorState error={a.error} onRetry={() => a.refetch()} />}
      {a.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Volume transaksi (6 bulan)">{a.data.monthly.length ? <Bars rows={a.data.monthly.map((m) => ({ label: m.month, value: Number(m.volume) }))} fmt={rp} /> : <None />}</Card>
          <Card title="Komisi (6 bulan)">{a.data.monthly.length ? <Bars rows={a.data.monthly.map((m) => ({ label: m.month, value: Number(m.commission) }))} fmt={rp} /> : <None />}</Card>
          <Card title="Pertumbuhan pengguna">{a.data.user_growth.length ? <Bars rows={a.data.user_growth.map((m) => ({ label: m.month, value: Number(m.count) }))} /> : <None />}</Card>
          <Card title="Kategori populer">{a.data.categories.length ? <Bars rows={a.data.categories.map((m) => ({ label: m.category, value: Number(m.count) }))} /> : <None />}</Card>
          <Card title="Lowongan terpopuler">
            {a.data.top_jobs.length ? <ul className="space-y-1 text-sm">{a.data.top_jobs.map((j) => <li key={j.id} className="flex justify-between gap-2"><Link to="/lowongan/$id" params={{ id: j.id }} className="truncate hover:text-primary">{j.title}</Link><span className="tabular-nums text-muted-foreground">{j.applications} pelamar</span></li>)}</ul> : <None />}
          </Card>
          <Card title="Tingkat penyelesaian proyek">
            <p className="text-3xl font-extrabold">{a.data.completion_rate === null ? "—" : `${a.data.completion_rate}%`}</p>
            <p className="text-xs text-muted-foreground">{a.data.completed} selesai · {a.data.cancelled} dibatalkan</p>
          </Card>
        </div>
      )}
    </div>
  );
}
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border"><h3 className="mb-3 text-sm font-extrabold">{title}</h3>{children}</section>;
const None = () => <p className="text-sm text-muted-foreground">Belum ada data.</p>;

/* ---------- Rekonsiliasi ---------- */
type Rec = { kind: string; ref_id: string; detail: string };
function ReconcileTab() {
  const [rows, setRows] = useState<Rec[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(apply: boolean) {
    if (apply && !confirm("Perbaiki item yang aman diperbaiki? Aksi ini tercatat di audit log.")) return;
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
