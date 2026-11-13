import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Pill, Stat } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/pembayaran")({ component: Payments });

type Ord = { id: string; title: string; amount: number; status: string; paid_at: string | null; buyer_id: string; seller_id: string; work_milestone_id: string | null; work_contract_id: string | null; created_at: string };
type Esc = { order_id: string; fee: number; net: number; status: string };
type Stats = { client: Record<string, number>; freelancer: Record<string, number | null> };

const ESC_LABEL: Record<string, string> = { held: "Ditahan escrow", frozen: "Dibekukan (sengketa)", released: "Dana diteruskan", refunded: "Dikembalikan" };

function Payments() {
  const { user } = useAuth();
  const uid = user!.id;
  const stats = useQuery({ queryKey: ["work-stats"], queryFn: () => workRpc<Stats>("work_dashboard_stats") });
  const q = useQuery({
    queryKey: ["work-payments", uid],
    queryFn: async () => {
      const o = await looseDb.from("orders").select("id,title,amount,status,paid_at,buyer_id,seller_id,work_milestone_id,work_contract_id,created_at").or(`buyer_id.eq.${uid},seller_id.eq.${uid}`).order("created_at", { ascending: false }).limit(200);
      if (o.error) throw new Error(errMsg(o.error));
      const rows = ((o.data ?? []) as Ord[]).filter((r) => r.work_milestone_id || r.work_contract_id);
      const ids = rows.map((r) => r.id);
      const esc: Record<string, Esc> = {};
      if (ids.length) {
        const e = await looseDb.from("escrow_ledger").select("order_id,fee,net,status").in("order_id", ids);
        if (!e.error) for (const r of (e.data ?? []) as Esc[]) esc[r.order_id] = r;
      }
      return { rows, esc };
    },
  });
  const s = stats.data;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Pembayaran</h1>
        <p className="mt-1 text-sm text-muted-foreground">Semua pembayaran proyek, milestone, dan jam kerja lewat Midtrans. Dana ditahan escrow dan diteruskan admin setelah hasil disetujui.</p>
      </header>
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total kamu bayar (client)" value={rp(s.client.paid_total)} />
          <Stat label="Transaksi (client)" value={s.client.transactions} />
          <Stat label="Dana diteruskan (freelancer)" value={rp(s.freelancer.earned)} />
          <Stat label="Dana tertahan (freelancer)" value={rp(s.freelancer.pending_payout)} />
        </div>
      )}
      {stats.error && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        Pencairan ke rekening dilakukan dari saldo di <Link to="/studio" className="text-primary underline">Studio</Link> dan hanya bisa diajukan untuk dana yang sudah diteruskan admin. Komisi platform dan biaya Midtrans ditampilkan per pesanan.
      </p>
      {q.isLoading && <Skeleton className="h-32 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState>Belum ada transaksi GOBI WORK.</EmptyState>}
      <ul className="space-y-3">
        {q.data?.rows.map((r) => {
          const e = q.data.esc[r.id];
          const mine = r.buyer_id === uid ? "Kamu membayar" : "Kamu menerima";
          return (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.title}</p>
                <Pill tone={r.paid_at ? "ok" : "warn"}>{r.paid_at ? "Dibayar" : "Menunggu pembayaran"}</Pill>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{mine} {rp(r.amount)} · {timeAgo(r.created_at)}</p>
              {e && <p className="mt-1 text-xs text-muted-foreground">{ESC_LABEL[e.status] ?? e.status} · komisi {rp(e.fee)} · diterima freelancer {rp(e.net)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><Link to="/pesanan/$id" params={{ id: r.id }}>Detail &amp; bayar</Link></Button>
                {r.work_contract_id && <Button asChild size="sm" variant="ghost"><Link to="/kerja/kontrak/$id" params={{ id: r.work_contract_id }}>Kontrak</Link></Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
