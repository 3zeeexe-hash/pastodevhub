import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { AvatarMini } from "@/components/avatar-mini";

export const Route = createFileRoute("/pesanan/")({
  head: () => ({
    meta: [
      { title: "Pesanan — Pastodev" },
      { name: "description", content: "Daftar pembelian karya dan pesanan jasa kamu." },
      { property: "og:title", content: "Pesanan — Pastodev" },
      { property: "og:description", content: "Pembelian dan pesanan jasa di Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Orders,
});

function Orders() {
  const { user, profile, loading } = useAuth();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const effective = profile?.account_type === "developer" && tab === "sell" ? "sell" : "buy";
  const { data = [], isLoading } = useQuery({
    queryKey: ["orders", user?.id, effective],
    enabled: !!user,
    queryFn: async () => (await supabase.from("orders")
      .select("id,number,kind,title,amount,status,created_at, buyer:profiles!orders_buyer_id_fkey(username,avatar_url), seller:profiles!orders_seller_id_fkey(username,avatar_url)")
      .eq(effective === "buy" ? "buyer_id" : "seller_id", user!.id).order("updated_at", { ascending: false }).limit(200)).data ?? [],
  });
  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan kamu." /></main>;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Pesanan</h1>
      {profile?.account_type === "developer" && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant={effective === "buy" ? "default" : "outline"} onClick={() => setTab("buy")}>Saya beli</Button>
          <Button size="sm" variant={effective === "sell" ? "default" : "outline"} onClick={() => setTab("sell")}>Pesanan masuk</Button>
        </div>
      )}
      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
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
    </main>
  );
}
