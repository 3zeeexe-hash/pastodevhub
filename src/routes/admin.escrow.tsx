import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth, timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah } from "@/lib/market";
import { ESCROW_STATUS_LABEL, escrowStage, methodLabel } from "@/lib/midtrans-shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/escrow")({
  head: () => ({ meta: [{ title: "Escrow — Admin Pastodev" }, { name: "description", content: "Dana ditahan, konfirmasi manual pelepasan saldo ke developer, dan refund." }, { name: "robots", content: "noindex" }] }),
  component: EscrowPage,
});

type Row = {
  order_id: string; kind: string; gross: number; fee: number; net: number; status: string; held_until: string; released_at: string | null; note: string | null; created_at: string;
  order: { number: number; title: string; status: string; completed_at: string | null } | null;
  developer: { username: string } | null;
};
type RefundRow = { id: string; midtrans_order_id: string; gross_amount: number; method: string; paid_at: string | null; order: { id: string; number: number; title: string } | null };

function EscrowPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-escrow", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [l, p] = await Promise.all([
        looseDb.from("escrow_ledger").select("*, order:orders(number,title,status,completed_at), developer:profiles!escrow_ledger_developer_id_fkey(username)").order("created_at", { ascending: false }).limit(300),
        looseDb.from("payments").select("id,midtrans_order_id,gross_amount,method,paid_at,order:orders(id,number,title)").eq("needs_refund", true).order("created_at", { ascending: false }).limit(100),
      ]);
      if (l.error) throw l.error;
      return { rows: (l.data ?? []) as Row[], refunds: (p.data ?? []) as unknown as RefundRow[] };
    },
  });

  async function act(fn: string, args: Record<string, unknown>, ok: string) {
    const { error: e } = await looseDb.rpc(fn, args);
    if (e) toast.error(errMsg(e));
    else { toast.success(ok); qc.invalidateQueries({ queryKey: ["admin-escrow"] }); }
  }

  const now = Date.now();
  const rows = data?.rows ?? [];
  const matured = (r: Row) => new Date(r.held_until).getTime() <= now;
  const ready = rows.filter((r) => escrowStage(r, r.kind, r.order?.status ?? "", now) === "ready_for_admin");
  const holding = rows.filter((r) => r.status === "held" && !ready.includes(r));
  const frozen = rows.filter((r) => r.status === "frozen");
  const history = rows.filter((r) => r.status === "released" || r.status === "refunded");
  const sum = (list: Row[]) => list.reduce((a, r) => a + Number(r.net), 0);

  function RowItem({ r, actions }: { r: Row; actions: React.ReactNode }) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div className="min-w-0">
          <p>
            {r.order ? <Link to="/pesanan/$id" params={{ id: r.order_id }} className="font-medium hover:underline">#{r.order.number} · {r.order.title}</Link> : r.order_id}
          </p>
          <p className="text-xs text-muted-foreground">
            @{r.developer?.username ?? "?"} · {r.kind === "service" ? "Jasa" : "Karya"} · developer <b>{formatRupiah(r.net)}</b> (total {formatRupiah(r.gross)}, biaya {formatRupiah(r.fee, "Rp0")})
            · {ESCROW_STATUS_LABEL[r.status] ?? r.status}
            {r.status === "held" && !matured(r) && ` · ditahan sampai ${new Date(r.held_until).toLocaleString("id-ID")}`}
            {r.note && ` · ${r.note}`}
          </p>
        </div>
        <div className="flex gap-2">{actions}</div>
      </li>
    );
  }

  const release = (r: Row) => (
    <Button size="sm" onClick={() => { if (confirm(`Teruskan ${formatRupiah(r.net)} ke @${r.developer?.username}? Tindakan manual ini tercatat.`)) act("admin_release_escrow", { _order_id: r.order_id, _note: "" }, "Saldo diteruskan ke developer"); }}>Teruskan saldo</Button>
  );
  const freeze = (r: Row) => (
    <Button size="sm" variant="outline" onClick={() => { const n = prompt("Alasan membekukan dana?"); if (n) act("admin_set_escrow", { _order_id: r.order_id, _action: "freeze", _note: n }, "Dana dibekukan"); }}>Bekukan</Button>
  );
  const refund = (r: Row) => (
    <Button size="sm" variant="ghost" onClick={() => { const n = prompt("Alasan refund? (uang dikembalikan manual di dashboard Midtrans)"); if (n) act("admin_set_escrow", { _order_id: r.order_id, _action: "refund", _note: n }, "Ditandai refund"); }}>Tandai refund</Button>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Siap diteruskan (menunggu admin)" v={sum(ready)} n={ready.length} big />
        <Stat label="Masih ditahan" v={sum(holding)} n={holding.length} />
        <Stat label="Dibekukan" v={sum(frozen)} n={frozen.length} />
        <Stat label="Perlu refund" v={(data?.refunds ?? []).reduce((a, p) => a + Number(p.gross_amount), 0)} n={data?.refunds.length ?? 0} />
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{errMsg(error)} — pastikan SQL di docs/sql/midtrans-escrow sudah dijalankan.</p>}
      {isLoading && <p className="text-muted-foreground">Memuat…</p>}

      <Tabs defaultValue="ready">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="ready">Siap diteruskan ({ready.length})</TabsTrigger>
          <TabsTrigger value="holding">Ditahan ({holding.length})</TabsTrigger>
          <TabsTrigger value="frozen">Dibekukan ({frozen.length})</TabsTrigger>
          <TabsTrigger value="refund">Perlu refund ({data?.refunds.length ?? 0})</TabsTrigger>
          <TabsTrigger value="history">Riwayat ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ready">
          <p className="mb-2 text-xs text-muted-foreground">Jasa yang sudah diterima client dan lewat masa tahan 1 hari. Tidak ada yang diteruskan otomatis; tekan tombol setelah kamu memeriksa pesanan.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {ready.map((r) => <RowItem key={r.order_id} r={r} actions={<>{release(r)}{freeze(r)}</>} />)}
            {ready.length === 0 && <li className="py-3 text-sm text-muted-foreground">Tidak ada.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="holding">
          <p className="mb-2 text-xs text-muted-foreground">Dana yang belum memenuhi syarat. Karya otomatis tersedia untuk developer setelah 1 hari; jasa menunggu hasil dan penerimaan client.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {holding.map((r) => <RowItem key={r.order_id} r={r} actions={<>{freeze(r)}{refund(r)}</>} />)}
            {holding.length === 0 && <li className="py-3 text-sm text-muted-foreground">Tidak ada.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="frozen">
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {frozen.map((r) => <RowItem key={r.order_id} r={r} actions={<><Button size="sm" variant="outline" onClick={() => act("admin_set_escrow", { _order_id: r.order_id, _action: "unfreeze", _note: "" }, "Pembekuan dicabut")}>Cabut pembekuan</Button>{refund(r)}</>} />)}
            {frozen.length === 0 && <li className="py-3 text-sm text-muted-foreground">Tidak ada.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="refund">
          <p className="mb-2 text-xs text-muted-foreground">Pembayaran ganda atau refund dari Midtrans. Kembalikan uang lewat dashboard Midtrans, lalu tandai selesai di sini.</p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {(data?.refunds ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>{p.order ? <Link to="/pesanan/$id" params={{ id: p.order.id }} className="font-medium hover:underline">#{p.order.number} · {p.order.title}</Link> : p.midtrans_order_id} · {formatRupiah(p.gross_amount)} · {methodLabel(p.method)}{p.paid_at ? ` · ${timeAgo(p.paid_at)}` : ""}</span>
                <Button size="sm" variant="outline" onClick={() => { const n = prompt("Catatan (mis. sudah direfund di Midtrans)") ?? ""; act("admin_clear_refund_flag", { _payment_id: p.id, _note: n }, "Ditandai sudah ditangani"); }}>Sudah ditangani</Button>
              </li>
            ))}
            {(data?.refunds.length ?? 0) === 0 && <li className="py-3 text-sm text-muted-foreground">Tidak ada.</li>}
          </ul>
        </TabsContent>
        <TabsContent value="history">
          <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            {history.map((r) => <RowItem key={r.order_id} r={r} actions={null} />)}
            {history.length === 0 && <li className="py-3 text-sm text-muted-foreground">Belum ada.</li>}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, v, n, big }: { label: string; v: number; n: number; big?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={big ? "text-2xl font-bold text-primary" : "text-xl font-semibold"}>{formatRupiah(v, "Rp0")}</p>
      <p className="text-xs text-muted-foreground">{n} pesanan</p>
    </div>
  );
}
