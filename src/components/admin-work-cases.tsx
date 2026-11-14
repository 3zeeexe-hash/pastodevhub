// GOBI WORK — admin: kasus lengkap (kontrak + lowongan + profil kedua pihak + pembayaran + sengketa + laporan + riwayat),
// daftar laporan, dan daftar sengketa. Semua MEMBACA lewat RLS admin yang sudah ada; yang mengubah data hanya fungsi work_admin_*.
// Aksi admin: putuskan sengketa (dana bergerak otomatis, opsional sekaligus tutup kontrak) dan tutup kontrak manual dari sengketa, laporan, atau kasus (SQL 011).
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, ExternalLink, Flag, Loader2, Scale, Search, Wallet } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { eventLabel, fmtDate, rp, workRpc } from "@/lib/work-db";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContractPill, EmptyState, MilestonePill, Pill, ReasonDialog, reportReasonLabel, type Ask } from "@/components/work-ui";
import { DisputeDetail, Loading, must } from "@/components/admin-work-extra";
import { CloseContractDialog } from "@/components/admin-work-close";
import type { ContractStatus, MilestoneStatus } from "@/lib/work";
import { cn } from "@/lib/utils";

const CARD = "rounded-2xl bg-card shadow-sm ring-1 ring-border";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pesan PostgREST bila fungsi belum ada di database (SQL 011 belum dijalankan). */
const MISSING_FN = /could not find|schema cache/i;
const isOpenContract = (s?: string | null) => !!s && s !== "completed" && s !== "cancelled";

/* ---------- Data bersama ---------- */
export type Prof = { id: string; username: string; display_name: string | null; avatar_url: string | null; headline: string | null; is_verified: boolean | null; account_type: string | null; created_at: string };
type Profs = Record<string, Prof>;
const PROF_COLS = "id,username,display_name,avatar_url,headline,is_verified,account_type,created_at";

async function profilesByIds(ids: (string | null | undefined)[]): Promise<Profs> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return {};
  const rows = (await must<Prof[]>(looseDb.from("profiles").select(PROF_COLS).in("id", uniq))) ?? [];
  return Object.fromEntries(rows.map((p) => [p.id, p]));
}
async function profilesByNames(names: string[]): Promise<Record<string, Prof>> {
  const uniq = [...new Set(names.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = (await must<Prof[]>(looseDb.from("profiles").select(PROF_COLS).in("username", uniq))) ?? [];
  return Object.fromEntries(rows.map((p) => [p.username, p]));
}

type Esc = { fee: number | null; net: number | null; status: string; held_until: string | null; released_at: string | null; note: string | null };
const escOf = (v: unknown): Esc | null => (Array.isArray(v) ? ((v[0] as Esc) ?? null) : ((v as Esc | null) ?? null));
const ESCROW_LABEL: Record<string, string> = { held: "ditahan", frozen: "dibekukan", released: "diteruskan", refunded: "dikembalikan ke client" };

/** Profil singkat (avatar, nama, @username, centang biru); `full` menambah headline dan tanggal bergabung. */
export function PersonChip({ p, label, full }: { p?: Prof | null; label?: string; full?: boolean }) {
  if (!p) return <p className="text-sm text-muted-foreground">{label ? `${label}: ` : ""}pengguna tidak ditemukan</p>;
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <AvatarMini name={p.username} url={p.avatar_url} size={full ? 44 : 32} />
      <div className="min-w-0">
        {label && <p className="text-[11px] font-bold uppercase tracking-wide text-orange-ink">{label}</p>}
        <Link to="/$username" params={{ username: p.username }} className="flex items-center gap-1 font-bold hover:text-primary">
          <span className="truncate">{p.display_name || p.username}</span>
          <VerifiedBadge username={p.username} verified={!!p.is_verified} size={14} />
        </Link>
        <p className="truncate text-xs text-muted-foreground">@{p.username}{p.account_type ? ` · ${p.account_type}` : ""}</p>
        {full && p.headline && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.headline}</p>}
        {full && <p className="text-[11px] text-muted-foreground">Bergabung {fmtDate(p.created_at)}</p>}
      </div>
    </div>
  );
}

