import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah } from "@/lib/market";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

/** Saldo berbasis escrow (docs/sql/midtrans-escrow/001). */
type WalletRow = { on_hold: number; awaiting_admin: number; available: number; frozen: number; requested: number; paid_out: number };
/** Saldo lama, hanya dipakai selama SQL escrow belum dijalankan. */
type LegacyBalance = { earned: number; on_hold: number; paid_out: number; pending: number; available: number };

const num = (v: unknown) => Number(v ?? 0) || 0;

function StudioHome() {
  const { user, profile } = useAuth();
  const { data } = useQuery({
    queryKey: ["studio-home", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [walletRes, counts] = await Promise.all([
        looseDb.rpc("developer_wallet", { _user_id: user!.id }),
        Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", user!.id),
          supabase.from("services").select("id", { count: "exact", head: true }).eq("owner_id", user!.id),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", user!.id).in("status", ["requested", "in_progress"]),
        ]),
      ]);

      let wallet: WalletRow | null = null;
      let legacy: LegacyBalance | undefined;
      if (!walletRes.error) {
        const r = (walletRes.data as Record<string, unknown>[] | null)?.[0] ?? {};
        wallet = { on_hold: num(r["on_hold"]), awaiting_admin: num(r["awaiting_admin"]), available: num(r["available"]), frozen: num(r["frozen"]), requested: num(r["requested"]), paid_out: num(r["paid_out"]) };
      } else {
        // SQL escrow belum dijalankan owner: pakai saldo lama supaya halaman tetap berfungsi.
        const bal = await supabase.rpc("developer_balance", { _user_id: user!.id });
        legacy = (bal.data as LegacyBalance[] | null)?.[0];
      }
      return { wallet, legacy, products: counts[0].count ?? 0, services: counts[1].count ?? 0, active: counts[2].count ?? 0 };
    },
  });

  const wallet = data?.wallet ?? null;
  const legacy = data?.legacy;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Halo, {profile?.display_name || profile?.username}</h1>
        <p className="text-muted-foreground">Kelola karya, jasa, dan penghasilanmu.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Karya" value={data?.products ?? 0} to="/studio/karya" />
        <Stat label="Jasa" value={data?.services ?? 0} to="/studio/jasa" />
        <Stat label="Pesanan perlu aksi" value={data?.active ?? 0} to="/pesanan" />
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Wallet className="size-5 text-primary" /> Saldo</h2>
          <Button asChild size="sm"><Link to="/studio/saldo"><ArrowUpRight /> Kelola saldo &amp; tarik</Link></Button>
        </div>
        {wallet ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Money label="Tersedia" v={wallet.available} big />
            <Money label="Ditahan (masa tahan 1 hari / pekerjaan berjalan)" v={wallet.on_hold} />
            <Money label="Menunggu konfirmasi admin" v={wallet.awaiting_admin} />
            <Money label="Sedang dicairkan" v={wallet.requested} />
            <Money label="Sudah dicairkan" v={wallet.paid_out} />
            {wallet.frozen > 0 && <Money label="Dibekukan admin" v={wallet.frozen} />}
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Money label="Tersedia" v={legacy?.available} big />
            <Money label="Ditahan (pesanan berjalan)" v={legacy?.on_hold} />
            <Money label="Sedang dicairkan" v={legacy?.pending} />
            <Money label="Sudah dicairkan" v={legacy?.paid_out} />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Penarikan, rekening pencairan, dan riwayat lengkap ada di halaman Saldo &amp; penarikan.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to: "/studio/karya" | "/studio/jasa" | "/pesanan" }) {
  return <Link to={to} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/60"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></Link>;
}
function Money({ label, v, big }: { label: string; v: number | undefined; big?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={big ? "text-2xl font-bold text-primary" : "text-lg font-semibold"}>{formatRupiah(v ?? 0, "Rp0")}</p></div>;
}
