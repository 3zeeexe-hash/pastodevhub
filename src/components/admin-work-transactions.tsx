// Tab admin "Transaksi": statistik uang (volume, komisi, escrow, refund, tren mingguan), daftar yang jelas, dan detail lengkap tiap transaksi.
// Hanya MEMBACA. Menahan, membekukan, merefund, dan meneruskan dana tetap di Escrow & saldo dan Pembayaran.
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSignature } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { pickEscrow, type EscrowInfo } from "@/lib/admin-work";
import { pct, txStats, weeklyVolume, type WeekBucket } from "@/lib/admin-work-stats";
import { MILESTONE_STATUS_LABEL, type MilestoneStatus } from "@/lib/work";
import { fmtDate, rp } from "@/lib/work-db";
import { hasText, Loading, must, SearchBox } from "@/components/admin-work-extra";
import {
  Block, countOf, Fact, FilterSelect, fmtCount, fmtDateTime, GroupTitle, handle, Info, MoreButton, profileMap, soft, StatGrid,
  type People,
} from "@/components/admin-work-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContractPill, EmptyState, MilestonePill, Pill, Stat } from "@/components/work-ui";
import type { ContractStatus } from "@/lib/work";

type TxRow = {
  id: string; title: string; amount: number; status: string; paid_at: string | null; fee_amount: number | null;
  buyer_id: string; seller_id: string; work_milestone_id: string | null; work_contract_id: string | null; created_at: string;
  escrow: unknown; payments: { midtrans_order_id: string; status: string; needs_refund: boolean }[] | null;
};
type TxView = { r: TxRow; esc: EscrowInfo | null; fee: number; net: number; needsRefund: boolean };

const ESCROW_LABEL: Record<string, string> = { held: "ditahan", frozen: "dibekukan", released: "diteruskan", refunded: "direfund" };
const FILTERS = [
  ["all", "Semua transaksi"], ["paid", "Sudah dibayar"], ["unpaid", "Belum dibayar"], ["refund", "Perlu refund"],
  ["held", "Escrow ditahan"], ["frozen", "Escrow dibekukan"], ["released", "Escrow diteruskan"], ["refunded", "Escrow direfund"],
] as const;
const SORTS = [["newest", "Terbaru"], ["amount_desc", "Nilai tertinggi"], ["amount_asc", "Nilai terendah"]] as const;

const TX_SELECT = "id,title,amount,status,paid_at,fee_amount,buyer_id,seller_id,work_milestone_id,work_contract_id,created_at,escrow:escrow_ledger(fee,net,status),payments(midtrans_order_id,status,needs_refund)";
const TX_LIMIT = 500;
const PAGE = 30;
const WORK_ORDERS = "work_milestone_id.not.is.null,work_contract_id.not.is.null";

