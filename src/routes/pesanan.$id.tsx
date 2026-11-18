import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, CreditCard, Download, Eye, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah, orderActions, type OrderStatus } from "@/lib/market";
import { downloadProduct } from "@/lib/downloads";
import { pageActions, showWorkflowPanel } from "@/lib/services-order-page";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { OrderProgress } from "@/components/order-progress";
import { EscrowBox } from "@/components/escrow-box";
import { MidtransPayDialog } from "@/components/midtrans-pay-dialog";
import { ServiceOrderSummary } from "@/components/service-order-summary";
import { ServiceWorkflowPanel } from "@/components/service-workflow-panel";
import { ServiceReviewBox } from "@/components/service-review-box";

export const Route = createFileRoute("/pesanan/$id")({
  head: () => ({
    meta: [
      { title: "Detail pesanan — GoBi" },
      { name: "description", content: "Status pesanan, pembayaran, dan chat dengan developer." },
      { property: "og:title", content: "Detail pesanan — GoBi" },
      { property: "og:description", content: "Status pesanan dan chat di GoBi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

type Party = { username: string; display_name: string | null; avatar_url: string | null };

/** Kartu bagian di halaman pesanan: satu gaya untuk semua panel supaya halaman terasa rapi. */
const PANEL = "rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";
const PANEL_ACTION = "rounded-2xl border border-primary/50 bg-card p-4 shadow-sm sm:p-5";

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
  // Pesanan paket (punya baris service_orders) diproses lewat panel alur kerja. Fungsi lama deliver_order / complete_order /
  // request_revision ditolak database untuk pesanan itu (SQL 007), jadi tombol lamanya disembunyikan.
  const pkg = useQuery({
    queryKey: ["service-package", id],
    enabled: !!user,
    retry: 1,
    queryFn: async () => {
      const { data: rows, error } = await looseDb.from("service_orders").select("order_id").eq("order_id", id).limit(1);
      if (error) throw error;
      return ((rows ?? []) as unknown[]).length > 0;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["order-messages", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["escrow", id] });
    qc.invalidateQueries({ queryKey: ["pay-active", id] });
    qc.invalidateQueries({ queryKey: ["service-order-detail", id] });
    qc.invalidateQueries({ queryKey: ["service-workflow", id] });
    qc.invalidateQueries({ queryKey: ["service-package", id] });
    qc.invalidateQueries({ queryKey: ["service-review", id] });
    qc.invalidateQueries({ queryKey: ["service-seller-orders"] });
  };

  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan." /></main>;
  if (isLoading) return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6" aria-busy="true">
      <Skeleton className="h-8 w-2/3 rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-64 rounded-2xl lg:order-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </main>
  );
  if (!data?.o) return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p>Pesanan tidak ditemukan.</p>
      <Button asChild variant="secondary" className="mt-4"><Link to="/pesanan">Kembali ke daftar pesanan</Link></Button>
    </main>
  );
  const { o } = data;
  const kind = o.kind as "product" | "service";
  const actions = pageActions(
    orderActions({ kind, status: o.status as OrderStatus, buyer_id: o.buyer_id, seller_id: o.seller_id }, { id: user.id, isAdmin }),
    { kind, isPackage: pkg.data, loading: pkg.isLoading },
  );
  const isBuyer = user.id === o.buyer_id;
  const isSeller = user.id === o.seller_id;
  const canPay = actions.includes("pay");

  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn as "cancel_order", args as { _order_id: string });
    if (error) toast.error(error.message); else { toast.success(ok); refresh(); }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 pb-28 sm:space-y-5 sm:py-8 md:pb-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/pesanan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Pesanan <span aria-hidden>/</span> #{o.number}</Link>
          <h1 className="mt-1.5 break-words text-xl font-bold leading-snug sm:text-2xl">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <OrderStatusBadge status={o.status as OrderStatus} />
            <span className="text-muted-foreground">{o.kind === "product" ? "Pembelian karya" : "Pesanan jasa"} · dibuat {timeAgo(o.created_at)}</span>
          </div>
        </div>
        {/* Chat pesanan ada di tombol bulat mengambang; tombol ini membukanya langsung. */}
        <Button variant="outline" className="h-10 shrink-0" onClick={() => openChatDock({ view: "order" })}><MessageCircle /> Chat</Button>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Ringkasan + pembayaran: di HP tampil paling atas, di desktop jadi kolom kanan yang ikut menggulung. */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label="Ringkasan pesanan">
            <div className="bg-header-gradient px-4 py-4 text-header-foreground sm:px-5">
              <p className="text-xs font-medium uppercase tracking-wider text-header-foreground/70">Total pesanan</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight">{o.amount ? formatRupiah(o.amount) : "Belum ditentukan"}</p>
            </div>
            <div className="batik-line" aria-hidden />
            <div className="grid grid-cols-2 gap-4 p-4 sm:px-5 lg:grid-cols-1">
              <PartyBox label="Client" p={o.buyer} />
              <PartyBox label="Developer" p={o.seller} />
            </div>
          </section>
          {canPay && <PayNowBox amount={o.amount} onPay={() => setPayOpen(true)} />}
        </aside>

        <div className="min-w-0 space-y-4 sm:space-y-5 lg:order-1">
          <OrderProgress status={o.status as OrderStatus} isBuyer={isBuyer} isSeller={isSeller} showSteps={o.kind === "service"} />

          {/* Setelah pesanan jasa paket selesai: pop-up ulasan untuk client, kartu ulasan + balasan untuk developer. */}
          {o.kind === "service" && pkg.data && (isBuyer || isSeller) && (
            <ServiceReviewBox
              orderId={o.id}
              buyerId={o.buyer_id}
              sellerId={o.seller_id}
              serviceId={(o as { service_id?: string | null }).service_id ?? null}
              serviceTitle={o.title}
              sellerName={o.seller?.display_name || o.seller?.username || "developer"}
              onChanged={refresh}
            />
          )}

          {o.brief && <section className={PANEL}><h2 className="mb-1.5 text-sm font-semibold">Kebutuhan client</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{o.brief}</p></section>}
          {showWorkflowPanel({ kind, isPackage: pkg.data }) && <ServiceWorkflowPanel orderId={o.id} buyerId={o.buyer_id} sellerId={o.seller_id} isAdmin={isAdmin} onChanged={refresh} />}
          {o.kind === "service" && <ServiceOrderSummary orderId={o.id} />}
          {o.delivery_note && <section className="rounded-2xl border border-success/50 bg-card p-4 shadow-sm sm:p-5"><h2 className="mb-1.5 text-sm font-semibold">Catatan hasil dari developer</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{o.delivery_note}</p></section>}
          {o.admin_note && <p className="rounded-xl bg-muted p-3 text-sm"><b>Catatan admin:</b> {o.admin_note}</p>}

          {actions.includes("accept") && <AcceptBox defaultAmount={o.amount} onAccept={(a) => run("respond_service_order", { _order_id: o.id, _accept: true, _amount: a }, "Pesanan diterima")} onDecline={() => run("respond_service_order", { _order_id: o.id, _accept: false, _amount: 0 }, "Pesanan ditolak")} />}
          {actions.includes("verify") && <VerifyBox proof={o.payment_proof_path} note={o.payment_note} onReview={(ok, note) => run("review_payment", { _order_id: o.id, _approve: ok, _note: note }, ok ? "Pembayaran disetujui" : "Bukti ditolak")} />}
          <EscrowBox order={{ id: o.id, kind: o.kind, status: o.status }} isAdmin={isAdmin} isSeller={isSeller} onChanged={refresh} />
          {actions.includes("deliver") && <DeliverBox onDeliver={(n) => run("deliver_order", { _order_id: o.id, _note: n }, "Hasil dikirim ke client")} />}
          {actions.includes("complete") && (
            <p className="rounded-xl bg-muted p-3.5 text-sm leading-relaxed text-muted-foreground">
              Periksa hasilnya dulu. Kalau masih ada yang kurang, tekan <b>Minta revisi</b>. <b>Tandai selesai</b> berarti kamu menerima hasil; dana langsung diteruskan ke developer tanpa ditahan admin.
            </p>
          )}
          {(actions.includes("complete") || actions.includes("cancel")) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap [&>button]:h-11 sm:[&>button]:h-10">
              {actions.includes("complete") && <Button onClick={() => run("complete_order", { _order_id: o.id }, "Pesanan selesai")}><Check /> Tandai selesai</Button>}
              {actions.includes("revise") && <Button variant="outline" onClick={() => run("request_revision", { _order_id: o.id }, "Revisi diminta")}>Minta revisi</Button>}
              {actions.includes("cancel") && <Button variant="ghost" onClick={() => { if (confirm("Batalkan pesanan ini?")) run("cancel_order", { _order_id: o.id }, "Pesanan dibatalkan"); }}><X /> Batalkan</Button>}
            </div>
          )}
          {o.kind === "product" && o.status === "completed" && o.product && user.id === o.buyer_id && (
            <Button className="h-11 w-full sm:h-10 sm:w-auto" onClick={() => downloadProduct(o.product!).catch((e) => toast.error(errMsg(e)))}><Download /> Unduh file karya</Button>
          )}
        </div>
      </div>

      {isBuyer && <MidtransPayDialog orderId={o.id} amount={o.amount} open={payOpen} onOpenChange={setPayOpen} onPaid={refresh} />}
    </main>
  );
}

function PartyBox({ label, p }: { label: string; p: Party | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {p
        ? <Link to="/$username" params={{ username: p.username }} className="mt-1.5 flex items-center gap-2.5 hover:underline"><AvatarMini name={p.username} url={p.avatar_url} size={32} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{p.display_name || p.username}</span><span className="block truncate text-xs text-muted-foreground">@{p.username}</span></span></Link>
        : <p className="mt-1 text-sm">—</p>}
    </div>
  );
}

function AcceptBox({ defaultAmount, onAccept, onDecline }: { defaultAmount: number; onAccept: (a: number) => void; onDecline: () => void }) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  return (
    <section className={PANEL_ACTION}>
      <h2 className="font-semibold">Jawab permintaan ini</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Tentukan harga final. Client akan diminta membayar setelah kamu menerima.</p>
      <div className="mt-4 space-y-3">
        <div><Label htmlFor="amt">Harga final</Label><RupiahInput id="amt" value={amount} onValueChange={setAmount} className="mt-1.5 w-full sm:w-56" /></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-11 sm:h-10" onClick={() => { const a = Number(amount); if (a < 1000) toast.error("Harga minimal Rp1.000"); else onAccept(a); }}><Check /> Terima</Button>
          <Button variant="outline" className="h-11 sm:h-10" onClick={onDecline}><X /> Tolak</Button>
        </div>
      </div>
    </section>
  );
}