/* ---------- Kasus lengkap ---------- */
type ContractRaw = {
  id: string; job_id: string; application_id: string; client_id: string; freelancer_id: string; title: string; status: ContractStatus;
  payment_type: string; schedule_mode?: boolean; total_amount: number; hourly_rate: number; deadline: string | null; version: number;
  client_approved_at: string | null; freelancer_approved_at: string | null; revision_limit?: number | null; revisions_used?: number; created_at: string;
};
type JobLite = { id: string; title: string; status: string; category: string | null; payment_type: string | null; budget_min: number | null; budget_max: number | null; created_at: string };
type MsRaw = { id: string; position: number; title: string; amount: number; status: MilestoneStatus; deadline: string | null };
type OrderFull = {
  id: string; number: string | number | null; title: string; amount: number; status: string; paid_at: string | null; fee_amount: number | null;
  work_milestone_id: string | null; created_at: string; escrow: unknown; payments: { midtrans_order_id: string; status: string; needs_refund: boolean }[] | null;
};
type DisputeRaw = { id: string; contract_id: string; milestone_id: string | null; opened_by: string; reason: string; status: string; decision: string | null; decision_note: string | null; created_at: string };
type ReportRaw = { id: string; reporter_id: string; target_type: string; target_id: string; reason: string; detail: string; status: string; admin_note: string | null; created_at: string };
type EvRaw = { id: number; actor_id: string | null; event: string; created_at: string };

async function loadCase(id: string) {
  const c = await must<ContractRaw>(looseDb.from("work_contracts").select("*").eq("id", id).maybeSingle());
  if (!c) throw new Error("Kontrak tidak ditemukan");
  const profs = await profilesByIds([c.client_id, c.freelancer_id]);
  const [job, ms, ods, dps, evs, rps] = await Promise.all([
    must<JobLite>(looseDb.from("jobs").select("id,title,status,category,payment_type,budget_min,budget_max,created_at").eq("id", c.job_id).maybeSingle()),
    must<MsRaw[]>(looseDb.from("contract_milestones").select("id,position,title,amount,status,deadline").eq("contract_id", id).order("position")),
    must<OrderFull[]>(looseDb.from("orders")
      .select("id,number,title,amount,status,paid_at,fee_amount,work_milestone_id,created_at,escrow:escrow_ledger(fee,net,status,held_until,released_at,note),payments(midtrans_order_id,status,needs_refund)")
      .eq("work_contract_id", id).order("created_at", { ascending: false })),
    must<DisputeRaw[]>(looseDb.from("work_disputes").select("*").eq("contract_id", id).order("created_at", { ascending: false })),
    must<EvRaw[]>(looseDb.from("work_contract_events").select("id,actor_id,event,created_at").eq("contract_id", id).order("id", { ascending: false }).limit(80)),
    must<ReportRaw[]>(looseDb.from("work_reports").select("*")
      .or(`and(target_type.eq.contract,target_id.eq.${id}),and(target_type.eq.job,target_id.eq.${c.job_id}),and(target_type.eq.profile,target_id.in.(${[profs[c.client_id]?.username, profs[c.freelancer_id]?.username].filter(Boolean).join(",")}))`)
      .order("created_at", { ascending: false })),
  ]);
  const reporters = await profilesByIds((rps ?? []).map((r) => r.reporter_id));
  return { c, job, ms: ms ?? [], ods: ods ?? [], dps: dps ?? [], evs: evs ?? [], rps: rps ?? [], profs, reporters };
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h4 className="font-extrabold">{title}</h4>{aside}</div>
      {children}
    </section>
  );
}

