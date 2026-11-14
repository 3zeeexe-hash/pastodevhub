import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Download, Eye, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { errMsg, formatRupiah, orderActions, type OrderStatus } from "@/lib/market";
import { downloadProduct } from "@/lib/downloads";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { OrderProgress } from "@/components/order-progress";
import { EscrowBox } from "@/components/escrow-box";
import { MidtransPayDialog } from "@/components/midtrans-pay-dialog";

export const Route = createFileRoute("/pesanan/$id")({
  head: () => ({
    meta: [
      { title: "Detail pesanan — Pastodev" },
      { name: "description", content: "Status pesanan, pembayaran, dan chat dengan developer." },
      { property: "og:title", content: "Detail pesanan — Pastodev" },
      { property: "og:description", content: "Status pesanan dan chat di Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

type Party = { username: string; display_name: string | null; avatar_url: string | null };

function OrderPage() {
  const { id } = Route.useParams();
  const { user, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["order", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const o = await supabase.from("orders").select("*, buyer:profiles!orders_buyer_id_fkey(username,display_name,avatar_url), seller:profiles!orders_seller_id_fkey(username,display_name,avatar_url), product:products(id,file_path,file_name)").eq("id", id).maybeSingle();
      return { o: o.data as (NonNullable<typeof o.data> & { buyer: Party | null; seller: Party | null; product: { id: string; file_path: string | null; file_name: string | null } | null }) | null };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["order-messages", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["escrow", id] });
    qc.invalidateQueries({ queryKey: ["pay-active", id] });
  };

  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan." /></main>;
  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!data?.o) return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p>Pesanan tidak ditemukan.</p>
      <Button asChild variant="secondary" className="mt-4"><Link to="/pesanan">Kembali ke daftar pesanan</Link></Button>
    </main>
  );
  const { o } = data;
  const actions = orderActions({ kind: o.kind as "product" | "service", status: o.status as OrderStatus, buyer_id: o.buyer_id, seller_id: o.seller_id }, { id: user.id, isAdmin });
  const isBuyer = user.id === o.buyer_id;
  const isSeller = user.id === o.seller_id;
  const canPay = actions.includes("pay");

  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn as "cancel_order", args as { _order_id: string });
    if (error) toast.error(error.message); else { toast.success(ok); refresh(); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground"><Link to="/pesanan" className="hover:underline">Pesanan</Link> / #{o.number}</p>
          <h1 className="mt-1 text-2xl font-bold">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <OrderStatusBadge status={o.status as OrderStatus} />
            <span className="text-muted-foreground">{o.kind === "product" ? "Pembelian karya" : "Pesanan jasa"} · dibuat {timeAgo(o.created_at)}</span>
          </div>
        </div>
        {/* Chat pesanan ada di tombol bulat mengambang; tombol ini membukanya langsung. */}
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => openChatDock({ view: "order" })}><MessageCircle /> Chat</Button>
      </div>

      <OrderProgress status={o.status as OrderStatus} isBuyer={isBuyer} isSeller={isSeller} showSteps={o.kind === "service"} />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <PartyBox label="Client" p={o.buyer} />
        <PartyBox label="Developer" p={o.seller} />
        <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold text-primary">{o.amount ? formatRupiah(o.amount) : "Belum ditentukan"}</p></div>
      </div>
      {o.brief && <section className="rounded-lg border border-border bg-card p-4"><h2 className="mb-1 text-sm font-semibold">Kebutuhan client</h2><p className="whitespace-pre-wrap break-words text-sm">{o.brief}</p></section>}
      {o.delivery_note && <section className="rounded-lg border border-success/50 bg-card p-4"><h2 className="mb-1 text-sm font-semibold">Catatan hasil dari developer</h2><p className="whitespace-pre-wrap break-words text-sm">{o.delivery_note}</p></section>}
      {o.admin_note && <p className="rounded-md bg-muted p-3 text-sm"><b>Catatan admin:</b> {o.admin_note}</p>}

      {actions.includes("accept") && <AcceptBox defaultAmount={o.amount} onAccept={(a) => run("respond_service_order", { _order_id: o.id, _accept: true, _amount: a }, "Pesanan diterima")} onDecline={() => run("respond_service_order", { _order_id: o.id, _accept: false, _amount: 0 }, "Pesanan ditolak")} />}
      {canPay && <PayNowBox amount={o.amount} onPay={() => setPayOpen(true)} />}
      {actions.includes("verify") && <VerifyBox proof={o.payment_proof_path} note={o.payment_note} onReview={(ok, note) => run("review_payment", { _order_id: o.id, _approve: ok, _note: note }, ok ? "Pembayaran disetujui" : "Bukti ditolak")} />}
      <EscrowBox order={{ id: o.id, kind: o.kind, status: o.status }} isAdmin={isAdmin} isSeller={isSeller} onChanged={refresh} />
      {actions.includes("deliver") && <DeliverBox onDeliver={(n) => run("deliver_order", { _order_id: o.id, _note: n }, "Hasil dikirim ke client")} />}
      {actions.includes("complete") && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Periksa hasilnya dulu. Kalau masih ada yang kurang, tekan <b>Minta revisi</b>. <b>Tandai selesai</b> berarti kamu menerima hasil; dana tetap ditahan admin minimal 1 hari, lalu admin meneruskannya ke developer secara manual.
        </p>
      )}
      {(actions.includes("complete") || actions.includes("cancel")) && (
        <div className="flex flex-wrap gap-2">
          {actions.includes("complete") && <Button onClick={() => run("complete_order", { _order_id: o.id }, "Pesanan selesai")}><Check /> Tandai selesai</Button>}
          {actions.includes("revise") && <Button variant="outline" onClick={() => run("request_revision", { _order_id: o.id }, "Revisi diminta")}>Minta revisi</Button>}
          {actions.includes("cancel") && <Button variant="ghost" onClick={() => { if (confirm("Batalkan pesanan ini?")) run("cancel_order", { _order_id: o.id }, "Pesanan dibatalkan"); }}><X /> Batalkan</Button>}
        </div>
      )}
      {o.kind === "product" && o.status === "completed" && o.product && user.id === o.buyer_id && (
        <Button onClick={() => downloadProduct(o.product!).catch((e) => toast.error(errMsg(e)))}><Download /> Unduh file karya</Button>
      )}
      {isBuyer && <MidtransPayDialog orderId={o.id} amount={o.amount} open={payOpen} onOpenChange={setPayOpen} onPaid={refresh} />}
    </main>
  );
}

function PartyBox({ label, p }: { label: string; p: Party | null }) {
  return (
    <div><p className="text-xs text-muted-foreground">{label}</p>
      {p ? <Link to="/$username" params={{ username: p.username }} className="mt-1 flex items-center gap-2 hover:underline"><AvatarMini name={p.username} url={p.avatar_url} size={24} /><span className="truncate text-sm font-medium">{p.display_name || p.username}</span></Link> : <p className="text-sm">—</p>}
    </div>
  );
}

function AcceptBox({ defaultAmount, onAccept, onDecline }: { defaultAmount: number; onAccept: (a: number) => void; onDecline: () => void }) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  return (
    <section className="rounded-lg border border-primary/50 bg-card p-4">
      <h2 className="font-semibold">Jawab permintaan ini</h2>
      <p className="text-sm text-muted-foreground">Tentukan harga final. Client akan diminta membayar setelah kamu menerima.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div><Label htmlFor="amt">Harga final</Label><RupiahInput id="amt" value={amount} onValueChange={setAmount} className="w-48" /></div>
        <Button onClick={() => { const a = Number(amount); if (a < 1000) toast.error("Harga minimal Rp1.000"); else onAccept(a); }}><Check /> Terima</Button>
        <Button variant="outline" onClick={onDecline}><X /> Tolak</Button>
      </div>
    </section>
  );
}

