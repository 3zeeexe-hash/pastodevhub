import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { AccountSideNav } from "@/components/side-navs";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { AvatarMini } from "@/components/avatar-mini";
import { GobiLoader } from "@/components/gobi-loader";
import { BuyerOrders, useBuyerNeedsAction } from "@/components/service-buyer-orders";

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

function Orders() {
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<"buy" | "jasa" | "sell">("buy");
  const isDeveloper = profile?.account_type === "developer";
  const effective = tab === "jasa" ? "jasa" : isDeveloper && tab === "sell" ? "sell" : "buy";
  const needsAction = useBuyerNeedsAction(!!user);
  const pending = needsAction.data ?? 0;
  const { data = [], isLoading } = useQuery({
    queryKey: ["orders", user?.id, effective],
    enabled: !!user && effective !== "jasa",
    queryFn: async () => (await supabase.from("orders")
      .select("id,number,kind,title,amount,status,created_at, buyer:profiles!orders_buyer_id_fkey(username,avatar_url), seller:profiles!orders_seller_id_fkey(username,avatar_url)")
      .eq(effective === "sell" ? "seller_id" : "buyer_id", user!.id).order("updated_at", { ascending: false }).limit(200)).data ?? [],
  });
  if (loading) return <GobiLoader page />;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan kamu." /></main>;
  return (
    <AccountSideNav>
      <h1 className="text-2xl font-bold">Pesanan</h1>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Jenis pesanan">
        <Button role="tab" aria-selected={effective === "buy"} size="sm" variant={effective === "buy" ? "default" : "outline"} onClick={() => setTab("buy")}>Saya beli</Button>
        <Button role="tab" aria-selected={effective === "jasa"} size="sm" variant={effective === "jasa" ? "default" : "outline"} onClick={() => setTab("jasa")}>
          Jasa yang saya pesan{pending > 0 && <span className="ml-1.5 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] leading-5 text-destructive-foreground">{pending > 99 ? "99+" : pending}</span>}
        </Button>
        {isDeveloper && <Button role="tab" aria-selected={effective === "sell"} size="sm" variant={effective === "sell" ? "default" : "outline"} onClick={() => setTab("sell")}>Pesanan masuk</Button>}
      </div>

      {effective === "jasa" && <div className="mt-4"><BuyerOrders /></div>}

      {effective !== "jasa" && (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {isLoading && <GobiLoader />}
          {data.map((o: any) => {
            const other = effective === "buy" ? o.seller : o.buyer;
            return (
              <Link key={o.id} to="/pesanan/$id" params={{ id: o.id }} className="flex flex-wrap items-center gap-3 p-4 hover:bg-accent/40">
                {other && <AvatarMini name={other.username} url={other.avatar_url} size={32} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{o.title}</p>
                  <p className="text-xs text-muted-foreground">#{o.number} · {o.kind === "product" ? "Karya" : "Jasa"} · {other ? `@${other.username}` : ""} · {timeAgo(o.created_at)}</p>
                </div>
                <span className="text-sm font-semibold">{o.amount ? formatRupiah(o.amount) : "—"}</span>
                <OrderStatusBadge status={o.status as OrderStatus} />
              </Link>
            );
          })}
          {!isLoading && data.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Belum ada pesanan.</p>}
        </div>
      )}
    </AccountSideNav>
  );
}