export function CaseDialog({ contractId, onClose }: { contractId: string | null; onClose: () => void }) {
  const [dispute, setDispute] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const q = useQuery({ enabled: !!contractId, queryKey: ["work-admin-case", contractId], queryFn: () => loadCase(contractId!) });
  const d = q.data;
  const money = useMemo(() => {
    const paid = (d?.ods ?? []).filter((o) => o.paid_at);
    const by = (s: string) => paid.filter((o) => escOf(o.escrow)?.status === s).reduce((t, o) => t + o.amount, 0);
    return { paid: paid.reduce((t, o) => t + o.amount, 0), held: by("held"), frozen: by("frozen"), released: by("released"), refunded: by("refunded") };
  }, [d]);
  const who = (id: string | null) => (id ? (d?.profs[id] ?? d?.reporters[id])?.username : null);
  return (
    <>
      <Dialog open={!!contractId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Kasus lengkap</DialogTitle></DialogHeader>
          <Loading q={q} />
          {d && (
            <div className="space-y-5 text-sm">
              <div className="rounded-2xl bg-header-gradient p-4 text-white">
                <div className="flex flex-wrap items-center gap-2"><ContractPill status={d.c.status} /><Pill tone="brand">{d.c.schedule_mode ? "Per jam (terjadwal)" : d.c.payment_type === "fixed" ? "Kerja langsung" : "Per jam"}</Pill><span className="text-xs text-white/70">Versi {d.c.version}</span></div>
                <h3 className="mt-1.5 text-lg font-extrabold">{d.c.title}</h3>
                <p className="mt-1 text-xs text-white/80">
                  {d.c.payment_type === "fixed" ? rp(d.c.total_amount) : `${rp(d.c.hourly_rate)}/jam`} · selesai paling lambat {d.c.deadline ? fmtDate(d.c.deadline) : "fleksibel"} · dibuat {fmtDate(d.c.created_at)}
                  {d.c.revision_limit ? ` · revisi ${d.c.revisions_used ?? 0}/${d.c.revision_limit}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary" className="rounded-full"><Link to="/kerja/kontrak/$id" params={{ id: d.c.id }}><ExternalLink /> Buka kontrak</Link></Button>
                  {d.job && <Button asChild size="sm" variant="secondary" className="rounded-full"><Link to="/lowongan/$id" params={{ id: d.job.id }}><ExternalLink /> Buka lowongan</Link></Button>}
                  {isOpenContract(d.c.status) && <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setClosing(true)}><Ban /> Tutup kontrak</Button>}
                </div>
              </div>

              <Section title="Lowongan">
                {d.job ? (
                  <div className={cn(CARD, "p-3")}>
                    <Link to="/lowongan/$id" params={{ id: d.job.id }} className="font-bold hover:text-primary">{d.job.title}</Link>
                    <p className="text-xs text-muted-foreground">{d.job.category ?? "—"} · {d.job.payment_type === "hourly" ? "per jam" : "kerja langsung"} · anggaran {d.job.budget_min || d.job.budget_max ? `${rp(d.job.budget_min)} – ${rp(d.job.budget_max)}` : "negosiasi"} · status {d.job.status} · dibuat {fmtDate(d.job.created_at)}</p>
                  </div>
                ) : <p className="text-muted-foreground">Lowongan sudah tidak ada.</p>}
              </Section>

              <Section title="Pihak yang terlibat">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={cn(CARD, "p-3")}><PersonChip p={d.profs[d.c.client_id]} label="Pembuat lowongan (client)" full /><p className="mt-1.5 text-[11px] text-muted-foreground">Menyetujui: {d.c.client_approved_at ? fmtDate(d.c.client_approved_at) : "belum"}</p></div>
                  <div className={cn(CARD, "p-3")}><PersonChip p={d.profs[d.c.freelancer_id]} label="Pelamar (freelancer)" full /><p className="mt-1.5 text-[11px] text-muted-foreground">Menyetujui: {d.c.freelancer_approved_at ? fmtDate(d.c.freelancer_approved_at) : "belum"}</p></div>
                </div>
              </Section>

              <Section title="Pembayaran & dana" aside={<Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/admin/escrow"><Wallet /> Escrow & saldo</Link></Button>}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[["Dibayar client", money.paid], ["Ditahan", money.held], ["Dibekukan", money.frozen], ["Diteruskan", money.released], ["Dikembalikan", money.refunded]].map(([l, v]) => (
                    <div key={l as string} className="rounded-xl bg-secondary/60 p-2.5"><p className="text-[11px] text-muted-foreground">{l}</p><p className="font-bold">{rp(v as number)}</p></div>
                  ))}
                </div>
                {d.ods.length === 0 && <p className="text-muted-foreground">Belum ada tagihan atau pembayaran untuk kontrak ini.</p>}
                <ul className="space-y-2">
                  {d.ods.map((o) => {
                    const esc = escOf(o.escrow);
                    const refund = (o.payments ?? []).some((p) => p.needs_refund);
                    const ref = o.payments?.[0]?.midtrans_order_id;
                    return (
                      <li key={o.id} className={cn(CARD, "p-3")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link to="/pesanan/$id" params={{ id: o.id }} className="font-bold hover:text-primary">#{o.number ?? "—"} · {o.title}</Link>
                          <span className="flex flex-wrap gap-1.5">
                            <Pill tone={o.paid_at ? "ok" : "warn"}>{o.paid_at ? "dibayar" : o.status}</Pill>
                            {esc && <Pill tone={esc.status === "frozen" ? "bad" : "info"}>escrow {ESCROW_LABEL[esc.status] ?? esc.status}</Pill>}
                            {refund && <Pill tone="bad">perlu refund</Pill>}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rp(o.amount)} · {o.paid_at ? `dibayar ${fmtDate(o.paid_at)}` : `dibuat ${fmtDate(o.created_at)}`}
                          {esc ? ` · komisi ${rp(esc.fee)} · bersih ${rp(esc.net)}` : ""}
                          {esc?.status === "held" && esc.held_until ? ` · ditahan sampai ${fmtDate(esc.held_until)}` : ""}
                          {esc?.released_at ? ` · diteruskan ${fmtDate(esc.released_at)}` : ""}
                        </p>
                        {esc?.note && <p className="mt-0.5 text-xs text-muted-foreground">Catatan escrow: {esc.note}</p>}
                        {ref && <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">Ref. Midtrans: {ref}</p>}
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <Section title={`Milestone (${d.ms.length})`}>
                <ul className="space-y-1.5">
                  {d.ms.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2">
                      <span>{m.position}. {m.title} · <b>{rp(m.amount)}</b>{m.deadline ? ` · ${fmtDate(m.deadline)}` : ""}</span>
                      <MilestonePill status={m.status} />
                    </li>
                  ))}
                  {d.ms.length === 0 && <li className="text-muted-foreground">Belum ada milestone.</li>}
                </ul>
              </Section>

              <Section title={`Sengketa (${d.dps.length})`}>
                {d.dps.length === 0 && <p className="text-muted-foreground">Tidak ada sengketa.</p>}
                <ul className="space-y-2">
                  {d.dps.map((x) => (
                    <li key={x.id} className={cn(CARD, "p-3")}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><Pill tone={x.status === "resolved" ? "ok" : "bad"}>{x.status === "resolved" ? "Diputuskan" : "Terbuka"}</Pill><span className="text-xs text-muted-foreground">oleh @{who(x.opened_by) ?? "?"} · {timeAgo(x.created_at)}</span></div>
                      <p className="mt-1 whitespace-pre-wrap">{x.reason}</p>
                      {x.decision && <p className="mt-1 rounded-lg bg-muted p-2"><b>{x.decision}</b>: {x.decision_note}</p>}
                      <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => setDispute(x.id)}>Bukti & riwayat</Button>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={`Laporan terkait (${d.rps.length})`}>
                {d.rps.length === 0 && <p className="text-muted-foreground">Tidak ada laporan untuk kontrak, lowongan, atau kedua pihak.</p>}
                <ul className="space-y-2">
                  {d.rps.map((r) => (
                    <li key={r.id} className={cn(CARD, "p-3")}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{reportReasonLabel(r.reason)} <span className="text-xs font-normal text-muted-foreground">· {r.target_type}</span></span><Pill tone={r.status === "open" ? "warn" : r.status === "reviewing" ? "info" : "ok"}>{r.status}</Pill></div>
                      <div className="mt-1.5"><PersonChip p={d.reporters[r.reporter_id]} label="Pelapor" /></div>
                      {r.detail && <p className="mt-1.5 whitespace-pre-wrap">{r.detail}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">{timeAgo(r.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Riwayat kontrak">
                <ol className="space-y-1 border-l-2 border-primary/40 pl-4 text-xs">
                  {d.evs.map((e) => <li key={e.id}><span className="text-muted-foreground">{fmtDate(e.created_at)}</span> · {eventLabel(e.event)}{e.actor_id && who(e.actor_id) ? <span className="text-muted-foreground"> · @{who(e.actor_id)}</span> : null}</li>)}
                </ol>
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DisputeDetail disputeId={dispute} onClose={() => setDispute(null)} />
      <CloseContractDialog contractId={closing ? contractId : null} onClose={() => setClosing(false)} />
    </>
  );
}

/* ---------- Tab: Kasus (semua kontrak dengan profil) ---------- */
type CaseRow = ContractRaw & { job: { title: string } | null };
export function CasesTab() {
  const [status, setStatus] = useState("all");
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-cases"],
    queryFn: async () => {
      const rows = (await must<CaseRow[]>(looseDb.from("work_contracts").select("*, job:jobs(title)").order("updated_at", { ascending: false }).limit(200))) ?? [];
      return { rows, profs: await profilesByIds(rows.flatMap((r) => [r.client_id, r.freelancer_id])) };
    },
  });
  const shown = (q.data?.rows ?? []).filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    const t = text.trim().toLowerCase();
    if (!t) return true;
    const names = [q.data?.profs[r.client_id], q.data?.profs[r.freelancer_id]].flatMap((p) => [p?.username, p?.display_name]);
    return [r.title, r.job?.title, ...names].some((s) => s?.toLowerCase().includes(t));
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Semua kontrak GOBI WORK beserta lowongan, kedua pihak, pembayaran, sengketa, dan laporan terkait. Klik satu kontrak untuk melihat riwayat lengkapnya.</p>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari judul, lowongan, atau pengguna…" aria-label="Cari kasus" className="rounded-full pl-9" />
        </div>
        <div className="w-48">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status kontrak" className="rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="waiting_approval">Menunggu persetujuan</SelectItem>
              <SelectItem value="active">Aktif</SelectItem><SelectItem value="completed">Selesai</SelectItem><SelectItem value="disputed">Sengketa</SelectItem><SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>Tidak ada kontrak pada filter ini.</EmptyState>}
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(r.id)} className={cn(CARD, "w-full p-4 text-left transition hover:ring-primary/50")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0"><span className="block truncate font-extrabold">{r.job?.title ?? r.title}</span><span className="text-xs text-muted-foreground">{r.title !== r.job?.title ? `${r.title} · ` : ""}{r.payment_type === "fixed" ? rp(r.total_amount) : `${rp(r.hourly_rate)}/jam`} · {fmtDate(r.created_at)}</span></span>
                <span className="flex items-center gap-1.5"><ContractPill status={r.status} />{r.schedule_mode && <Pill tone="brand">per jam</Pill>}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <PersonChip p={q.data?.profs[r.client_id]} label="Client" />
                <PersonChip p={q.data?.profs[r.freelancer_id]} label="Freelancer" />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <CaseDialog contractId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ---------- Tab: Laporan ---------- */
const TARGET_LABEL: Record<string, string> = { job: "Lowongan", contract: "Kontrak", profile: "Profil", application: "Lamaran", conversation: "Percakapan", project: "Proyek" };
type JobMini = { id: string; title: string; client_id: string };
type ContractMini = { id: string; title: string; status: ContractStatus; job_id: string; client_id: string; freelancer_id: string };
type AppMini = { id: string; job_id: string; developer_id: string };

export function ReportsTab2() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ contractId: string; reportId: string | null } | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-reports"],
    queryFn: async () => {
      const rows = (await must<ReportRaw[]>(looseDb.from("work_reports").select("*").order("created_at", { ascending: false }).limit(200))) ?? [];
      const ids = (t: string) => [...new Set(rows.filter((r) => r.target_type === t && UUID.test(r.target_id)).map((r) => r.target_id))];
      const [contracts, apps, jobsDirect] = await Promise.all([
        ids("contract").length ? must<ContractMini[]>(looseDb.from("work_contracts").select("id,title,status,job_id,client_id,freelancer_id").in("id", ids("contract"))) : Promise.resolve([] as ContractMini[]),
        ids("application").length ? must<AppMini[]>(looseDb.from("job_applications").select("id,job_id,developer_id").in("id", ids("application"))) : Promise.resolve([] as AppMini[]),
        ids("job").length ? must<JobMini[]>(looseDb.from("jobs").select("id,title,client_id").in("id", ids("job"))) : Promise.resolve([] as JobMini[]),
      ]);
      const jobIds = [...new Set([...(contracts ?? []).map((c) => c.job_id), ...(apps ?? []).map((a) => a.job_id)])].filter((j) => !(jobsDirect ?? []).some((x) => x.id === j));
      const jobsExtra = jobIds.length ? ((await must<JobMini[]>(looseDb.from("jobs").select("id,title,client_id").in("id", jobIds))) ?? []) : [];
      const jobs = Object.fromEntries([...(jobsDirect ?? []), ...jobsExtra].map((j) => [j.id, j]));
      const names = rows.filter((r) => r.target_type === "profile").map((r) => r.target_id);
      const [byId, byName] = await Promise.all([
        profilesByIds([...rows.map((r) => r.reporter_id), ...(contracts ?? []).flatMap((c) => [c.client_id, c.freelancer_id]), ...(apps ?? []).map((a) => a.developer_id), ...Object.values(jobs).map((j) => j.client_id)]),
        profilesByNames(names),
      ]);
      return {
        rows, jobs, byId, byName,
        contracts: Object.fromEntries((contracts ?? []).map((c) => [c.id, c])),
        apps: Object.fromEntries((apps ?? []).map((a) => [a.id, a])),
      };
    },
  });
  const counts = (s: string) => (q.data?.rows ?? []).filter((r) => s === "all" || r.status === s).length;
  const shown = (q.data?.rows ?? []).filter((r) => status === "all" || r.status === status);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-reports"] }); qc.invalidateQueries({ queryKey: ["work-admin-stats"] }); qc.invalidateQueries({ queryKey: ["work-admin-jobs"] }); qc.invalidateQueries({ queryKey: ["work-admin-case"] }); };
  async function setReport(id: string, st: string, note = "") {
    try { await workRpc("work_admin_set_report", { _report_id: id, _status: st, _note: note }); toast.success("Laporan diperbarui"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  }

  /** Target laporan: lowongan/kontrak/profil/lamaran beserta pemilik dan pihaknya (lengkap dengan profil). */
  function Target({ r }: { r: ReportRaw }) {
    const d = q.data!;
    if (r.target_type === "profile") return <PersonChip p={d.byName[r.target_id]} label="Pengguna dilaporkan" full />;
    if (r.target_type === "job") {
      const j = d.jobs[r.target_id];
      return j ? <div className="space-y-2"><Link to="/lowongan/$id" params={{ id: j.id }} className="font-bold hover:text-primary">{j.title}</Link><PersonChip p={d.byId[j.client_id]} label="Pembuat lowongan" /></div> : <p className="text-muted-foreground">Lowongan sudah tidak ada.</p>;
    }
    if (r.target_type === "contract") {
      const c = d.contracts[r.target_id];
      if (!c) return <p className="text-muted-foreground">Kontrak tidak ditemukan.</p>;
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Link to="/kerja/kontrak/$id" params={{ id: c.id }} className="font-bold hover:text-primary">{c.title}</Link><ContractPill status={c.status} /></div>
          {d.jobs[c.job_id] && <p className="text-xs text-muted-foreground">Lowongan: {d.jobs[c.job_id].title}</p>}
          <div className="grid gap-2 sm:grid-cols-2"><PersonChip p={d.byId[c.client_id]} label="Client" /><PersonChip p={d.byId[c.freelancer_id]} label="Freelancer" /></div>
        </div>
      );
    }
    if (r.target_type === "application") {
      const a = d.apps[r.target_id];
      return a ? <div className="space-y-2">{d.jobs[a.job_id] && <Link to="/lowongan/$id" params={{ id: a.job_id }} className="font-bold hover:text-primary">{d.jobs[a.job_id].title}</Link>}<PersonChip p={d.byId[a.developer_id]} label="Pelamar" /></div> : <p className="text-muted-foreground">Lamaran tidak ditemukan.</p>;
    }
    return <p className="break-all text-xs text-muted-foreground">ID target: {r.target_id}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Laporan dari client dan freelancer: pekerjaan tidak diselesaikan, dana tertahan, tidak merespons, penipuan, dan lainnya. Setiap laporan menampilkan pelapor, target, dan profil pihak terkait. Untuk laporan kontrak, admin bisa menutup kontrak langsung dari sini.</p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status laporan">
        {([["open", "Terbuka"], ["reviewing", "Diperiksa"], ["resolved", "Selesai"], ["dismissed", "Ditolak"], ["all", "Semua"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition", status === k ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70")}>
            {l} <span className="rounded-full bg-black/10 px-1.5 text-[11px]">{counts(k)}</span>
          </button>
        ))}
      </div>
      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>Tidak ada laporan pada status ini.</EmptyState>}
      <ul className="space-y-3">
        {q.data && shown.map((r) => {
          const contractId = r.target_type === "contract" ? r.target_id : null;
          const reportOpen = r.status === "open" || r.status === "reviewing";
          const closable = !!contractId && isOpenContract(q.data.contracts[contractId]?.status);
          return (
            <li key={r.id} className={cn(CARD, "space-y-3 p-4 text-sm")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-extrabold"><Flag className="size-4 text-primary" /> {reportReasonLabel(r.reason)} <span className="text-xs font-normal text-muted-foreground">· {TARGET_LABEL[r.target_type] ?? r.target_type}</span></span>
                <Pill tone={r.status === "open" ? "warn" : r.status === "reviewing" ? "info" : "ok"}>{r.status}</Pill>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/60 p-3"><PersonChip p={q.data.byId[r.reporter_id]} label="Pelapor" full /></div>
                <div className="rounded-xl bg-secondary/60 p-3"><Target r={r} /></div>
              </div>
              {r.detail && <p className="whitespace-pre-wrap rounded-xl bg-muted p-3">{r.detail}</p>}
              {r.admin_note && <p className="rounded-xl bg-primary/10 p-2.5 text-xs"><b>Catatan admin:</b> {r.admin_note}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                {contractId && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(contractId)}>Kasus lengkap</Button>}
                {closable && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setClosing({ contractId: contractId!, reportId: reportOpen ? r.id : null })}><Ban /> Tutup kontrak</Button>}
                {reportOpen && (
                  <>
                    {r.status === "open" && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReport(r.id, "reviewing")}>Tandai diperiksa</Button>}
                    <Button size="sm" className="rounded-full" onClick={() => setAsk({ title: "Selesaikan laporan", label: "Catatan penyelesaian (tindakan yang diambil)", min: 3, confirm: "Selesai", onSubmit: async (t) => { await setReport(r.id, "resolved", t); } })}>Selesaikan</Button>
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setAsk({ title: "Tolak laporan", label: "Alasan", min: 3, confirm: "Tolak laporan", onSubmit: async (t) => { await setReport(r.id, "dismissed", t); } })}>Tolak</Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
      <CaseDialog contractId={open} onClose={() => setOpen(null)} />
      <CloseContractDialog contractId={closing?.contractId ?? null} reportId={closing?.reportId} onClose={() => setClosing(null)} />
    </div>
  );
}

/* ---------- Tab: Sengketa ---------- */
type DisputeRow2 = DisputeRaw & { contract: { title: string; job_id: string; client_id: string; freelancer_id: string; status: ContractStatus } | null; milestone: { title: string; amount: number; status: MilestoneStatus } | null };
/** Akibat tiap keputusan, ditampilkan di dialog sebelum admin menyimpan. */
const OUTCOME: Record<string, string> = {
  favor_freelancer: "Milestone disetujui dan dana langsung masuk ke saldo freelancer. Tidak ada langkah admin lain.",
  favor_client: "Dana langsung masuk ke saldo client (bisa ditarik), milestone dan pesanan dibatalkan.",
  split: "Dana tetap dibekukan. Bagi dana secara manual di Escrow & saldo, lalu catat di sini.",
  dismissed: "Sengketa ditolak: dana kembali ditahan dan pekerjaan berlanjut.",
};
export function DisputesTab2() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["work-admin-disputes"],
    queryFn: async () => {
      const rows = (await must<DisputeRow2[]>(looseDb.from("work_disputes").select("*, contract:work_contracts(title,job_id,client_id,freelancer_id,status), milestone:contract_milestones(title,amount,status)").order("created_at", { ascending: false }).limit(100))) ?? [];
      const jobIds = [...new Set(rows.map((r) => r.contract?.job_id).filter((x): x is string => !!x))];
      const msIds = rows.map((r) => r.milestone_id).filter((x): x is string => !!x);
      const [jobs, ods, profs] = await Promise.all([
        jobIds.length ? must<{ id: string; title: string }[]>(looseDb.from("jobs").select("id,title").in("id", jobIds)) : Promise.resolve([]),
        msIds.length ? must<OrderFull[]>(looseDb.from("orders").select("id,amount,status,paid_at,work_milestone_id,escrow:escrow_ledger(status,fee,net,held_until,released_at,note),payments(midtrans_order_id,status,needs_refund)").in("work_milestone_id", msIds)) : Promise.resolve([] as OrderFull[]),
        profilesByIds(rows.flatMap((r) => [r.contract?.client_id, r.contract?.freelancer_id, r.opened_by])),
      ]);
      return {
        rows, profs,
        jobs: Object.fromEntries((jobs ?? []).map((j) => [j.id, j.title])),
        orders: Object.fromEntries((ods ?? []).map((o) => [o.work_milestone_id ?? "", o])),
      };
    },
  });
  const [target, setTarget] = useState<DisputeRow2 | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [kase, setKase] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [decision, setDecision] = useState("favor_freelancer");
  const [closeToo, setCloseToo] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const canClose = decision === "favor_client" || decision === "favor_freelancer";
  function openDecide(d: DisputeRow2) { setTarget(d); setCloseToo(false); setNote(""); }
  async function decide() {
    if (!target) return;
    if (note.trim().length < 10) { toast.error("Catatan keputusan minimal 10 karakter."); return; }
    const wantClose = closeToo && canClose;
    const base = { _dispute_id: target.id, _decision: decision, _note: note.trim() };
    setBusy(true);
    try {
      let msg = decision === "favor_client" ? "Keputusan dicatat. Dana dikembalikan ke saldo client." : decision === "favor_freelancer" ? "Keputusan dicatat. Dana diteruskan ke saldo freelancer." : "Keputusan dicatat";
      try {
        await workRpc("work_admin_decide_dispute", { ...base, _close_contract: wantClose });
        if (wantClose) msg += " Kontrak ditutup.";
      } catch (e) {
        if (!MISSING_FN.test(errMsg(e))) throw e;
        // SQL 011 belum dijalankan: pakai alur lama (dana tidak bergerak otomatis).
        if (wantClose) throw new Error("Tutup kontrak butuh SQL 011 (docs/sql/gobi-work/011) dijalankan di database.");
        await workRpc("work_admin_decide_dispute", base);
        msg = "Keputusan dicatat (SQL 011 belum dijalankan, jadi dana belum bergerak otomatis).";
      }
      toast.success(msg);
      setTarget(null); setNote(""); setCloseToo(false);
      for (const k of ["work-admin-disputes", "work-admin-stats", "work-admin-case", "work-admin-cases", "work-admin-reports"]) qc.invalidateQueries({ queryKey: [k] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Sengketa kontrak: dana milestone dibekukan sampai admin memutuskan. Periksa bukti, hasil kerja, obrolan, dan status dana sebelum memutuskan. Keputusan langsung memindahkan dana: freelancer menang ke saldo freelancer, client menang ke saldo client.</p>
      <Loading q={q} />
      {q.data?.rows.length === 0 && <EmptyState>Belum ada sengketa.</EmptyState>}
      <ul className="space-y-3">
        {q.data?.rows.map((d) => {
          const o = d.milestone_id ? q.data.orders[d.milestone_id] : null;
          const esc = o ? escOf(o.escrow) : null;
          return (
            <li key={d.id} className={cn(CARD, "space-y-3 p-4 text-sm")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-extrabold"><Scale className="size-4 text-primary" /> {d.contract?.job_id ? q.data.jobs[d.contract.job_id] ?? d.contract.title : d.contract?.title ?? "Kontrak"}</span>
                <Pill tone={d.status === "resolved" ? "ok" : "bad"}>{d.status === "resolved" ? "Diputuskan" : "Terbuka"}</Pill>
              </div>
              {d.contract && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-secondary/60 p-3"><PersonChip p={q.data.profs[d.contract.client_id]} label="Client" /></div>
                  <div className="rounded-xl bg-secondary/60 p-3"><PersonChip p={q.data.profs[d.contract.freelancer_id]} label="Freelancer" /></div>
                </div>
              )}
              <p className="whitespace-pre-wrap rounded-xl bg-muted p-3">{d.reason}</p>
              <p className="text-xs text-muted-foreground">
                Diajukan oleh @{q.data.profs[d.opened_by]?.username ?? "?"} · {timeAgo(d.created_at)}
                {d.milestone ? ` · milestone "${d.milestone.title}" ${rp(d.milestone.amount)}` : " · seluruh kontrak"}
                {esc ? ` · escrow ${ESCROW_LABEL[esc.status] ?? esc.status}` : o ? (o.paid_at ? " · dibayar" : " · belum dibayar") : ""}
                {d.contract ? ` · kontrak ${d.contract.status === "cancelled" ? "ditutup" : d.contract.status === "completed" ? "selesai" : "berjalan"}` : ""}
              </p>
              {d.decision && <p className="rounded-xl bg-primary/10 p-2.5"><b>{d.decision}</b>: {d.decision_note}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setKase(d.contract_id)}>Kasus lengkap</Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDetail(d.id)}>Bukti & riwayat</Button>
                {d.status !== "resolved" && <Button size="sm" className="rounded-full" onClick={() => openDecide(d)}>Putuskan</Button>}
                {isOpenContract(d.contract?.status) && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setClosing(d.contract_id)}><Ban /> Tutup kontrak</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <DisputeDetail disputeId={detail} onClose={() => setDetail(null)} />
      <CaseDialog contractId={kase} onClose={() => setKase(null)} />
      <CloseContractDialog contractId={closing} onClose={() => setClosing(null)} />
      <Dialog open={!!target} onOpenChange={(o) => !busy && !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Putuskan sengketa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Keputusan</Label>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="favor_freelancer">Menangkan freelancer</SelectItem>
                  <SelectItem value="favor_client">Menangkan client</SelectItem>
                  <SelectItem value="split">Bagi dana (manual admin)</SelectItem>
                  <SelectItem value="dismissed">Tolak sengketa (pekerjaan berlanjut)</SelectItem>
                </SelectContent>
              </Select>
              <p className="rounded-xl bg-muted p-2.5 text-xs">{OUTCOME[decision]}</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="dn">Catatan penyelesaian (tercatat di audit)</Label><Textarea id="dn" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
            <label className={cn("flex items-start gap-2 text-sm", !canClose && "opacity-50")}>
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={!canClose} checked={closeToo && canClose} onChange={(e) => setCloseToo(e.target.checked)} />
              <span>Tutup kontrak sekaligus<span className="block text-xs text-muted-foreground">{canClose ? "Milestone lain yang belum dibayar dibatalkan. Bila masih ada milestone berdana yang berjalan, penutupan ditolak dan keputusan tidak disimpan." : "Hanya tersedia untuk keputusan menangkan freelancer atau client."}</span></span>
            </label>
            <p className="text-xs text-muted-foreground">Mau menutup tanpa memutuskan, atau mengembalikan dana yang masih tertahan? Pakai tombol Tutup kontrak di kartu sengketa. Lihat dana di <Link to="/admin/escrow" className="text-primary underline">Escrow & saldo</Link>.</p>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Batal</Button><Button disabled={busy} onClick={decide}>{busy && <Loader2 className="animate-spin" />} Simpan keputusan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