/** Pembayaran lewat Midtrans (Virtual Account / QRIS) di pop-up; dana masuk escrow admin. */
function PayNowBox({ amount, onPay }: { amount: number; onPay: () => void }) {
  return (
    <section className="rounded-lg border border-primary/50 bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" /> Bayar {formatRupiah(amount)}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pilih Virtual Account atau QRIS di pop-up pembayaran. Setelah lunas, pesanan otomatis berjalan dan dana ditahan admin (escrow) sampai pekerjaan selesai.
      </p>
      <Button className="mt-3 w-full sm:w-auto" onClick={onPay}><CreditCard /> Bayar sekarang</Button>
    </section>
  );
}

function VerifyBox({ proof, note, onReview }: { proof: string | null; note: string | null; onReview: (ok: boolean, note: string) => void }) {
  const [msg, setMsg] = useState("");
  async function view() {
    if (!proof) return;
    const w = window.open("", "_blank");
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(proof, 300);
    if (data && w) w.location.href = data.signedUrl; else w?.close();
  }
  return (
    <section className="rounded-lg border border-primary/50 bg-card p-4">
      <h2 className="font-semibold">Verifikasi pembayaran manual (admin)</h2>
      <p className="mt-1 text-xs text-muted-foreground">Pesanan lama yang dibayar dengan bukti transfer. Pesanan baru dibayar lewat Midtrans.</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">Catatan pembeli: {note}</p>}
      <Button variant="outline" size="sm" className="mt-2" onClick={view} disabled={!proof}><Eye /> Lihat bukti</Button>
      <Input className="mt-3" placeholder="Catatan untuk pembeli (opsional)" value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} />
      <div className="mt-2 flex gap-2"><Button onClick={() => onReview(true, msg)}><Check /> Setujui</Button><Button variant="outline" onClick={() => onReview(false, msg)}><X /> Tolak bukti</Button></div>
    </section>
  );
}

function DeliverBox({ onDeliver }: { onDeliver: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <section className="rounded-lg border border-primary/50 bg-card p-4">
      <h2 className="font-semibold">Kirim hasil pekerjaan</h2>
      <Textarea className="mt-2" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Link hasil (repo, website, Google Drive), cara pakai, dll." />
      <Button className="mt-2" onClick={() => { if (note.trim().length < 3) toast.error("Isi catatan hasil."); else onDeliver(note.trim()); }}><Send /> Kirim hasil</Button>
    </section>
  );
}
