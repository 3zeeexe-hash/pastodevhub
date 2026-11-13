// GOBI WORK Fase 6: tab admin tambahan (lamaran, transaksi, pencairan, audit) dan detail sengketa.
// Semua hanya MEMBACA lewat RLS khusus admin yang sudah ada (docs/sql/midtrans-escrow/001, gobi-work/003).
// Aksi yang mengubah uang tetap di /admin/escrow dan /admin/pembayaran; aksi moderasi lewat fungsi work_admin_*.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { eventLabel, fmtDate, rp } from "@/lib/work-db";
import { evidenceItems, pickEscrow, summarizeTx } from "@/lib/admin-work";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, Pill, Stat } from "@/components/work-ui";

type Names = Record<string, string>;

export async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw new Error(errMsg(error));
  return data;
}

async function usernameMap(ids: (string | null | undefined)[]): Promise<Names> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return {};
  const rows = (await must<{ id: string; username: string }[]>(looseDb.from("profiles").select("id,username").in("id", uniq))) ?? [];
  return Object.fromEntries(rows.map((p) => [p.id, p.username]));
}

const at = (names: Names, id: string | null | undefined) => (id ? `@${names[id] ?? "?"}` : "—");

export function Loading({ q }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown } }) {
  return (
    <>
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : null}
    </>
  );
}

