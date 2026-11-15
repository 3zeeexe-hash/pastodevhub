import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah } from "@/lib/market";
import { SERVICE_STAGE_LABEL, type ServiceOrderStage } from "@/lib/services";
import type { OrderEventRow, OrderItemRow, RequirementRow, ServiceOrderRow } from "@/lib/services-checkout";

const TIER_LABEL: Record<string, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

const stageText = (s: string | null) => (s && s in SERVICE_STAGE_LABEL ? SERVICE_STAGE_LABEL[s as ServiceOrderStage] : s ?? "—");

function eventLabel(e: OrderEventRow): string {
  if (e.event === "created") return "Pesanan dibuat";
  return `Status: ${stageText(e.from_stage)} → ${stageText(e.to_stage)}`;
}

/**
 * Rincian pesanan jasa berbasis paket: paket yang dipilih, add-on, estimasi, kuota revisi, lampiran referensi, dan riwayat.
 * Tidak menampilkan apa pun bila pesanan bukan pesanan paket (pesanan lama atau permintaan khusus tanpa lampiran).
 * Aksesnya dibatasi RLS (hanya pembeli, penjual, admin); status pembayaran tetap mengikuti kartu status pesanan di atasnya.
 */
export function ServiceOrderSummary({ orderId }: { orderId: string }) {
  const q = useQuery({
    queryKey: ["service-order-detail", orderId],
    queryFn: async () => {
      const [so, items, reqs, events] = await Promise.all([
        rows<ServiceOrderRow>(looseDb.from("service_orders").select("*").eq("order_id", orderId).limit(1)),
        rows<OrderItemRow>(looseDb.from("service_order_items").select("id,kind,name,unit_price,quantity,extra_days,extra_revisions").eq("order_id", orderId).order("created_at")),
        rows<RequirementRow>(looseDb.from("service_requirements").select("id,kind,body,attachments,created_at").eq("order_id", orderId).order("created_at")),
        rows<OrderEventRow>(looseDb.from("service_order_events").select("id,event,from_stage,to_stage,created_at").eq("order_id", orderId).order("id")),
      ]);
      return { so: so[0] ?? null, items, attachments: reqs.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : [])), events };
    },
  });
  const d = q.data;
  if (!d || (!d.so && d.attachments.length === 0)) return null;
  const snap = d.so?.package_snapshot;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Rincian pesanan jasa">
      <h2 className="text-sm font-semibold">Rincian pesanan jasa</h2>

      {d.so && snap && (
        <div className="space-y-2 text-sm">
          <p><b>{TIER_LABEL[snap.tier ?? ""] ?? snap.tier} · {snap.name}</b></p>
          <p className="text-muted-foreground">
            Estimasi {d.so.delivery_days} hari · {d.so.revisions_included} revisi termasuk ({d.so.revisions_used} terpakai)
            {snap.work_limit ? ` · ${snap.work_limit}` : ""}
          </p>
          {d.items.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {d.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">{i.name}{i.quantity > 1 && ` × ${i.quantity}`}
                    {i.kind === "addon" && (i.extra_days > 0 || i.extra_revisions > 0) && (
                      <span className="block text-xs text-muted-foreground">{i.extra_days > 0 && `+${i.extra_days * i.quantity} hari`}{i.extra_days > 0 && i.extra_revisions > 0 && " · "}{i.extra_revisions > 0 && `+${i.extra_revisions * i.quantity} revisi`}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium">{formatRupiah(i.unit_price * i.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
          {d.so.terms_accepted_at && <p className="text-xs text-muted-foreground">Detail pesanan disetujui pembeli {timeAgo(d.so.terms_accepted_at)}.</p>}
        </div>
      )}

      {d.attachments.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 font-medium">Lampiran referensi</h3>
          <ul className="space-y-1">
            {d.attachments.map((a) => (
              <li key={a.url} className="flex items-center gap-2">
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                <a href={a.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-primary hover:underline">{a.name || a.url}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.events.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 font-medium">Riwayat</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {d.events.map((e) => <li key={e.id}>{eventLabel(e)} · {timeAgo(e.created_at)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
