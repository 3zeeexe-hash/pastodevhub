import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah } from "@/lib/market";
import { SERVICE_STAGE_LABEL, type ServiceOrderStage } from "@/lib/services";
import type { OrderEventRow, OrderItemRow, RequirementRow, ServiceOrderRow } from "@/lib/services-checkout";
import { PAYMENT_STATUS_LABEL, netAfterCommission, type PaymentStatus } from "@/lib/services-payment";

const TIER_LABEL: Record<string, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };

type PaymentRow = { id: string; midtrans_order_id: string; status: PaymentStatus; gross_amount: number; method: string; bank: string | null; paid_at: string | null; created_at: string };
type OrderMoney = { amount: number; fee_amount: number | null; seller_id: string; buyer_id: string };

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

const stageText = (s: string | null) => (s && s in SERVICE_STAGE_LABEL ? SERVICE_STAGE_LABEL[s as ServiceOrderStage] : s ?? "—");

// Peristiwa sinkronisasi internal tidak ditampilkan ke pengguna; hanya perubahan status yang bermakna.
const HIDDEN_EVENTS = new Set(["sync_skipped", "sync_error"]);

function eventLabel(e: OrderEventRow): string {
  if (e.event === "created") return "Pesanan dibuat";
  if (e.event === "payment_started") return "Pembayaran dimulai";
  if (e.event === "payment_confirmed") return "Pembayaran diterima";
  if (e.event === "work_started") return "Pengerjaan dimulai";
  return `Status: ${stageText(e.from_stage)} → ${stageText(e.to_stage)}`;
}

/**
 * Rincian pesanan jasa berbasis paket: paket yang dipilih, add-on, estimasi, kuota revisi, status alur kerja, lampiran referensi,
 * riwayat pembayaran, dan riwayat status. Tidak menampilkan apa pun bila pesanan bukan pesanan paket (pesanan lama atau
 * permintaan khusus tanpa lampiran). Aksesnya dibatasi RLS (hanya pembeli, penjual, admin).
 * Pembayaran dan escrow tetap dikelola kartu pembayaran/escrow di halaman pesanan; di sini hanya riwayatnya.
 */
export function ServiceOrderSummary({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["service-order-detail", orderId],
    queryFn: async () => {
      const [so, items, reqs, events, payments, money] = await Promise.all([
        rows<ServiceOrderRow>(looseDb.from("service_orders").select("*").eq("order_id", orderId).limit(1)),
        rows<OrderItemRow>(looseDb.from("service_order_items").select("id,kind,name,unit_price,quantity,extra_days,extra_revisions").eq("order_id", orderId).order("created_at")),
        rows<RequirementRow>(looseDb.from("service_requirements").select("id,kind,body,attachments,created_at").eq("order_id", orderId).order("created_at")),
        rows<OrderEventRow>(looseDb.from("service_order_events").select("id,event,from_stage,to_stage,created_at").eq("order_id", orderId).order("id")),
        rows<PaymentRow>(looseDb.from("payments").select("id,midtrans_order_id,status,gross_amount,method,bank,paid_at,created_at").eq("order_id", orderId).order("created_at", { ascending: false })),
        rows<OrderMoney>(looseDb.from("orders").select("amount,fee_amount,seller_id,buyer_id").eq("id", orderId).limit(1)),
      ]);
      return { so: so[0] ?? null, items, attachments: reqs.flatMap((r) => (Array.isArray(r.attachments) ? r.attachments : [])), events, payments, money: money[0] ?? null };
    },
  });
  const d = q.data;
  if (!d || (!d.so && d.attachments.length === 0)) return null;
  const snap = d.so?.package_snapshot;
  const isSeller = !!user && d.money?.seller_id === user.id;
  const fee = d.money?.fee_amount ?? 0;
  const events = d.events.filter((e) => !HIDDEN_EVENTS.has(e.event));

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label="Rincian pesanan jasa">
      <h2 className="text-sm font-semibold">Rincian pesanan jasa</h2>

      {d.so && snap && (
        <div className="space-y-2 text-sm">
          <p><b>{TIER_LABEL[snap.tier ?? ""] ?? snap.tier} · {snap.name}</b></p>
          <p className="text-muted-foreground">
            Status alur kerja: <b className="text-foreground">{stageText(d.so.stage)}</b> · Estimasi {d.so.delivery_days} hari · {d.so.revisions_included} revisi termasuk ({d.so.revisions_used} terpakai)
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
          {isSeller && d.money && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Komisi GoBi {formatRupiah(fee, "Rp0")} · yang kamu terima {formatRupiah(netAfterCommission(d.money.amount, fee), "Rp0")} setelah pesanan selesai dan dana diteruskan admin.
            </p>
          )}
          {d.so.terms_accepted_at && <p className="text-xs text-muted-foreground">Detail pesanan disetujui pembeli {timeAgo(d.so.terms_accepted_at)}.</p>}
        </div>
      )}

      {d.payments.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 font-medium">Riwayat pembayaran</h3>
          <ul className="space-y-1.5">
            {d.payments.map((p) => (
              <li key={p.id} className="rounded-md bg-muted px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-sm">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</b>
                  <span className="font-medium">{formatRupiah(p.gross_amount)}</span>
                </div>
                <p className="text-muted-foreground">{p.method}{p.bank ? ` · ${p.bank.toUpperCase()}` : ""} · {p.paid_at ? `lunas ${timeAgo(p.paid_at)}` : `dibuat ${timeAgo(p.created_at)}`}</p>
                <p className="break-all font-mono text-[11px] text-muted-foreground">Ref: {p.midtrans_order_id}</p>
              </li>
            ))}
          </ul>
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

      {events.length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 font-medium">Riwayat status</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {events.map((e) => <li key={e.id}>{eventLabel(e)} · {timeAgo(e.created_at)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
