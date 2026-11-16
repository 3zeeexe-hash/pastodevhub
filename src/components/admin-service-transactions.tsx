// GOBI SERVICES Fase 6: tab admin "Transaksi" — rekonsiliasi dan daftar transaksi pesanan jasa.
// Hanya membaca (service_admin_reconcile / service_admin_transactions). Tidak ada tombol yang mengubah pembayaran, escrow,
// atau payout: itu tetap dikerjakan lewat /admin/escrow dan /admin/pembayaran yang sudah ada.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { formatRupiah } from "@/lib/market";
import {
  PAYMENT_STATUS_LABEL, RECONCILE_LABEL, RECONCILE_URGENT, TX_STATUS_LABEL, TX_STATUS_TONE, netAfterCommission, transactionStatus,
  type AdminTransactionList, type ReconcileIssue,
} from "@/lib/services-payment";
import { serviceRpc } from "@/lib/services-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Pill } from "@/components/work-ui";

const PAGE = 20;
const STATUS_OPTIONS = [{ value: "all", label: "Semua status" }, ...(["pending", "paid", "expired", "cancelled", "denied", "failed", "superseded"] as const).map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))];

function Reconciliation() {
  const q = useQuery({ queryKey: ["svc-admin", "reconcile"], queryFn: () => serviceRpc<ReconcileIssue[]>("service_admin_reconcile"), staleTime: 30_000 });
  const issues = q.data ?? [];
  const urgent = issues.filter((i) => RECONCILE_URGENT.has(i.code));
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4" aria-label="Rekonsiliasi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Rekonsiliasi</h3>
          <p className="text-xs text-muted-foreground">Mencocokkan pembayaran, pesanan, escrow, komisi, dan status alur kerja. Hanya membaca.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Memeriksa…" : "Periksa ulang"}</Button>
      </div>
      {q.isLoading && <Skeleton className="h-16 rounded-lg" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && issues.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada ketidaksesuaian. Semua pembayaran pesanan jasa cocok dengan pesanan, escrow, dan status alur kerja.</p>}
      {q.data && issues.length > 0 && (
        <>
          <p className="text-sm"><b>{issues.length}</b> temuan{urgent.length > 0 && <> · <b className="text-destructive">{urgent.length} menyangkut uang</b></>}{issues.length === 200 && " (ditampilkan 200 pertama)"}</p>
          <ul className="space-y-1.5">
            {[...issues].sort((a, b) => Number(RECONCILE_URGENT.has(b.code)) - Number(RECONCILE_URGENT.has(a.code))).map((i, idx) => (
              <li key={`${i.code}-${i.order_id}-${idx}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2 text-sm">
                <Pill tone={RECONCILE_URGENT.has(i.code) ? "bad" : "warn"}>{RECONCILE_LABEL[i.code]}</Pill>
                <Link to="/pesanan/$id" params={{ id: i.order_id }} className="font-medium text-primary hover:underline">#{i.number}</Link>
                <span className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{i.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ServicesTransactions() {
  const [status, setStatus] = useState("all");
  const [text, setText] = useState("");
  const [applied, setApplied] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["svc-admin", "transactions", status, applied, from, to, page],
    queryFn: () => serviceRpc<AdminTransactionList>("service_admin_transactions", {
      _status: status === "all" ? null : status, _q: applied || null, _from: from || null, _to: to || null, _limit: PAGE, _offset: page * PAGE,
    }),
  });
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <Reconciliation />

      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(text.trim()); setPage(0); }}>
        <div className="w-48">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger aria-label="Status pembayaran"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="text-xs text-muted-foreground">Dari<Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-40" /></label>
        <label className="text-xs text-muted-foreground">Sampai<Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-40" /></label>
        <Input className="min-w-40 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari referensi, nomor pesanan, atau pengguna" aria-label="Cari transaksi" maxLength={80} />
        <Button type="submit" variant="secondary"><Search /> Cari</Button>
      </form>

      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState>Tidak ada transaksi pesanan jasa pada filter ini.</EmptyState>}

      <ul className="space-y-2">
        {q.data?.rows.map((t) => {
          const tx = transactionStatus({ status: t.status, needs_refund: t.needs_refund, escrow_status: t.escrow_status });
          const commission = t.commission ?? 0;
          return (
            <li key={t.id} className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={TX_STATUS_TONE[tx]}>{TX_STATUS_LABEL[tx]}</Pill>
                <Link to="/pesanan/$id" params={{ id: t.order.id }} className="font-semibold text-primary hover:underline">#{t.order.number}</Link>
                <span className="min-w-0 flex-1 truncate">{t.order.title}</span>
                {!t.order.is_package && <span className="text-xs text-muted-foreground">pesanan lama</span>}
                <b>{formatRupiah(t.gross)}</b>
              </div>
              <p className="grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                <span>Referensi: <span className="font-mono">{t.reference}</span> ({t.provider}{t.mode ? `, ${t.mode}` : ""})</span>
                <span>Metode: {t.method}{t.bank ? ` · ${t.bank.toUpperCase()}` : ""}</span>
                <span>Status pembayaran: {PAYMENT_STATUS_LABEL[t.status]}</span>
                <span>Pembeli @{t.buyer.username} → penjual @{t.seller.username}</span>
                <span>Komisi {formatRupiah(commission, "Rp0")} · bersih {formatRupiah(t.net ?? netAfterCommission(t.gross, commission), "Rp0")}</span>
                <span>{t.paid_at ? `Lunas ${timeAgo(t.paid_at)}` : `Dibuat ${timeAgo(t.created_at)}`}{t.order.stage ? ` · alur: ${t.order.stage}` : ""}</span>
              </p>
            </li>
          );
        })}
      </ul>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} dari {total}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Rilis dana, refund, dan pencairan dilakukan di <Link to="/admin/escrow" className="underline">Escrow &amp; saldo</Link> dan <Link to="/admin/pembayaran" className="underline">Pembayaran &amp; pencairan</Link>. Biaya provider belum dicatat (Midtrans tidak mengirimkannya di notifikasi), jadi "bersih" = dibayar dikurangi komisi GoBi.</p>
    </div>
  );
}
