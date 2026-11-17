import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink, Star } from "lucide-react";
import { errMsg, formatRupiah } from "@/lib/market";
import { SERVICE_STAGE_LABEL } from "@/lib/services";
import { serviceRpc } from "@/lib/services-db";
import { BUYER_GROUPS, BUYER_GROUP_LABEL, BUYER_STAGE_HINT, type BuyerGroup, type BuyerOrderRow, type BuyerOrdersResult } from "@/lib/services-buyer";
import { dueState } from "@/lib/services-workflow";
import { AvatarMini } from "@/components/avatar-mini";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const PAGE = 20;

/** Jumlah pesanan jasa yang menunggu tindakan pembeli (untuk lencana tab). 0 bila SQL belum diterapkan. */
export function useBuyerNeedsAction(enabled = true) {
  return useQuery({
    queryKey: ["service-buyer-orders", "badge"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => (await serviceRpc<BuyerOrdersResult>("service_buyer_orders", { _limit: 1 })).counts.needs_action,
  });
}

function toneFor(group: BuyerGroup): "default" | "secondary" | "destructive" | "outline" {
  if (group === "needs_action") return "default";
  if (group === "issues") return "destructive";
  if (group === "working") return "secondary";
  return "outline";
}

function ctaFor(o: BuyerOrderRow): { label: string; primary: boolean } {
  if (o.stage === "awaiting_payment") return { label: "Bayar", primary: true };
  if (o.stage === "submitted") return { label: "Periksa hasil", primary: true };
  if (o.stage === "completed" && !o.has_review) return { label: "Beri ulasan", primary: true };
  return { label: "Buka pesanan", primary: false };
}

function OrderCard({ o }: { o: BuyerOrderRow }) {
  const due = o.group === "working" && (o.stage === "in_progress" || o.stage === "revision_requested") ? dueState(o.due_at) : null;
  const hint = BUYER_STAGE_HINT[o.stage];
  const cta = ctaFor(o);
  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={toneFor(o.group)}>{SERVICE_STAGE_LABEL[o.stage]}</Badge>
        <span className="text-xs text-muted-foreground">#{o.number}</span>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{o.title}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><AvatarMini name={o.seller.username} url={o.seller.avatar_url} size={18} />{o.seller.display_name || o.seller.username}</span>
        {o.package && <span>Paket {o.package}</span>}
        <span><b className="text-foreground">{formatRupiah(o.amount, "Rp0")}</b></span>
        <span>{o.revisions_used}/{o.revisions_included} revisi</span>
        {due && <span className={cn("flex items-center gap-1", due.kind === "overdue" && "font-medium text-destructive")}><Clock className="size-3.5" />{due.label}</span>}
        {o.stage === "completed" && o.has_review && <span className="flex items-center gap-1"><Star className="size-3.5" />Sudah diulas</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Button asChild size="sm" variant={cta.primary ? "default" : "outline"}>
        <Link to="/pesanan/$id" params={{ id: o.id }}><ExternalLink /> {cta.label}</Link>
      </Button>
    </li>
  );
}

/** Pesanan jasa paket milik pembeli, dikelompokkan menurut tindakan yang dibutuhkan. Detail dan aksi ada di halaman pesanan. */
export function BuyerOrders() {
  const [group, setGroup] = useState<BuyerGroup | "all">("needs_action");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["service-buyer-orders", group, page],
    refetchInterval: 60_000,
    queryFn: () => serviceRpc<BuyerOrdersResult>("service_buyer_orders", { _group: group === "all" ? null : group, _limit: PAGE, _offset: page * PAGE }),
  });
  const counts = q.data?.counts;
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Kelompok pesanan jasa">
        {(["all", ...BUYER_GROUPS] as const).map((g) => (
          <Button key={g} size="sm" variant={group === g ? "default" : "secondary"} className="shrink-0" onClick={() => { setGroup(g); setPage(0); }}>
            {g === "all" ? "Semua" : BUYER_GROUP_LABEL[g]}{counts ? ` (${counts[g]})` : ""}
          </Button>
        ))}
      </div>

      {q.isLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
      {q.error && <Alert variant="destructive"><AlertDescription>{errMsg(q.error)}. Pastikan SQL 001 sampai 008 sudah diterapkan.</AlertDescription></Alert>}
      {q.data && q.data.rows.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">{group === "all" ? "Belum ada pesanan jasa berbasis paket." : "Tidak ada pesanan di kelompok ini."}</p>
      )}

      <ul className="space-y-3">
        {q.data?.rows.map((o) => <OrderCard key={o.id} o={o} />)}
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
