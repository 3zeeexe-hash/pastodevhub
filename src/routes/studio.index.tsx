import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

const PAYOUT_LABEL: Record<string, string> = { requested: "Diproses", paid: "Sudah ditransfer", rejected: "Ditolak" };

function StudioHome() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ amount: "", bank: "", number: "", name: "" });
  const { data } = useQuery({
    queryKey: ["studio-home", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [bal, payouts, counts] = await Promise.all([
        supabase.rpc("developer_balance", { _user_id: user!.id }),
        supabase.from("payouts").select("*").eq("developer_id", user!.id).order("created_at", { ascending: false }).limit(20),
        Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("owner_id", user!.id),
          supabase.from("services").select("id", { count: "exact", head: true }).eq("owner_id", user!.id),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", user!.id).in("status", ["requested", "in_progress"]),
        ]),
      ]);
      const b = (bal.data as { earned: number; on_hold: number; paid_out: number; pending: number; available: number }[] | null)?.[0];
      return { b, payouts: payouts.data ?? [], products: counts[0].count ?? 0, services: counts[1].count ?? 0, active: counts[2].count ?? 0 };
    },
  });
  async function payout(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(f.amount);
    if (!amount || amount > (data?.b?.available ?? 0)) { toast.error("Jumlah melebihi saldo tersedia."); return; }
    const { error } = await supabase.rpc("request_payout", { _amount: amount, _bank_name: f.bank, _account_number: f.number, _account_name: f.name });
    if (error) toast.error(error.message);
    else { toast.success("Pengajuan pencairan dikirim ke admin"); setF({ ...f, amount: "" }); qc.invalidateQueries({ queryKey: ["studio-home"] }); }
  }
  const b = data?.b;
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
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Wallet className="size-5 text-primary" /> Saldo</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Money label="Tersedia" v={b?.available} big />
          <Money label="Ditahan (pesanan berjalan)" v={b?.on_hold} />
          <Money label="Sedang dicairkan" v={b?.pending} />
          <Money label="Sudah dicairkan" v={b?.paid_out} />
        </div>
        <form onSubmit={payout} className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div><Label htmlFor="amt">Jumlah (Rp)</Label><Input id="amt" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></div>
          <div><Label htmlFor="bank">Bank / e-wallet</Label><Input id="bank" value={f.bank} maxLength={60} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="BCA, Mandiri, DANA…" /></div>
          <div><Label htmlFor="num">Nomor rekening</Label><Input id="num" value={f.number} maxLength={40} onChange={(e) => setF({ ...f, number: e.target.value })} /></div>
          <div><Label htmlFor="nm">Atas nama</Label><Input id="nm" value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <Button className="sm:col-span-2 sm:w-fit" disabled={!b?.available}>Ajukan pencairan</Button>
        </form>
        {(data?.payouts.length ?? 0) > 0 && (
          <ul className="mt-5 divide-y divide-border border-t border-border text-sm">
            {data!.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatRupiah(p.amount)} → {p.bank_name} {p.account_number}</span>
                <span className="text-muted-foreground">{PAYOUT_LABEL[p.status]} · {timeAgo(p.created_at)}{p.admin_note ? ` · ${p.admin_note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to: "/studio/karya" | "/studio/jasa" | "/pesanan" }) {
  return <Link to={to} className="rounded-xl border border-border bg-card p-4 hover:border-primary/60"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></Link>;
}
function Money({ label, v, big }: { label: string; v: number | undefined; big?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={big ? "text-2xl font-bold text-primary" : "text-lg font-semibold"}>{formatRupiah(v ?? 0, "Rp0")}</p></div>;
}