/* ---------- Lamaran ---------- */
type AppRow = { id: string; job_id: string; developer_id: string; status: string; work_stage: string | null; bid_amount: number | null; created_at: string; job: { title: string } | null };
const APP_TONE: Record<string, "ok" | "warn" | "bad" | "info"> = { pending: "warn", accepted: "ok", rejected: "bad", withdrawn: "bad" };
export function ApplicationsTab() {
  const [status, setStatus] = useState("all");
  const q = useQuery({
    queryKey: ["work-admin-applications", status],
    queryFn: async () => {
      let query = looseDb.from("job_applications").select("id,job_id,developer_id,status,work_stage,bid_amount,created_at,job:jobs(title)").order("created_at", { ascending: false }).limit(100);
      if (status !== "all") query = query.eq("status", status);
      const rows = (await must<AppRow[]>(query)) ?? [];
      return { rows, names: await usernameMap(rows.map((r) => r.developer_id)) };
    },
  });
  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status lamaran"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Semua status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="accepted">Diterima</SelectItem><SelectItem value="rejected">Ditolak</SelectItem><SelectItem value="withdrawn">Ditarik</SelectItem></SelectContent>
        </Select>
      </div>
      <Loading q={q} />
      {q.data?.rows.length === 0 && <EmptyState>Belum ada lamaran pada filter ini.</EmptyState>}
      <ul className="space-y-2">
        {q.data?.rows.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to="/lowongan/$id" params={{ id: a.job_id }} className="font-semibold hover:text-primary">{a.job?.title ?? "Lowongan"}</Link>
              <span className="flex gap-1.5">{a.work_stage && <Pill tone="info">{a.work_stage}</Pill>}<Pill tone={APP_TONE[a.status] ?? "info"}>{a.status}</Pill></span>
            </div>
            <p className="text-xs text-muted-foreground">{at(q.data.names, a.developer_id)} · tawaran {a.bid_amount != null ? rp(a.bid_amount) : "—"} · {timeAgo(a.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Transaksi ---------- */
type TxRow = {
  id: string; title: string; amount: number; status: string; paid_at: string | null; fee_amount: number | null;
  buyer_id: string; seller_id: string; work_milestone_id: string | null; work_contract_id: string | null; created_at: string;
  escrow: unknown; payments: { midtrans_order_id: string; status: string; needs_refund: boolean }[] | null;
};
const ESCROW_LABEL: Record<string, string> = { held: "ditahan", frozen: "dibekukan", released: "diteruskan", refunded: "direfund" };
export function TransactionsTab() {
  const [filter, setFilter] = useState("all");
  const q = useQuery({
    queryKey: ["work-admin-transactions"],
    queryFn: async () => {
      const rows = (await must<TxRow[]>(
        looseDb.from("orders")
          .select("id,title,amount,status,paid_at,fee_amount,buyer_id,seller_id,work_milestone_id,work_contract_id,created_at,escrow:escrow_ledger(fee,net,status),payments(midtrans_order_id,status,needs_refund)")
          .or("work_milestone_id.not.is.null,work_contract_id.not.is.null")
          .order("created_at", { ascending: false })
          .limit(100),
      )) ?? [];
      return { rows, names: await usernameMap(rows.flatMap((r) => [r.buyer_id, r.seller_id])) };
    },
  });
  const rows = (q.data?.rows ?? []).map((r) => {
    const esc = pickEscrow(r.escrow);
    return { r, esc, fee: esc?.fee ?? Number(r.fee_amount ?? 0), needsRefund: (r.payments ?? []).some((p) => p.needs_refund), ref: r.payments?.[0]?.midtrans_order_id ?? null };
  });
  const sum = summarizeTx(rows.map((x) => ({ amount: x.r.amount, paid_at: x.r.paid_at, fee: x.fee, needsRefund: x.needsRefund })));
  const shown = rows.filter((x) => filter === "all" || (filter === "paid" && x.r.paid_at) || (filter === "unpaid" && !x.r.paid_at) || (filter === "refund" && x.needsRefund));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Transaksi dibayar" value={sum.paid} />
        <Stat label="Volume dibayar" value={rp(sum.volume)} />
        <Stat label="Komisi" value={rp(sum.commission)} />
        <Stat label="Perlu refund" value={sum.refund} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Filter transaksi"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="paid">Sudah dibayar</SelectItem><SelectItem value="unpaid">Belum dibayar</SelectItem><SelectItem value="refund">Perlu refund</SelectItem></SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">100 transaksi terbaru. Tahan, bekukan, refund, dan teruskan dana di <Link to="/admin/escrow" className="text-primary underline">Escrow & saldo</Link>.</p>
      </div>
      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>Belum ada transaksi GOBI WORK pada filter ini.</EmptyState>}
      <ul className="space-y-2">
        {shown.map(({ r, esc, fee, needsRefund, ref }) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {r.work_contract_id
                ? <Link to="/kerja/kontrak/$id" params={{ id: r.work_contract_id }} className="font-semibold hover:text-primary">{r.title}</Link>
                : <span className="font-semibold">{r.title}</span>}
              <span className="flex flex-wrap gap-1.5">
                <Pill tone={r.paid_at ? "ok" : "warn"}>{r.paid_at ? "dibayar" : r.status}</Pill>
                {esc && <Pill tone={esc.status === "frozen" ? "bad" : "info"}>escrow {ESCROW_LABEL[esc.status] ?? esc.status}</Pill>}
                {needsRefund && <Pill tone="bad">perlu refund</Pill>}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {at(q.data!.names, r.buyer_id)} → {at(q.data!.names, r.seller_id)} · {rp(r.amount)} · komisi {r.paid_at || esc ? rp(fee) : "—"}{esc ? ` · bersih ${rp(esc.net)}` : ""} · {timeAgo(r.created_at)}
            </p>
            {ref && <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">Ref. Midtrans: {ref}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Pencairan ---------- */
type PayoutRow = { id: string; developer_id: string; amount: number; bank_name: string | null; status: string; created_at: string };
export function PayoutsTab() {
  const q = useQuery({
    queryKey: ["work-admin-payouts"],
    queryFn: async () => {
      const rows = (await must<PayoutRow[]>(looseDb.from("payouts").select("id,developer_id,amount,bank_name,status,created_at").order("created_at", { ascending: false }).limit(100))) ?? [];
      return { rows, names: await usernameMap(rows.map((r) => r.developer_id)) };
    },
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Semua permintaan pencairan saldo (termasuk dari kontrak GOBI WORK). Nomor rekening sengaja tidak ditampilkan di sini; proses transfer dan penandaan selesai dilakukan di <Link to="/admin/pembayaran" className="text-primary underline">Pembayaran & pencairan</Link>.</p>
      <Loading q={q} />
      {q.data?.rows.length === 0 && <EmptyState>Belum ada permintaan pencairan.</EmptyState>}
      <ul className="space-y-1.5">
        {q.data?.rows.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span>{at(q.data.names, p.developer_id)} · <b>{rp(p.amount)}</b> {p.bank_name && <span className="text-xs text-muted-foreground">· {p.bank_name}</span>}</span>
            <span className="flex items-center gap-2"><Pill tone={p.status === "paid" ? "ok" : p.status === "requested" ? "warn" : "info"}>{p.status}</Pill><span className="text-xs text-muted-foreground">{timeAgo(p.created_at)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Audit log ---------- */
type AuditRow = { id: number; admin_label: string | null; action: string; target_type: string | null; target_id: string | null; note: string | null; created_at: string };
export function AuditTab() {
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["work-admin-audit", all],
    queryFn: async () => {
      let query = looseDb.from("admin_audit_log").select("id,admin_label,action,target_type,target_id,note,created_at").order("id", { ascending: false }).limit(200);
      if (!all) query = query.ilike("action", "work%");
      return (await must<AuditRow[]>(query)) ?? [];
    },
  });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm"><Switch checked={all} onCheckedChange={setAll} aria-label="Tampilkan semua aksi admin" /> Tampilkan semua aksi admin (termasuk escrow dan pembayaran)</label>
      <Loading q={q} />
      {q.data?.length === 0 && <EmptyState>Belum ada catatan audit.</EmptyState>}
      <ul className="space-y-1.5">
        {q.data?.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted-foreground">{a.admin_label ? `@${a.admin_label}` : "admin"} · {timeAgo(a.created_at)}</span></div>
            {(a.target_type || a.note) && <p className="mt-0.5 break-words text-xs text-muted-foreground">{a.target_type}{a.target_id ? ` ${a.target_id}` : ""}{a.note ? ` — ${a.note}` : ""}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Detail sengketa: bukti, hasil kerja, riwayat, dan chat lamaran ---------- */
type DisputeFull = { id: string; contract_id: string; milestone_id: string | null; opened_by: string; reason: string; evidence: unknown; status: string; decision: string | null; decision_note: string | null; created_at: string };
type ContractLite = { id: string; application_id: string; title: string; client_id: string; freelancer_id: string };
type Msg = { id: string | number; sender_id: string; body: string | null; created_at: string };
type EventLite = { id: number; event: string; created_at: string };
type MilestoneLite = { id: string; title: string; amount: number; status: string };
type SubLite = { id: string; note: string; links: string[] | null; created_at: string };
type RevLite = { id: string; note: string; created_at: string };

export function DisputeDetail({ disputeId, onClose }: { disputeId: string | null; onClose: () => void }) {
  const q = useQuery({
    enabled: !!disputeId,
    queryKey: ["work-admin-dispute-detail", disputeId],
    queryFn: async () => {
      const d = await must<DisputeFull>(looseDb.from("work_disputes").select("*").eq("id", disputeId).maybeSingle());
      if (!d) throw new Error("Sengketa tidak ditemukan");
      const c = await must<ContractLite>(looseDb.from("work_contracts").select("id,application_id,title,client_id,freelancer_id").eq("id", d.contract_id).maybeSingle());
      const [msgs, events, ms, subs, revs] = await Promise.all([
        c ? must<Msg[]>(looseDb.from("job_messages").select("*").eq("application_id", c.application_id).order("created_at", { ascending: true }).limit(200)) : Promise.resolve(null),
        must<EventLite[]>(looseDb.from("work_contract_events").select("id,event,created_at").eq("contract_id", d.contract_id).order("id", { ascending: true }).limit(100)),
        d.milestone_id ? must<MilestoneLite>(looseDb.from("contract_milestones").select("id,title,amount,status").eq("id", d.milestone_id).maybeSingle()) : Promise.resolve(null),
        d.milestone_id ? must<SubLite[]>(looseDb.from("work_submissions").select("id,note,links,created_at").eq("milestone_id", d.milestone_id).order("created_at", { ascending: true })) : Promise.resolve(null),
        d.milestone_id ? must<RevLite[]>(looseDb.from("work_revisions").select("id,note,created_at").eq("milestone_id", d.milestone_id).order("created_at", { ascending: true })) : Promise.resolve(null),
      ]);
      const names = await usernameMap([d.opened_by, c?.client_id, c?.freelancer_id, ...(msgs ?? []).map((m) => m.sender_id)]);
      return { d, c, msgs: msgs ?? [], events: events ?? [], ms, subs: subs ?? [], revs: revs ?? [], names };
    },
  });
  const who = (id: string) => (q.data?.c?.client_id === id ? "Client" : q.data?.c?.freelancer_id === id ? "Freelancer" : "Pengguna") + ` ${at(q.data?.names ?? {}, id)}`;
  return (
    <Dialog open={!!disputeId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Bukti & riwayat sengketa</DialogTitle></DialogHeader>
        <Loading q={q} />
        {q.data && (
          <div className="space-y-4 text-sm">
            <section>
              <h4 className="font-semibold">{q.data.c?.title ?? "Kontrak"}</h4>
              <p className="text-xs text-muted-foreground">Diajukan oleh {who(q.data.d.opened_by)} · {timeAgo(q.data.d.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap">{q.data.d.reason}</p>
            </section>
            <section>
              <h4 className="font-semibold">Bukti dari pengaju</h4>
              {(() => {
                const items = evidenceItems(q.data.d.evidence);
                if (!items.length) return <p className="text-xs text-muted-foreground">Tidak ada bukti terlampir.</p>;
                return <ul className="mt-1 list-disc space-y-0.5 pl-5">{items.map((e, i) => <li key={i} className="break-all">{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{e.label}</a> : e.label}</li>)}</ul>;
              })()}
            </section>
            {q.data.ms && (
              <section>
                <h4 className="font-semibold">Milestone: {q.data.ms.title} · {rp(q.data.ms.amount)} <Pill tone="info">{q.data.ms.status}</Pill></h4>
                {q.data.subs.length === 0 && <p className="text-xs text-muted-foreground">Belum ada hasil yang dikirim.</p>}
                <ul className="mt-1 space-y-1.5">
                  {q.data.subs.map((s) => (
                    <li key={s.id} className="rounded-md bg-muted p-2">
                      <p className="text-xs text-muted-foreground">Hasil dikirim {timeAgo(s.created_at)}</p>
                      <p className="whitespace-pre-wrap">{s.note}</p>
                      {(s.links ?? []).map((l, i) => { const u = evidenceItems([l])[0]?.url; return u ? <a key={i} href={u} target="_blank" rel="noopener noreferrer nofollow" className="block break-all text-xs text-primary underline">{l}</a> : <span key={i} className="block break-all text-xs">{l}</span>; })}
                    </li>
                  ))}
                  {q.data.revs.map((r) => <li key={r.id} className="rounded-md border border-border p-2"><p className="text-xs text-muted-foreground">Revisi diminta client {timeAgo(r.created_at)}</p><p className="whitespace-pre-wrap">{r.note}</p></li>)}
                </ul>
              </section>
            )}
            <section>
              <h4 className="font-semibold">Riwayat kontrak</h4>
              <ul className="mt-1 space-y-0.5 text-xs">{q.data.events.map((e) => <li key={e.id}><span className="text-muted-foreground">{fmtDate(e.created_at)}</span> · {eventLabel(e.event)}</li>)}</ul>
            </section>
            <section>
              <h4 className="font-semibold">Chat lamaran</h4>
              {q.data.msgs.length === 0 && <p className="text-xs text-muted-foreground">Belum ada pesan.</p>}
              <ul className="mt-1 max-h-64 space-y-1.5 overflow-y-auto">
                {q.data.msgs.map((m) => <li key={m.id} className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">{who(m.sender_id)} · {timeAgo(m.created_at)}</p><p className="whitespace-pre-wrap break-words">{m.body}</p></li>)}
              </ul>
            </section>
            {q.data.d.decision && <p className="rounded-md bg-muted p-2"><b>{q.data.d.decision}</b>: {q.data.d.decision_note}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
