import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { CONTRACT_SELECT, fmtDate, personName, rp, workRpc, type ContractRow } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContractPill, EmptyState, ErrorState, Pill, ReasonDialog, Stat, type Ask } from "@/components/work-ui";
import { ApplicationsTab, AuditTab, DisputeDetail, PayoutsTab, TransactionsTab, UsersTab } from "@/components/admin-work-extra";

export const Route = createFileRoute("/admin/kerja")({ component: AdminWork });

function AdminWork() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">GOBI WORK</h2>
        <p className="text-sm text-muted-foreground">Moderasi lowongan, kontrak, sengketa, laporan, transaksi, rekonsiliasi, kategori, dan audit log. Aksi mengubah data lewat fungsi database khusus admin dan tercatat di audit log; tab pengguna, lamaran, transaksi, dan pencairan hanya untuk melihat.</p>
      </header>
      <Tabs defaultValue="ringkasan">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="pengguna">Pengguna</TabsTrigger>
          <TabsTrigger value="lowongan">Lowongan</TabsTrigger>
          <TabsTrigger value="lamaran">Lamaran</TabsTrigger>
          <TabsTrigger value="kontrak">Kontrak</TabsTrigger>
          <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
          <TabsTrigger value="pencairan">Pencairan</TabsTrigger>
          <TabsTrigger value="sengketa">Sengketa</TabsTrigger>
          <TabsTrigger value="laporan">Laporan</TabsTrigger>
          <TabsTrigger value="rekonsiliasi">Rekonsiliasi</TabsTrigger>
          <TabsTrigger value="kategori">Kategori</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="ringkasan" className="mt-4"><Overview /></TabsContent>
        <TabsContent value="pengguna" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="lowongan" className="mt-4"><JobsTab /></TabsContent>
        <TabsContent value="lamaran" className="mt-4"><ApplicationsTab /></TabsContent>
        <TabsContent value="kontrak" className="mt-4"><ContractsTab /></TabsContent>
        <TabsContent value="transaksi" className="mt-4"><TransactionsTab /></TabsContent>
        <TabsContent value="pencairan" className="mt-4"><PayoutsTab /></TabsContent>
        <TabsContent value="sengketa" className="mt-4"><DisputesTab /></TabsContent>
        <TabsContent value="laporan" className="mt-4"><ReportsTab /></TabsContent>
        <TabsContent value="rekonsiliasi" className="mt-4"><ReconcileTab /></TabsContent>
        <TabsContent value="kategori" className="mt-4"><CategoriesTab /></TabsContent>
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
      {s.isLoading && <Skeleton className="h-40 rounded-xl" />}
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
      {a.isLoading && <Skeleton className="h-40 rounded-xl" />}
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
            <p className="text-3xl font-bold">{a.data.completion_rate === null ? "—" : `${a.data.completion_rate}%`}</p>
            <p className="text-xs text-muted-foreground">{a.data.completed} selesai · {a.data.cancelled} dibatalkan</p>
          </Card>
        </div>
      )}
    </div>
  );
}
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-xl border border-border bg-card p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</section>;
const None = () => <p className="text-sm text-muted-foreground">Belum ada data.</p>;

