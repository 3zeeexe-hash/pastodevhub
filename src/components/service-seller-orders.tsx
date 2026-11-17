import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, ExternalLink } from "lucide-react";
import { errMsg, formatRupiah } from "@/lib/market";
import { SERVICE_STAGE_LABEL } from "@/lib/services";
import { serviceRpc } from "@/lib/services-db";
import { SELLER_GROUPS, SELLER_GROUP_LABEL, dueState, type SellerGroup, type SellerOrderRow, type SellerOrdersResult } from "@/lib/services-workflow";
import { AvatarMini } from "@/components/avatar-mini";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const PAGE = 20;

/** Jumlah pesanan yang menunggu tindakan penjual (untuk lencana tab). 0 bila SQL belum diterapkan. */
export function useSellerNeedsAction(enabled = true) {
  return useQuery({
    queryKey: ["service-seller-orders", "badge"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => (await serviceRpc<SellerOrdersResult>("service_seller_orders", { _limit: 1 })).counts.needs_action,
  });
}

function toneFor(group: SellerGroup): "default" | "secondary" | "destructive" | "outline" {
  if (group === "needs_action") return "default";
  if (group === "issues") return "destructive";
  if (group === "working" || group === "submitted") return "secondary";
  return "outline";
}

function OrderCard({ o, busy, onAccept }: { o: SellerOrderRow; busy: boolean; onAccept: (id: string) => void }) {
  const due = o.accepted_at && (o.group === "working" || o.group === "needs_action") ? dueState(o.due_at) : null;
  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={toneFor(o.group)}>{SERVICE_STAGE_LABEL[o.stage]}</Badge>
        <span className="text-xs text-muted-foreground">#{o.number}</span>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{o.title}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><AvatarMini name={o.buyer.username} url={o.buyer.avatar_url} size={18} />{o.buyer.display_name || o.buyer.username}</span>
        {o.package && <span>Paket {o.package}</span>}
        <span>Kamu terima <b className="text-foreground">{formatRupiah(o.net, "Rp0")}</b> (total {formatRupiah(o.amount, "Rp0")})</span>
        <span>{o.revisions_used}/{o.revisions_included} revisi</span>
        {due && <span className={cn("flex items-center gap-1", due.kind === "overdue" && "font-medium text-destructive")}><Clock className="size-3.5" />{due.label}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {o.stage === "pending_seller_acceptance" && <Button size="sm" disabled={busy} onClick={() => onAccept(o.id)}><Check /> Terima</Button>}
        <Button asChild size="sm" variant={o.group === "needs_action" ? "secondary" : "outline"}>
          <Link to="/pesanan/$id" params={{ id: o.id }}><ExternalLink /> {o.stage === "pending_seller_acceptance" ? "Lihat dan putuskan" : o.stage === "revision_requested" ? "Kirim revisi" : "Buka pesanan"}</Link>
        </Button>
      </div>
    </li>
  );
}

/** Pesanan masuk penjual: kelompok, tenggat, dan pintasan terima. Detail dan penolakan ada di halaman pesanan. */
export function SellerOrders() {
  const qc = useQueryClient();
  const [group, setGroup] = useState<SellerGroup | "all">("needs_action");
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["service-seller-orders", group, page],
    refetchInterval: 60_000,
    queryFn: () => serviceRpc<SellerOrdersResult>("service_seller_orders", { _group: group === "all" ? null : group, _limit: PAGE, _offset: page * PAGE }),
  });
  const counts = q.data?.counts;
  const total = q.data?.total ?? 0;

  async function accept(id: string) {
    setBusyId(id);
    try {
      await serviceRpc("service_accept_order", { _order_id: id });
      toast.success("Pesanan diterima, selamat mengerjakan");
      await qc.invalidateQueries({ queryKey: ["service-seller-orders"] });
      await qc.invalidateQueries({ queryKey: ["order", id] });
      await qc.invalidateQueries({ queryKey: ["service-workflow", id] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Kelompok pesanan">
        {(["all", ...SELLER_GROUPS] as const).map((g) => (
          <Button key={g} size="sm" variant={group === g ? "default" : "secondary"} className="shrink-0" onClick={() => { setGroup(g); setPage(0); }}>
            {g === "all" ? "Semua" : SELLER_GROUP_LABEL[g]}{counts ? ` (${counts[g]})` : ""}
          </Button>
        ))}
      </div>

      {q.isLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {q.error && <Alert variant="destructive"><AlertDescription>{errMsg(q.error)}. Pastikan SQL 001 sampai 007 sudah diterapkan.</AlertDescription></Alert>}
      {q.data && q.data.rows.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">{group === "all" ? "Belum ada pesanan yang sudah dibayar. Pesanan baru muncul di sini setelah pembeli membayar." : "Tidak ada pesanan di kelompok ini."}</p>
      )}

      <ul className="space-y-3">
        {q.data?.rows.map((o) => <OrderCard key={o.id} o={o} busy={busyId === o.id} onAccept={accept} />)}
      </ul>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} dari {total}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
        </div>
      )}
    </div>
  );
}