/** Pembayaran lewat Midtrans (Virtual Account / QRIS) di pop-up; dana masuk escrow admin. */
function PayNowBox({ amount, onPay }: { amount: number; onPay: () => void }) {
  return (
    <section className="rounded-2xl border border-primary/50 bg-card p-4 shadow-glow sm:p-5" aria-label="Pembayaran">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary"><ShieldCheck className="size-5" /></span>
        <div>
          <h2 className="text-sm font-semibold leading-tight">Pembayaran aman</h2>
          <p className="text-xs text-muted-foreground">Menunggu pembayaran kamu</p>
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight">{formatRupiah(amount)}</p>
      <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {[
          "Bayar lewat Virtual Account atau QRIS",
          "Dana disimpan di escrow sampai kamu menerima hasil",
          "Pesanan otomatis berjalan setelah pembayaran lunas",
        ].map((t) => (
          <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" />{t}</li>
        ))}
      </ul>
      <Button className="mt-4 h-11 w-full text-base shadow-glow" onClick={onPay}><CreditCard /> Bayar sekarang</Button>
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
    <section className={PANEL_ACTION}>
      <h2 className="font-semibold">Verifikasi pembayaran manual (admin)</h2>
      <p className="mt-1 text-xs text-muted-foreground">Pesanan lama yang dibayar dengan bukti transfer. Pesanan baru dibayar lewat Midtrans.</p>
      {note && <p className="mt-1.5 text-sm text-muted-foreground">Catatan pembeli: {note}</p>}
      <Button variant="outline" size="sm" className="mt-3" onClick={view} disabled={!proof}><Eye /> Lihat bukti</Button>
      <Input className="mt-3" placeholder="Catatan untuk pembeli (opsional)" value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button className="h-11 sm:h-10" onClick={() => onReview(true, msg)}><Check /> Setujui</Button><Button variant="outline" className="h-11 sm:h-10" onClick={() => onReview(false, msg)}><X /> Tolak bukti</Button></div>
    </section>
  );
}

function DeliverBox({ onDeliver }: { onDeliver: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <section className={PANEL_ACTION}>
      <h2 className="font-semibold">Kirim hasil pekerjaan</h2>
      <Textarea className="mt-3" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Link hasil (repo, website, Google Drive), cara pakai, dll." />
      <Button className="mt-3 h-11 w-full sm:h-10 sm:w-auto" onClick={() => { if (note.trim().length < 3) toast.error("Isi catatan hasil."); else onDeliver(note.trim()); }}><Send /> Kirim hasil</Button>
    </section>
  );
}
