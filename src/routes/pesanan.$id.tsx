import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, CreditCard, Download, Eye, FileText, MessageCircle, Receipt, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { looseDb } from "@/lib/escrow-db";
import { errMsg, formatRupiah, orderActions, type OrderStatus } from "@/lib/market";
import { downloadProduct } from "@/lib/downloads";
import { pageActions, showWorkflowPanel } from "@/lib/services-order-page";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

/** Kartu isi halaman: judul kecil + isi. `tone` memberi garis warna untuk kartu yang butuh tindakan. */
function Panel({ title, icon, tone = "default", children }: { title: string; icon?: ReactNode; tone?: "default" | "primary" | "success"; children: ReactNode }) {
  return (
    <section className={cn(
      "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
      tone === "primary" ? "border-primary/50" : tone === "success" ? "border-success/50" : "border-border",
    )}>
      <h2 className="flex items-center gap-2 text-sm font-bold">{icon}{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Tombol dengan dialog konfirmasi (menggantikan confirm() bawaan browser yang kaku di HP). */
function ConfirmAction({ trigger, title, description, confirmLabel, destructive, onConfirm }: {
  trigger: ReactNode; title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="h-11 sm:h-10">Batal</AlertDialogCancel>
          <AlertDialogAction
            className={cn("h-11 sm:h-10", destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PageSkeleton() {
  return (
    <main>
      <div className="bg-header-gradient"><div className="mx-auto max-w-6xl space-y-3 px-4 py-7"><Skeleton className="h-3 w-32 bg-white/20" /><Skeleton className="h-8 w-2/3 bg-white/20" /><Skeleton className="h-5 w-48 bg-white/20" /></div></div>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6 lg:space-y-0">
        <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
        <div className="space-y-4"><Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
      </div>
    </main>
  );
}

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
  if (isLoading) return <PageSkeleton />;
  if (!data?.o) return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"><Receipt className="size-6" /></span>
        <h1 className="text-lg font-bold">Pesanan tidak ditemukan</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Pesanan ini tidak ada atau kamu tidak punya akses untuk melihatnya.</p>
        <Button asChild variant="secondary" className="mt-1"><Link to="/pesanan"><ArrowLeft /> Kembali ke daftar pesanan</Link></Button>
      </div>
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
    <main className="pb-[env(safe-area-inset-bottom)]">
      {/* Kepala halaman: biru tua GOBI, gaya jendela aplikasi */}
      <header className="relative overflow-hidden bg-header-gradient text-header-foreground">
        <div className="bg-hero absolute inset-0 opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 py-5 sm:py-7">
          <nav aria-label="Navigasi halaman" className="flex items-center gap-1.5 text-xs text-header-foreground/70">
            <Link to="/pesanan" className="inline-flex items-center gap-1 font-medium hover:text-header-foreground"><ArrowLeft className="size-3.5" /> Pesanan</Link>
            <span aria-hidden>/</span>
            <span className="font-mono">#{o.number}</span>
          </nav>
          <div className="mt-2.5 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-balance break-words text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">{o.title}</h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm">
                <OrderStatusBadge status={o.status as OrderStatus} />
                <span className="text-header-foreground/75">{o.kind === "product" ? "Pembelian karya" : "Pesanan jasa"} · dibuat {timeAgo(o.created_at)}</span>
              </div>
            </div>
            {/* Chat pesanan ada di tombol bulat mengambang; tombol ini membukanya langsung. */}
            <Button
              variant="outline"
              className="h-10 shrink-0 border-white/25 bg-white/10 text-header-foreground hover:bg-white/20 hover:text-header-foreground"
              onClick={() => openChatDock({ view: "order" })}
            >
              <MessageCircle /> Chat
            </Button>
          </div>
        </div>
        <div className="batik-line" aria-hidden />
      </header>

      {/*
        Desktop: kolom kiri (progres, tindakan, rincian) + panel kanan lengket (bayar, ringkasan, escrow).
        HP: satu kolom dengan urutan progres, tindakan, bayar dan ringkasan, rincian. Pembungkus `contents` membuat
        anak-anaknya ikut diurutkan oleh kolom induk di HP, sedangkan di lg ia menjadi satu kolom biasa.
      */}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-1 min-w-0 space-y-4">
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
          </div>

          {/* Tindakan utama */}
          <div className="order-2 min-w-0 space-y-4 empty:hidden">
            {o.admin_note && <p className="rounded-2xl border border-border bg-muted p-4 text-sm"><b>Catatan admin:</b> {o.admin_note}</p>}
            {showWorkflowPanel({ kind, isPackage: pkg.data }) && <ServiceWorkflowPanel orderId={o.id} buyerId={o.buyer_id} sellerId={o.seller_id} isAdmin={isAdmin} onChanged={refresh} />}
            {o.delivery_note && (
              <Panel title="Catatan hasil dari developer" icon={<FileText className="size-4 text-success" />} tone="success">
                <p className="whitespace-pre-wrap break-words text-sm">{o.delivery_note}</p>
              </Panel>
            )}
            {actions.includes("accept") && <AcceptBox defaultAmount={o.amount} onAccept={(a) => run("respond_service_order", { _order_id: o.id, _accept: true, _amount: a }, "Pesanan diterima")} onDecline={() => run("respond_service_order", { _order_id: o.id, _accept: false, _amount: 0 }, "Pesanan ditolak")} />}
            {actions.includes("verify") && <VerifyBox proof={o.payment_proof_path} note={o.payment_note} onReview={(ok, note) => run("review_payment", { _order_id: o.id, _approve: ok, _note: note }, ok ? "Pembayaran disetujui" : "Bukti ditolak")} />}
            {actions.includes("deliver") && <DeliverBox onDeliver={(n) => run("deliver_order", { _order_id: o.id, _note: n }, "Hasil dikirim ke client")} />}
            {(actions.includes("complete") || actions.includes("cancel")) && (
              <Panel title="Tindakan" tone={actions.includes("complete") ? "primary" : "default"}>
                {actions.includes("complete") && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    Periksa hasilnya dulu. Kalau masih ada yang kurang, tekan <b className="text-foreground">Minta revisi</b>. <b className="text-foreground">Tandai selesai</b> berarti kamu menerima hasil; dana langsung diteruskan ke developer tanpa ditahan admin.
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {actions.includes("complete") && (
                    <ConfirmAction
                      trigger={<Button className="h-11 sm:h-10"><Check /> Tandai selesai</Button>}
                      title="Terima hasil dan selesaikan pesanan?"
                      description="Dana langsung diteruskan ke developer dan tidak bisa ditarik kembali. Pastikan hasilnya sudah sesuai."
                      confirmLabel="Ya, tandai selesai"
                      onConfirm={() => run("complete_order", { _order_id: o.id }, "Pesanan selesai")}
                    />
                  )}
                  {actions.includes("revise") && <Button variant="outline" className="h-11 sm:h-10" onClick={() => run("request_revision", { _order_id: o.id }, "Revisi diminta")}>Minta revisi</Button>}
                  {actions.includes("cancel") && (
                    <ConfirmAction
                      trigger={<Button variant="ghost" className="h-11 text-destructive hover:text-destructive sm:h-10"><X /> Batalkan</Button>}
                      title="Batalkan pesanan ini?"
                      description="Pesanan akan dibatalkan dan tidak bisa dilanjutkan lagi."
                      confirmLabel="Ya, batalkan"
                      destructive
                      onConfirm={() => run("cancel_order", { _order_id: o.id }, "Pesanan dibatalkan")}
                    />
                  )}
                </div>
              </Panel>
            )}
            {o.kind === "product" && o.status === "completed" && o.product && user.id === o.buyer_id && (
              <Button size="lg" className="h-12 w-full sm:w-auto" onClick={() => downloadProduct(o.product!).catch((e) => toast.error(errMsg(e)))}><Download /> Unduh file karya</Button>
            )}
          </div>

          {/* Rincian */}
          <div className="order-4 min-w-0 space-y-4 empty:hidden">
            {o.brief && (
              <Panel title="Kebutuhan client" icon={<FileText className="size-4 text-primary" />}>
                <p className="whitespace-pre-wrap break-words text-sm">{o.brief}</p>
              </Panel>
            )}
            {o.kind === "service" && <ServiceOrderSummary orderId={o.id} />}
          </div>
        </div>

        {/* Panel kanan: bayar, ringkasan, escrow */}
        <aside aria-label="Pembayaran dan ringkasan" className="order-3 min-w-0 lg:col-start-2 lg:row-start-1">
          <div className="space-y-4 lg:sticky lg:top-20">
            {canPay && <PayNowBox amount={o.amount} onPay={() => setPayOpen(true)} />}
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-bold"><Receipt className="size-4 text-primary" /> Ringkasan pesanan</h2>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <PartyBox label="Client" p={o.buyer} />
                  <PartyBox label="Developer" p={o.seller} />
                </div>
                <div className="rounded-xl bg-muted/60 p-3.5">
                  <p className="text-xs text-muted-foreground">Total pesanan</p>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-primary tabular-nums">{o.amount ? formatRupiah(o.amount) : "Belum ditentukan"}</p>
                </div>
              </div>
            </section>
            <EscrowBox order={{ id: o.id, kind: o.kind, status: o.status }} isAdmin={isAdmin} isSeller={isSeller} onChanged={refresh} />
          </div>
        </aside>
      </div>

      {isBuyer && <MidtransPayDialog orderId={o.id} amount={o.amount} open={payOpen} onOpenChange={setPayOpen} onPaid={refresh} />}
    </main>
  );
}

function PartyBox({ label, p }: { label: string; p: Party | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {p ? (
        <Link to="/$username" params={{ username: p.username }} className="-mx-1.5 mt-1 flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-accent/60">
          <AvatarMini name={p.username} url={p.avatar_url} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{p.display_name || p.username}</span>
            <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
          </span>
        </Link>
      ) : <p className="mt-1 text-sm">—</p>}
    </div>
  );
}

function AcceptBox({ defaultAmount, onAccept, onDecline }: { defaultAmount: number; onAccept: (a: number) => void; onDecline: () => void }) {
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  return (
    <Panel title="Jawab permintaan ini" tone="primary">
      <p className="text-sm text-muted-foreground">Tentukan harga final. Client akan diminta membayar setelah kamu menerima.</p>
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="amt">Harga final</Label>
        <RupiahInput id="amt" value={amount} onValueChange={setAmount} className="w-full sm:w-64" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <Button className="h-11 sm:h-10" onClick={() => { const a = Number(amount); if (a < 1000) toast.error("Harga minimal Rp1.000"); else onAccept(a); }}><Check /> Terima</Button>
        <Button variant="outline" className="h-11 sm:h-10" onClick={onDecline}><X /> Tolak</Button>
      </div>
    </Panel>
  );
}

/** Kartu ajakan bayar: biru tua dengan nominal besar. Pembayaran sendiri dibuka di pop-up (HP: bottom sheet). */
function PayNowBox({ amount, onPay }: { amount: number; onPay: () => void }) {
  return (
    <section aria-label="Pembayaran" className="relative overflow-hidden rounded-2xl bg-header-gradient p-4 text-header-foreground shadow-lg sm:p-5">
      <div className="bg-hero absolute inset-0 opacity-60" aria-hidden />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-xs font-medium text-header-foreground/75"><ShieldCheck className="size-4 text-primary-glow" /> Pembayaran aman lewat escrow</p>
        <p className="mt-1.5 text-3xl font-bold tracking-tight tabular-nums">{formatRupiah(amount)}</p>
        <p className="mt-1.5 text-sm text-header-foreground/75">
          Bayar lewat Virtual Account atau QRIS. Dana ditahan di escrow dan baru diteruskan ke developer setelah kamu menerima hasil.
        </p>
        <Button size="lg" className="mt-4 h-12 w-full text-base shadow-glow" onClick={onPay}><CreditCard /> Bayar sekarang</Button>
        <p className="mt-2.5 text-center text-xs text-header-foreground/60">Status pesanan berubah otomatis setelah pembayaran terdeteksi.</p>
      </div>
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
    <Panel title="Verifikasi pembayaran manual (admin)" tone="primary">
      <p className="text-xs text-muted-foreground">Pesanan lama yang dibayar dengan bukti transfer. Pesanan baru dibayar lewat Midtrans.</p>
      {note && <p className="mt-2 text-sm text-muted-foreground">Catatan pembeli: {note}</p>}
      <Button variant="outline" size="sm" className="mt-3" onClick={view} disabled={!proof}><Eye /> Lihat bukti</Button>
      <Input className="mt-3" placeholder="Catatan untuk pembeli (opsional)" value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <Button className="h-11 sm:h-10" onClick={() => onReview(true, msg)}><Check /> Setujui</Button>
        <Button variant="outline" className="h-11 sm:h-10" onClick={() => onReview(false, msg)}><X /> Tolak bukti</Button>
      </div>
    </Panel>
  );
}

function DeliverBox({ onDeliver }: { onDeliver: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Panel title="Kirim hasil pekerjaan" tone="primary">
      <Textarea rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Link hasil (repo, website, Google Drive), cara pakai, dll." />
      <Button className="mt-3 h-11 w-full sm:h-10 sm:w-auto" onClick={() => { if (note.trim().length < 3) toast.error("Isi catatan hasil."); else onDeliver(note.trim()); }}><Send /> Kirim hasil</Button>
    </Panel>
  );
}
