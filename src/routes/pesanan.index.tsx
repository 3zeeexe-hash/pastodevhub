import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BellRing, CheckCircle2, ChevronRight, Hourglass, PackageOpen, Search, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSideNav } from "@/components/side-navs";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { AvatarMini } from "@/components/avatar-mini";
import { GobiLoader } from "@/components/gobi-loader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pesanan/")({
  head: () => ({
    meta: [
      { title: "Pesanan — GoBi" },
      { name: "description", content: "Daftar pembelian karya dan pesanan jasa kamu." },
      { property: "og:title", content: "Pesanan — GoBi" },
      { property: "og:description", content: "Pembelian dan pesanan jasa di GoBi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Orders,
});

type Side = "buy" | "sell";
type Group = "all" | "action" | "running" | "done" | "closed";

const GROUPS: { key: Group; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "action", label: "Perlu tindakan" },
  { key: "running", label: "Berjalan" },
  { key: "done", label: "Selesai" },
  { key: "closed", label: "Ditutup" },
];

/** Warna garis aksen di tepi kiri kartu, menurut kelompok status. */
const ACCENT: Record<Exclude<Group, "all">, string> = {
  action: "border-l-primary",
  running: "border-l-link",
  done: "border-l-success",
  closed: "border-l-border",
};

/** Kelompok pesanan menurut status dan sisi: tindakan client (bayar, periksa hasil) berbeda dari tindakan developer (jawab, kerjakan). */
function groupOf(status: OrderStatus, side: Side): Exclude<Group, "all"> {
  switch (status) {
    case "completed": return "done";
    case "declined":
    case "cancelled": return "closed";
    case "requested": return side === "sell" ? "action" : "running";
    case "in_progress": return side === "sell" ? "action" : "running";
    case "awaiting_payment": return side === "buy" ? "action" : "running";
    case "delivered": return side === "buy" ? "action" : "running";
    default: return "running"; // payment_review
  }
}

/** Keterangan satu baris yang menjelaskan langkah berikutnya, supaya daftar bisa dipindai tanpa membuka tiap pesanan. */
function nextStep(status: OrderStatus, side: Side): string | null {
  switch (status) {
    case "requested": return side === "sell" ? "Jawab permintaan ini" : "Menunggu developer menjawab";
    case "awaiting_payment": return side === "buy" ? "Selesaikan pembayaran" : "Menunggu client membayar";
    case "payment_review": return "Pembayaran sedang diverifikasi";
    case "in_progress": return side === "sell" ? "Kerjakan lalu kirim hasil" : "Sedang dikerjakan developer";
    case "delivered": return side === "buy" ? "Periksa hasil, lalu setujui atau minta revisi" : "Menunggu client memeriksa hasil";
    default: return null;
  }
}

type OrderRow = {
  id: string; number: number; kind: "product" | "service"; title: string; amount: number; status: OrderStatus; created_at: string;
  buyer: { username: string; avatar_url: string | null } | null;
  seller: { username: string; avatar_url: string | null } | null;
};

function Orders() {
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<Side>("buy");
  const [group, setGroup] = useState<Group>("all");
  const [search, setSearch] = useState("");
  const isDev = profile?.account_type === "developer";
  const side: Side = isDev && tab === "sell" ? "sell" : "buy";

  const { data = [], isLoading } = useQuery({
    queryKey: ["orders", user?.id, side],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("orders")
      .select("id,number,kind,title,amount,status,created_at, buyer:profiles!orders_buyer_id_fkey(username,avatar_url), seller:profiles!orders_seller_id_fkey(username,avatar_url)")
      .eq(side === "buy" ? "buyer_id" : "seller_id", user!.id).order("updated_at", { ascending: false }).limit(200)).data ?? []) as unknown as OrderRow[],
  });

  // Pesanan jasa paket yang sudah selesai: mana yang sudah diulas. Hanya dipakai di sisi pembeli untuk tombol "Beri ulasan".
  const doneServiceIds = useMemo(() => data.filter((o) => o.kind === "service" && o.status === "completed").map((o) => o.id), [data]);
  const reviewable = useQuery({
    queryKey: ["orders-reviewable", user?.id, side, doneServiceIds.join(",")],
    enabled: !!user && side === "buy" && doneServiceIds.length > 0,
    queryFn: async () => {
      const [pkg, reviewed] = await Promise.all([
        looseDb.from("service_orders").select("order_id").in("order_id", doneServiceIds),
        looseDb.from("service_reviews").select("order_id").in("order_id", doneServiceIds),
      ]);
      const pkgIds = new Set(((pkg.data ?? []) as { order_id: string }[]).map((r) => r.order_id));
      const reviewedIds = new Set(((reviewed.data ?? []) as { order_id: string }[]).map((r) => r.order_id));
      return { pending: new Set([...pkgIds].filter((id) => !reviewedIds.has(id))), reviewed: reviewedIds };
    },
  });

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: data.length, action: 0, running: 0, done: 0, closed: 0 };
    for (const o of data) c[groupOf(o.status, side)]++;
    return c;
  }, [data, side]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((o) => {
      if (group !== "all" && groupOf(o.status, side) !== group) return false;
      if (!q) return true;
      const other = side === "buy" ? o.seller : o.buyer;
      return o.title.toLowerCase().includes(q) || String(o.number).includes(q.replace("#", "")) || (other?.username ?? "").toLowerCase().includes(q);
    });
  }, [data, group, search, side]);

  if (loading) return <GobiLoader page />;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan kamu." /></main>;

  const pendingReviews = reviewable.data?.pending.size ?? 0;

  // Ubin ringkasan: satu ketukan memfilter daftar.
  const tiles: { key: Exclude<Group, "all" | "closed">; label: string; icon: typeof BellRing; tone: string }[] = [
    { key: "action", label: "Perlu tindakan", icon: BellRing, tone: "bg-primary/15 text-primary" },
    { key: "running", label: "Berjalan", icon: Hourglass, tone: "bg-link/10 text-link" },
    { key: "done", label: "Selesai", icon: CheckCircle2, tone: "bg-success/15 text-success" },
  ];

  return (
    <AccountSideNav>
      <div className="mx-auto w-full max-w-4xl pb-24 md:pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Pesanan</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{side === "sell" ? "Permintaan dan pesanan yang masuk ke kamu." : "Pembelian karya dan pesanan jasa kamu."}</p>
          </div>
          {side === "buy" && (
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/jasa">Cari jasa</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/karya">Lihat karya</Link></Button>
            </div>
          )}
        </div>

        {isDev && (
          <div className="mt-4 grid grid-cols-2 rounded-xl bg-muted p-1 sm:max-w-sm" role="tablist" aria-label="Sisi pesanan">
            {([["buy", "Saya beli"], ["sell", "Pesanan masuk"]] as const).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={side === k}
                onClick={() => { setTab(k); setGroup("all"); }}
                className={cn("h-10 rounded-lg text-sm font-medium transition", side === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Ringkasan status */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {tiles.map((t) => {
            const on = group === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(on ? "all" : t.key)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border bg-card p-3 text-left transition hover:border-primary/50 active:scale-[0.98] sm:flex-row sm:items-center sm:gap-3 sm:p-4",
                  on ? "border-primary ring-2 ring-primary/25" : "border-border",
                )}
              >
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10", t.tone)}><t.icon className="size-5" /></span>
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-none tabular-nums sm:text-2xl">{isLoading ? "–" : counts[t.key]}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{t.label}</span>
                </span>
              </button>
            );
          })}
        </div>

        {side === "buy" && pendingReviews > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 text-sm">
            <Star className="size-5 shrink-0 fill-primary text-primary" />
            <p className="min-w-0 flex-1"><b>{pendingReviews} pesanan selesai</b> belum kamu ulas. Ulasanmu membantu pembeli lain.</p>
          </div>
        )}

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari judul, nomor, atau nama" className="h-11 rounded-xl pl-9" aria-label="Cari pesanan" />
        </div>

        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter status pesanan">
          {GROUPS.map((g) => (
            <Button key={g.key} size="sm" variant={group === g.key ? "default" : "secondary"} className="h-9 shrink-0 rounded-full" onClick={() => setGroup(g.key)}>
              {g.label}
              <span className={cn("ml-1.5 text-xs tabular-nums", group === g.key ? "opacity-80" : "text-muted-foreground")}>{counts[g.key]}</span>
            </Button>
          ))}
        </div>

        <ul className="mt-4 space-y-3">
          {isLoading && [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-28 w-full rounded-2xl" /></li>)}
          {shown.map((o) => {
            const other = side === "buy" ? o.seller : o.buyer;
            const step = nextStep(o.status, side);
            const grp = groupOf(o.status, side);
            const urgent = grp === "action";
            const needsReview = side === "buy" && !!reviewable.data?.pending.has(o.id);
            const reviewed = side === "buy" && !!reviewable.data?.reviewed.has(o.id);
            return (
              <li key={o.id}>
                <Link
                  to="/pesanan/$id"
                  params={{ id: o.id }}
                  className={cn(
                    "group flex flex-col gap-3 rounded-2xl border border-l-4 bg-card p-3.5 shadow-sm transition hover:bg-accent/40 hover:shadow-md active:scale-[0.99] sm:flex-row sm:items-center sm:gap-5 sm:p-4",
                    ACCENT[grp],
                    urgent || needsReview ? "border-y-primary/40 border-r-primary/40" : "border-y-border border-r-border",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {other ? <AvatarMini name={other.username} url={other.avatar_url} size={44} /> : <span className="size-11 rounded-full bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words font-semibold leading-snug">{o.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        #{o.number} · {o.kind === "product" ? "Karya" : "Jasa"}{other ? ` · @${other.username}` : ""} · {timeAgo(o.created_at)}
                      </p>
                      {step && <p className={cn("mt-1.5 text-xs", urgent ? "font-medium text-primary" : "text-muted-foreground")}>{step}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3 sm:w-56 sm:shrink-0 sm:flex-col sm:items-end sm:gap-2 sm:border-0 sm:pt-0">
                    <span className="text-base font-bold tabular-nums">{o.amount ? formatRupiah(o.amount) : "—"}</span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {needsReview && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground"><Star className="size-3 fill-current" /> Beri ulasan</span>}
                      {reviewed && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3 fill-primary text-primary" /> Sudah diulas</span>}
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                  <ChevronRight className="hidden size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground sm:block" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>

        {!isLoading && shown.length === 0 && (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><PackageOpen className="size-7" /></span>
            <p className="mt-3 font-semibold">{data.length === 0 ? "Belum ada pesanan" : "Tidak ada pesanan yang cocok"}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {data.length === 0
                ? (side === "sell" ? "Pesanan dari client akan muncul di sini." : "Pesan jasa atau beli karya, lalu pantau prosesnya di sini.")
                : "Coba ubah filter atau kata pencarian."}
            </p>
            {data.length === 0 && side === "buy" && (
              <div className="mt-4 flex gap-2">
                <Button asChild size="sm"><Link to="/jasa">Cari jasa</Link></Button>
                <Button asChild size="sm" variant="outline"><Link to="/karya">Lihat karya</Link></Button>
              </div>
            )}
            {data.length > 0 && (search || group !== "all") && (
              <Button size="sm" variant="outline" className="mt-4" onClick={() => { setSearch(""); setGroup("all"); }}>Reset filter</Button>
            )}
          </div>
        )}
      </div>
    </AccountSideNav>
  );
}