const kindOf = (r: TxRow) => (r.work_milestone_id ? "Pembayaran milestone" : "Tagihan kontrak");
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function WeeklyBars({ data }: { data: WeekBucket[] }) {
  const max = Math.max(1, ...data.map((d) => d.volume));
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <p className="text-sm font-bold">Volume dibayar, 8 minggu terakhir</p>
      <p className="text-xs text-muted-foreground">Tiap batang = 7 hari; angka di bawahnya jumlah transaksi dibayar, label = tanggal mulai.</p>
      <div className="mt-3 grid grid-cols-8 gap-2" role="img" aria-label="Grafik volume transaksi dibayar per minggu">
        {data.map((d) => (
          <div key={d.from} className="min-w-0 text-center" title={`${rp(d.volume)} · ${d.count} transaksi`}>
            <div className="flex h-24 items-end"><div className="w-full rounded-t-md bg-primary/80" style={{ height: `${d.volume > 0 ? Math.max(6, Math.round((d.volume / max) * 100)) : 0}%`, minHeight: 2 }} /></div>
            <p className="mt-1 text-[11px] font-semibold tabular-nums">{d.count}</p>
            <p className="truncate text-[10px] tabular-nums text-muted-foreground">{d.volume > 0 ? compact.format(d.volume) : "—"}</p>
            <p className="truncate text-[10px] text-muted-foreground">{new Date(d.from).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TransactionsTab() {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [term, setTerm] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<TxView | null>(null);

  const q = useQuery({
    queryKey: ["work-admin-transactions"],
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [rows, total] = await Promise.all([
        must<TxRow[]>(looseDb.from("orders").select(TX_SELECT).or(WORK_ORDERS).order("created_at", { ascending: false }).limit(TX_LIMIT)),
        countOf(looseDb.from("orders").select("id", { count: "exact", head: true }).or(WORK_ORDERS)),
      ]);
      const list = rows ?? [];
      return { rows: list, total, people: await profileMap(list.flatMap((r) => [r.buyer_id, r.seller_id])) };
    },
  });
  const people: People = q.data?.people ?? {};
  const views: TxView[] = (q.data?.rows ?? []).map((r) => {
    const esc = pickEscrow(r.escrow);
    const fee = esc?.fee ?? Number(r.fee_amount ?? 0);
    return { r, esc, fee, net: esc?.net ?? Math.max(0, Number(r.amount) - fee), needsRefund: (r.payments ?? []).some((p) => p.needs_refund) };
  });
  const st = txStats(views.map((x) => ({ amount: x.r.amount, paid_at: x.r.paid_at, fee: x.fee, net: x.esc ? x.esc.net : null, escrow: x.esc?.status ?? null, needsRefund: x.needsRefund })));
  const weeks = weeklyVolume(views.map((x) => ({ amount: x.r.amount, paid_at: x.r.paid_at })));
  const truncated = (q.data?.total ?? 0) > views.length;

  const shown = views
    .filter((x) => filter === "all" || (filter === "paid" && x.r.paid_at) || (filter === "unpaid" && !x.r.paid_at) || (filter === "refund" && x.needsRefund) || x.esc?.status === filter)
    .filter((x) => hasText(term, x.r.title, x.r.status, x.esc?.status, people[x.r.buyer_id]?.username, people[x.r.seller_id]?.username, ...(x.r.payments ?? []).map((p) => p.midtrans_order_id)))
    .sort((a, b) => (sort === "amount_desc" ? b.r.amount - a.r.amount : sort === "amount_asc" ? a.r.amount - b.r.amount : 0));

  const escrowCards: [string, string, string][] = [
    ["held", "Dana ditahan", "Sudah dibayar, menunggu hasil disetujui"],
    ["frozen", "Dana dibekukan", "Ditahan karena sengketa/laporan"],
    ["released", "Dana diteruskan", "Sudah masuk saldo freelancer"],
    ["refunded", "Dana direfund", "Dikembalikan ke client"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <GroupTitle>Ringkasan uang</GroupTitle>
        <StatGrid>
          <Stat label="Total transaksi" value={fmtCount(st.total)} hint={`${fmtCount(st.paid)} dibayar · ${fmtCount(st.unpaid)} belum dibayar`} />
          <Stat label="Volume dibayar" value={rp(st.volume)} hint={st.paid ? `Rata-rata ${rp(st.average)} per transaksi` : "Belum ada transaksi dibayar"} />
          <Stat label="Komisi platform" value={rp(st.commission)} hint={st.volume ? `${pct(st.commission, st.volume)}% dari volume dibayar` : undefined} />
          <Stat label="Diterima freelancer" value={rp(st.net)} hint="Setelah komisi dipotong" />
        </StatGrid>
      </div>
      <div>
        <GroupTitle>Posisi dana (escrow)</GroupTitle>
        <StatGrid cols="lg:grid-cols-5">
          {escrowCards.map(([key, label, hint]) => <Stat key={key} label={label} value={rp(st.escrow[key]?.amount ?? 0)} hint={`${fmtCount(st.escrow[key]?.n ?? 0)} transaksi · ${hint}`} />)}
          <Stat label="Perlu refund" value={fmtCount(st.refund)} hint={st.refund > 0 ? "Pembayaran yang ditandai perlu dikembalikan; proses di Escrow & saldo" : "Tidak ada"} />
        </StatGrid>
      </div>
      <WeeklyBars data={weeks} />
      {truncated && <p className="text-xs text-muted-foreground">Statistik dan daftar dihitung dari {fmtCount(views.length)} transaksi terbaru dari total {fmtCount(q.data?.total)}.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={term} onChange={(v) => { setTerm(v); setVisible(PAGE); }} label="Cari transaksi" placeholder="Cari judul, pengguna, atau ref. Midtrans…" />
        <FilterSelect value={filter} onChange={(v) => { setFilter(v); setVisible(PAGE); }} label="Filter transaksi" options={FILTERS} className="w-52" />
        <FilterSelect value={sort} onChange={setSort} label="Urutkan transaksi" options={SORTS} className="w-48" />
      </div>
      <p className="text-xs text-muted-foreground">
        Menampilkan {Math.min(visible, shown.length)} dari {shown.length} transaksi. Tahan, bekukan, refund, dan teruskan dana di <Link to="/admin/escrow" className="text-primary underline">Escrow & saldo</Link>; transfer pencairan di <Link to="/admin/pembayaran" className="text-primary underline">Pembayaran & pencairan</Link>.
      </p>

      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>{term.trim() ? "Tidak ada transaksi yang cocok dengan pencarian." : "Belum ada transaksi GOBI WORK pada filter ini."}</EmptyState>}

      <ul className="space-y-3">
        {shown.slice(0, visible).map((x) => {
          const { r, esc, fee, net, needsRefund } = x;
          return (
            <li key={r.id}>
              <article className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {r.work_contract_id
                      ? <Link to="/kerja/kontrak/$id" params={{ id: r.work_contract_id }} className="break-words font-bold hover:text-primary">{r.title}</Link>
                      : <p className="break-words font-bold">{r.title}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{kindOf(r)} · Client {handle(people[r.buyer_id])} → Freelancer {handle(people[r.seller_id])}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={r.paid_at ? "ok" : "warn"}>{r.paid_at ? "dibayar" : r.status}</Pill>
                    {esc && <Pill tone={esc.status === "frozen" ? "bad" : "info"}>escrow {ESCROW_LABEL[esc.status] ?? esc.status}</Pill>}
                    {needsRefund && <Pill tone="bad">perlu refund</Pill>}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Fact label="Nilai transaksi">{rp(r.amount)}</Fact>
                  <Fact label="Komisi platform" sub={r.paid_at || esc ? <span className="text-xs text-muted-foreground">{pct(fee, r.amount)}% dari nilai</span> : undefined}>{r.paid_at || esc ? rp(fee) : "—"}</Fact>
                  <Fact label="Diterima freelancer">{r.paid_at || esc ? rp(net) : "—"}</Fact>
                  <Fact label={r.paid_at ? "Dibayar" : "Dibuat"} sub={<span className="text-xs text-muted-foreground">{timeAgo(r.paid_at ?? r.created_at)}</span>}>{fmtDate(r.paid_at ?? r.created_at)}</Fact>
                </div>

                {(r.payments ?? []).length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {(r.payments ?? []).map((p) => (
                      <li key={p.midtrans_order_id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="break-all font-mono">Ref. Midtrans: {p.midtrans_order_id}</span>
                        <Pill tone={p.needs_refund ? "bad" : "neutral"}>{p.status}{p.needs_refund ? " · perlu refund" : ""}</Pill>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3"><Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(x)}>Lihat detail lengkap</Button></div>
              </article>
            </li>
          );
        })}
      </ul>
      {visible < shown.length && <MoreButton onClick={() => setVisible((n) => n + PAGE)}>Tampilkan {Math.min(PAGE, shown.length - visible)} lagi</MoreButton>}

      <TxDetail tx={open} people={people} onClose={() => setOpen(null)} />
    </div>
  );
}

type ContractLite = { id: string; title: string; status: string; total_amount: number };
type MilestoneLite = { id: string; title: string; amount: number; status: string; position: number | null };
const ESCROW_DATES: [string, string][] = [["held_at", "Ditahan"], ["frozen_at", "Dibekukan"], ["released_at", "Diteruskan"], ["refunded_at", "Direfund"], ["created_at", "Dicatat"]];
const PAYMENT_FIELDS: [string, string][] = [["payment_type", "Metode"], ["paid_at", "Dibayar"], ["created_at", "Dibuat"]];

function TxDetail({ tx, people, onClose }: { tx: TxView | null; people: People; onClose: () => void }) {
  const q = useQuery({
    enabled: !!tx,
    queryKey: ["work-admin-transaction-detail", tx?.r.id],
    queryFn: async () => {
      const r = tx!.r;
      const [order, contract, milestone] = await Promise.all([
        must<Record<string, unknown>>(looseDb.from("orders").select("*, escrow:escrow_ledger(*), payments(*)").eq("id", r.id).maybeSingle()),
        r.work_contract_id ? soft<ContractLite>(looseDb.from("work_contracts").select("id,title,status,total_amount").eq("id", r.work_contract_id).maybeSingle()) : Promise.resolve(null),
        r.work_milestone_id ? soft<MilestoneLite>(looseDb.from("contract_milestones").select("id,title,amount,status,position").eq("id", r.work_milestone_id).maybeSingle()) : Promise.resolve(null),
      ]);
      const escRaw = order ? (Array.isArray(order.escrow) ? order.escrow[0] : order.escrow) : null;
      const pays = order && Array.isArray(order.payments) ? (order.payments as Record<string, unknown>[]) : [];
      return { escrow: (escRaw && typeof escRaw === "object" ? escRaw : null) as Record<string, unknown> | null, payments: pays, contract, milestone };
    },
  });
  const r = tx?.r;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detail transaksi</DialogTitle>
          <DialogDescription>Rincian pembayaran, komisi, escrow, dan kontrak. Halaman ini hanya membaca data.</DialogDescription>
        </DialogHeader>
        {tx && r && (
          <div className="space-y-4 text-sm">
            <Block title="Ringkasan">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="break-words text-base font-bold">{r.title}</p>
                <span className="flex flex-wrap gap-1.5">
                  <Pill tone={r.paid_at ? "ok" : "warn"}>{r.paid_at ? "dibayar" : r.status}</Pill>
                  {tx.esc && <Pill tone={tx.esc.status === "frozen" ? "bad" : "info"}>escrow {ESCROW_LABEL[tx.esc.status] ?? tx.esc.status}</Pill>}
                  {tx.needsRefund && <Pill tone="bad">perlu refund</Pill>}
                </span>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Jenis">{kindOf(r)}</Info>
                <Info label="Status pesanan">{r.status}</Info>
                <Info label="Nilai transaksi">{rp(r.amount)}</Info>
                <Info label="Komisi platform">{r.paid_at || tx.esc ? `${rp(tx.fee)} (${pct(tx.fee, r.amount)}%)` : "—"}</Info>
                <Info label="Diterima freelancer (bersih)">{r.paid_at || tx.esc ? rp(tx.net) : "—"}</Info>
                <Info label="ID pesanan"><span className="break-all font-mono text-xs">{r.id}</span></Info>
                <Info label="Dibuat">{fmtDateTime(r.created_at)}</Info>
                <Info label="Dibayar">{r.paid_at ? fmtDateTime(r.paid_at) : "Belum dibayar"}</Info>
              </dl>
            </Block>

            <Block title="Pihak yang terlibat">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Client (pembayar)">{people[r.buyer_id] ? <Link to="/$username" params={{ username: people[r.buyer_id]!.username }} className="text-primary underline">{handle(people[r.buyer_id])}</Link> : "—"}</Info>
                <Info label="Freelancer (penerima)">{people[r.seller_id] ? <Link to="/$username" params={{ username: people[r.seller_id]!.username }} className="text-primary underline">{handle(people[r.seller_id])}</Link> : "—"}</Info>
              </dl>
            </Block>

            <Block title="Kontrak & milestone">
              <Loading q={q} />
              {q.data && !q.data.contract && !q.data.milestone && <p className="text-xs text-muted-foreground">Data kontrak tidak ditemukan.</p>}
              {q.data?.contract && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div><p className="font-semibold">{q.data.contract.title}</p><p className="text-xs text-muted-foreground">Nilai kontrak {rp(q.data.contract.total_amount)}</p></div>
                  <span className="flex items-center gap-2">
                    <ContractPill status={q.data.contract.status as ContractStatus} />
                    <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/kerja/kontrak/$id" params={{ id: q.data.contract.id }}><FileSignature /> Buka kontrak</Link></Button>
                  </span>
                </div>
              )}
              {q.data?.milestone && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div><p className="font-semibold">Milestone{q.data.milestone.position != null ? ` ${q.data.milestone.position}` : ""}: {q.data.milestone.title}</p><p className="text-xs text-muted-foreground">{rp(q.data.milestone.amount)}</p></div>
                  {q.data.milestone.status in MILESTONE_STATUS_LABEL ? <MilestonePill status={q.data.milestone.status as MilestoneStatus} /> : <Pill>{q.data.milestone.status}</Pill>}
                </div>
              )}
            </Block>

            <Block title="Escrow">
              {q.data && !q.data.escrow && <p className="text-xs text-muted-foreground">Belum ada catatan escrow (pesanan belum dibayar).</p>}
              {q.data?.escrow && (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Info label="Status">{str(q.data.escrow.status) ? (ESCROW_LABEL[String(q.data.escrow.status)] ?? String(q.data.escrow.status)) : "—"}</Info>
                  <Info label="Komisi">{rp(Number(q.data.escrow.fee ?? 0))}</Info>
                  <Info label="Bersih untuk freelancer">{rp(Number(q.data.escrow.net ?? 0))}</Info>
                  {ESCROW_DATES.map(([k, label]) => str(q.data!.escrow![k]) ? <Info key={k} label={label}>{fmtDateTime(String(q.data!.escrow![k]))}</Info> : null)}
                </dl>
              )}
            </Block>

            <Block title="Pembayaran Midtrans">
              {q.data && q.data.payments.length === 0 && <p className="text-xs text-muted-foreground">Belum ada pembayaran tercatat.</p>}
              <ul className="space-y-2">
                {q.data?.payments.map((p, i) => (
                  <li key={String(p.midtrans_order_id ?? i)} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-mono text-xs">{String(p.midtrans_order_id ?? "—")}</span>
                      <span className="flex gap-1.5"><Pill tone={p.needs_refund ? "bad" : "neutral"}>{String(p.status ?? "—")}</Pill>{p.needs_refund ? <Pill tone="bad">perlu refund</Pill> : null}</span>
                    </div>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                      {PAYMENT_FIELDS.map(([k, label]) => str(p[k]) ? <Info key={k} label={label}>{k.endsWith("_at") ? fmtDateTime(String(p[k])) : String(p[k])}</Info> : null)}
                    </dl>
                  </li>
                ))}
              </ul>
            </Block>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button asChild variant="outline" className="rounded-full"><Link to="/admin/escrow">Kelola di Escrow & saldo</Link></Button>
              <Button asChild variant="ghost" className="rounded-full"><Link to="/admin/pembayaran">Pembayaran & pencairan</Link></Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