/* ---------- Moderasi lowongan ---------- */
type JobRow = { id: string; title: string; status: string; moderation_status: string | null; moderation_note: string | null; category: string; created_at: string; client: { username: string } | null };
function JobsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-jobs", filter],
    queryFn: async () => {
      let query = looseDb.from("jobs").select("id,title,status,moderation_status,moderation_note,category,created_at,client:profiles(username)").order("created_at", { ascending: false }).limit(100);
      if (filter !== "all") query = query.eq("moderation_status", filter);
      const { data, error } = await query;
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as unknown as JobRow[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-jobs"] }); qc.invalidateQueries({ queryKey: ["work-admin-stats"] }); };
  async function moderate(id: string, status: string, note = "") {
    try { await workRpc("work_admin_moderate_job", { _job_id: id, _status: status, _note: note }); toast.success("Moderasi disimpan"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="pending">Menunggu moderasi</SelectItem><SelectItem value="approved">Disetujui</SelectItem><SelectItem value="rejected">Ditolak</SelectItem><SelectItem value="all">Semua</SelectItem></SelectContent>
        </Select>
      </div>
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState>Tidak ada lowongan pada filter ini.</EmptyState>}
      <ul className="space-y-2">
        {q.data?.map((j) => (
          <li key={j.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to="/lowongan/$id" params={{ id: j.id }} className="font-semibold hover:text-primary">{j.title}</Link>
              <Pill tone={j.moderation_status === "rejected" ? "bad" : j.moderation_status === "pending" ? "warn" : "ok"}>{j.moderation_status ?? "approved"}</Pill>
            </div>
            <p className="text-xs text-muted-foreground">@{j.client?.username ?? "?"} · {j.category} · {j.status} · {timeAgo(j.created_at)}</p>
            {j.moderation_note && <p className="mt-1 text-xs">Catatan: {j.moderation_note}</p>}
            <div className="mt-2 flex gap-2">
              {j.moderation_status !== "approved" && <Button size="sm" onClick={() => moderate(j.id, "approved")}>Setujui</Button>}
              {j.moderation_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => setAsk({ title: "Tolak lowongan", label: "Alasan penolakan (dilihat pemilik)", min: 3, confirm: "Tolak", onSubmit: async (t) => { await moderate(j.id, "rejected", t); } })}>Tolak</Button>}
            </div>
          </li>
        ))}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

/* ---------- Kontrak ---------- */
function ContractsTab() {
  const q = useQuery({
    queryKey: ["work-admin-contracts"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_contracts").select(CONTRACT_SELECT).order("updated_at", { ascending: false }).limit(100);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as ContractRow[];
    },
  });
  return (
    <div className="space-y-3">
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState>Belum ada kontrak.</EmptyState>}
      <ul className="space-y-2">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link to="/kerja/kontrak/$id" params={{ id: c.id }} className="block rounded-xl border border-border bg-card p-4 hover:border-primary/50">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{c.title}</span><ContractPill status={c.status} /></div>
              <p className="text-xs text-muted-foreground">{personName(c.client)} → {personName(c.freelancer)} · {c.payment_type === "fixed" ? rp(c.total_amount) : `${rp(c.hourly_rate)}/jam`} · {fmtDate(c.created_at)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Sengketa ---------- */
type DisputeAdmin = {
  id: string; contract_id: string; milestone_id: string | null; reason: string; status: string; decision: string | null; decision_note: string | null; created_at: string;
  contract: { title: string } | null;
};
function DisputesTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["work-admin-disputes"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_disputes").select("id,contract_id,milestone_id,reason,status,decision,decision_note,created_at,contract:work_contracts(title)").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as unknown as DisputeAdmin[];
    },
  });
  const [target, setTarget] = useState<DisputeAdmin | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [decision, setDecision] = useState("favor_freelancer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide() {
    if (!target) return;
    if (note.trim().length < 10) { toast.error("Catatan keputusan minimal 10 karakter."); return; }
    setBusy(true);
    try {
      await workRpc("work_admin_decide_dispute", { _dispute_id: target.id, _decision: decision, _note: note.trim() });
      toast.success("Keputusan dicatat");
      setTarget(null); setNote("");
      qc.invalidateQueries({ queryKey: ["work-admin-disputes"] }); qc.invalidateQueries({ queryKey: ["work-admin-stats"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState>Belum ada sengketa.</EmptyState>}
      <ul className="space-y-2">
        {q.data?.map((d) => (
          <li key={d.id} className="rounded-xl border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to="/kerja/kontrak/$id" params={{ id: d.contract_id }} className="font-semibold hover:text-primary">{d.contract?.title ?? "Kontrak"}</Link>
              <Pill tone={d.status === "resolved" ? "ok" : "bad"}>{d.status === "resolved" ? "Diputuskan" : "Terbuka"}</Pill>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{d.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">{timeAgo(d.created_at)}</p>
            {d.decision && <p className="mt-2 rounded-md bg-muted p-2"><b>{d.decision}</b>: {d.decision_note}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDetail(d.id)}>Bukti & riwayat</Button>
              {d.status !== "resolved" && <Button size="sm" onClick={() => setTarget(d)}>Putuskan</Button>}
            </div>
          </li>
        ))}
      </ul>
      <DisputeDetail disputeId={detail} onClose={() => setDetail(null)} />
      <Dialog open={!!target} onOpenChange={(o) => !busy && !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Putuskan sengketa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Keputusan</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="favor_freelancer">Menangkan freelancer (milestone disetujui, dana kembali ditahan untuk diteruskan)</SelectItem>
                  <SelectItem value="favor_client">Menangkan client (dana dikembalikan, pesanan dibatalkan)</SelectItem>
                  <SelectItem value="split">Bagi dana (diselesaikan manual admin)</SelectItem>
                  <SelectItem value="dismissed">Tolak sengketa (pekerjaan berlanjut)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="dn">Catatan penyelesaian (tercatat di audit)</Label><Textarea id="dn" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
            <p className="text-xs text-muted-foreground">Pengembalian uang ke client tetap dilakukan manual di dashboard Midtrans; pembayaran akan ditandai "perlu refund".</p>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Batal</Button><Button disabled={busy} onClick={decide}>{busy && <Loader2 className="animate-spin" />} Simpan keputusan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Laporan ---------- */
type ReportRow = { id: string; target_type: string; target_id: string; reason: string; detail: string; status: string; admin_note: string | null; created_at: string; reporter: { username: string } | null };
const TARGET_LINK = (t: string, id: string) => (t === "job" ? `/lowongan/${id}` : t === "contract" ? `/kerja/kontrak/${id}` : t === "profile" ? `/${id}` : null);
function ReportsTab() {
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-reports"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_reports").select("id,target_type,target_id,reason,detail,status,admin_note,created_at,reporter:profiles!work_reports_reporter_id_fkey(username)").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as unknown as ReportRow[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-reports"] }); qc.invalidateQueries({ queryKey: ["work-admin-stats"] }); };
  async function setStatus(id: string, status: string, note = "") {
    try { await workRpc("work_admin_set_report", { _report_id: id, _status: status, _note: note }); toast.success("Laporan diperbarui"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-3">
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState>Belum ada laporan.</EmptyState>}
      <ul className="space-y-2">
        {q.data?.map((r) => {
          const link = TARGET_LINK(r.target_type, r.target_id);
          return (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{r.target_type} · {r.reason}</span>
                <Pill tone={r.status === "open" ? "warn" : r.status === "reviewing" ? "info" : "ok"}>{r.status}</Pill>
              </div>
              <p className="text-xs text-muted-foreground">oleh @{r.reporter?.username ?? "?"} · {timeAgo(r.created_at)}{link && <> · <a href={link} className="text-primary underline">buka target</a></>}</p>
              {r.detail && <p className="mt-1 whitespace-pre-wrap">{r.detail}</p>}
              {r.admin_note && <p className="mt-1 rounded-md bg-muted p-2 text-xs">Catatan admin: {r.admin_note}</p>}
              {(r.status === "open" || r.status === "reviewing") && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.status === "open" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "reviewing")}>Tandai diperiksa</Button>}
                  <Button size="sm" onClick={() => setAsk({ title: "Selesaikan laporan", label: "Catatan penyelesaian", min: 3, confirm: "Selesai", onSubmit: async (t) => { await setStatus(r.id, "resolved", t); } })}>Selesaikan</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAsk({ title: "Tolak laporan", label: "Alasan", min: 3, confirm: "Tolak laporan", onSubmit: async (t) => { await setStatus(r.id, "dismissed", t); } })}>Tolak</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

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
        <Button variant="outline" disabled={busy} onClick={() => run(false)}>{busy && <Loader2 className="animate-spin" />} Periksa</Button>
        <Button disabled={busy} onClick={() => run(true)}>Perbaiki yang aman</Button>
      </div>
      {rows && rows.length === 0 && <EmptyState>Semua cocok. Tidak ada selisih.</EmptyState>}
      <ul className="space-y-2">
        {rows?.map((r, i) => (
          <li key={`${r.ref_id}-${i}`} className="rounded-lg border border-border bg-card p-3 text-sm"><Pill tone={r.kind === "diperbaiki" ? "ok" : "warn"}>{r.kind}</Pill> <span className="ml-1">{r.detail}</span></li>
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
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <ul className="space-y-1.5">
        {q.data?.map((c) => (
          <li key={c.slug} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{c.label} <span className="font-mono text-xs text-muted-foreground">{c.slug}</span></span>
            <Switch checked={c.active} aria-label={`Aktifkan ${c.label}`} onCheckedChange={(v) => save({ slug: c.slug, label: c.label, active: v, sort: c.sort_order })} />
          </li>
        ))}
      </ul>
      <form className="grid gap-2 rounded-xl border border-dashed border-border p-3 md:grid-cols-[1fr_1fr_100px_auto]" onSubmit={(e) => { e.preventDefault(); save({ slug: f.slug.trim(), label: f.label.trim(), active: true, sort: Math.round(Number(f.sort) || 0) }).then(() => setF({ slug: "", label: "", sort: "99" })); }}>
        <div className="space-y-1.5"><Label htmlFor="cs">Slug</Label><Input id="cs" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="game-development" /></div>
        <div className="space-y-1.5"><Label htmlFor="cl">Nama</Label><Input id="cl" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="co">Urutan</Label><Input id="co" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></div>
        <div className="flex items-end"><Button type="submit">Tambah / ubah</Button></div>
      </form>
    </div>
  );
}
