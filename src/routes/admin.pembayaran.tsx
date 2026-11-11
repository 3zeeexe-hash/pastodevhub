import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { formatRupiah } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/pembayaran")({
  head: () => ({ meta: [{ title: "Pembayaran & pencairan — Admin Pastodev" }, { name: "description", content: "Pengaturan pembayaran, verifikasi pembayaran, dan pencairan dana developer." }, { name: "robots", content: "noindex" }] }),
  component: PaymentsPage,
});

type Settings = { bank_name: string; account_number: string; account_name: string; qris_url: string; payment_instructions: string; fee_percent: string };

function PaymentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState<Settings>({ bank_name: "", account_number: "", account_name: "", qris_url: "", payment_instructions: "", fee_percent: "10" });
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [settings, reviews, payouts] = await Promise.all([
        supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("orders").select("id,number,title,amount,updated_at").eq("status", "payment_review").order("updated_at"),
        supabase.from("payouts").select("*, developer:profiles!payouts_developer_id_fkey(username,display_name)").eq("status", "requested").order("created_at"),
      ]);
      return { settings: settings.data, reviews: reviews.data ?? [], payouts: (payouts.data ?? []) as any[] };
    },
  });
  useEffect(() => {
    const s = data?.settings;
    if (s) setF({ bank_name: s.bank_name ?? "", account_number: s.account_number ?? "", account_name: s.account_name ?? "", qris_url: s.qris_url ?? "", payment_instructions: s.payment_instructions ?? "", fee_percent: String(s.fee_percent ?? 10) });
  }, [data?.settings?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const fee = Number(f.fee_percent);
    if (!(fee >= 0 && fee <= 50)) { toast.error("Biaya platform 0–50%."); return; }
    setBusy(true);
    // Only the payment columns: the announcement columns are managed in Fitur & pengumuman.
    const { error } = await supabase.from("app_settings").update({
      bank_name: f.bank_name || null, account_number: f.account_number || null, account_name: f.account_name || null,
      qris_url: f.qris_url || null, payment_instructions: f.payment_instructions, fee_percent: fee, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Pengaturan pembayaran disimpan"); qc.invalidateQueries({ queryKey: ["admin"] }); }
  }
  async function payout(id: string, approve: boolean) {
    const note = approve ? "" : prompt("Alasan penolakan?") ?? "";
    const { error } = await supabase.rpc("process_payout", { _payout_id: id, _approve: approve, _note: note });
    if (error) toast.error(error.message); else { toast.success(approve ? "Ditandai sudah ditransfer" : "Pencairan ditolak"); qc.invalidateQueries({ queryKey: ["admin"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); }
  }
  const field = (k: keyof Settings, label: string, ph = "") => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Pembayaran perlu diverifikasi ({data?.reviews.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {data?.reviews.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>#{o.number} · {o.title} · <b>{formatRupiah(o.amount)}</b> · {timeAgo(o.updated_at)}</span>
              <Button asChild size="sm"><Link to="/pesanan/$id" params={{ id: o.id }}>Cek bukti</Link></Button>
            </li>
          ))}
          {data?.reviews.length === 0 && <li className="py-2 text-muted-foreground">Tidak ada.</li>}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Pengajuan pencairan ({data?.payouts.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {data?.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>@{p.developer?.username} · <b>{formatRupiah(p.amount)}</b> → {p.bank_name} {p.account_number} a.n. {p.account_name}</span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => payout(p.id, true)}>Sudah ditransfer</Button>
                <Button size="sm" variant="ghost" onClick={() => payout(p.id, false)}>Tolak</Button>
              </span>
            </li>
          ))}
          {data?.payouts.length === 0 && <li className="py-2 text-muted-foreground">Tidak ada.</li>}
        </ul>
      </section>
      <form onSubmit={saveSettings} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Rekening & QRIS platform</h2>
        {field("bank_name", "Bank / e-wallet", "BCA")}
        {field("account_number", "Nomor rekening")}
        {field("account_name", "Atas nama")}
        {field("qris_url", "Link gambar QRIS", "https://…")}
        {field("fee_percent", "Biaya platform (%)")}
        <div className="sm:col-span-2"><Label htmlFor="pi">Instruksi pembayaran</Label><Textarea id="pi" value={f.payment_instructions} onChange={(e) => setF({ ...f, payment_instructions: e.target.value })} /></div>
        <Button className="sm:w-fit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan</Button>
      </form>
    </div>
  );
}
