import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Eye, Send, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah, orderActions, safeFileName, STATUS_LABEL, type OrderStatus } from "@/lib/market";
import { downloadProduct } from "@/lib/downloads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { OrderStatusBadge } from "@/components/order-status";
import { cn } from "@/lib/utils";

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
  const { data, isLoading } = useQuery({
    queryKey: ["order", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [o, settings] = await Promise.all([
        supabase.from("orders").select("*, buyer:profiles!orders_buyer_id_fkey(username,display_name,avatar_url), seller:profiles!orders_seller_id_fkey(username,display_name,avatar_url), product:products(id,file_path,file_name)").eq("id", id).maybeSingle(),
        supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      return { o: o.data as (NonNullable<typeof o.data> & { buyer: Party | null; seller: Party | null; product: { id: string; file_path: string | null; file_name: string | null } | null }) | null, settings: settings.data };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["order", id] }); qc.invalidateQueries({ queryKey: ["order-messages", id] }); qc.invalidateQueries({ queryKey: ["orders"] }); };

  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk melihat pesanan." /></main>;
  if (isLoading) return <main className="mx-auto max-w-5xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!data?.o) return <main className="mx-auto max-w-5xl px-4 py-12">Pesanan tidak ditemukan.</main>;
  const { o, settings } = data;
  const actions = orderActions({ kind: o.kind as "product" | "service", status: o.status as OrderStatus, buyer_id: o.buyer_id, seller_id: o.seller_id }, { id: user.id, isAdmin });

  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn as "cancel_order", args as { _order_id: string });
    if (error) toast.error(error.message); else { toast.success(ok); refresh(); }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-5">
        <div>
          <p className="text-sm text-muted-foreground"><Link to="/pesanan" className="hover:underline">Pesanan</Link> / #{o.number}</p>
          <h1 className="mt-1 text-2xl font-bold">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <OrderStatusBadge status={o.status as OrderStatus} />
            <span className="text-muted-foreground">{o.kind === "product" ? "Pembelian karya" : "Pesanan jasa"} · dibuat {timeAgo(o.created_at)}</span>
          </div>
        </div>
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
          <PartyBox label="Client" p={o.buyer} />
          <PartyBox label="Developer" p={o.seller} />
          <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold text-primary">{o.amount ? formatRupiah(o.amount) : "Belum ditentukan"}</p></div>
        </div>
        {o.brief && <section className="rounded-lg border border-border bg-card p-4"><h2 className="mb-1 text-sm font-semibold">Kebutuhan client</h2><p className="whitespace-pre-wrap text-sm">{o.brief}</p></section>}
        {o.delivery_note && <section className="rounded-lg border border-success/50 bg-card p-4"><h2 className="mb-1 text-sm font-semibold">Catatan hasil dari developer</h2><p className="whitespace-pre-wrap text-sm">{o.delivery_note}</p></section>}
        {o.admin_note && <p className="rounded-md bg-muted p-3 text-sm"><b>Catatan admin:</b> {o.admin_note}</p>}

        {actions.includes("accept") && <AcceptBox defaultAmount={o.amount} onAccept={(a) => run("respond_service_order", { _order_id: o.id, _accept: true, _amount: a }, "Pesanan diterima")} onDecline={() => run("respond_service_order", { _order_id: o.id, _accept: false, _amount: 0 }, "Pesanan ditolak")} />}
        {actions.includes("pay") && <PayBox orderId={o.id} userId={user.id} amount={o.amount} settings={settings} onDone={refresh} />}
        {actions.includes("verify") && <VerifyBox proof={o.payment_proof_path} note={o.payment_note} onReview={(ok, note) => run("review_payment", { _order_id: o.id, _approve: ok, _note: note }, ok ? "Pembayaran disetujui" : "Bukti ditolak")} />}
        {o.status === "payment_review" && !isAdmin && <p className="rounded-md bg-muted p-3 text-sm">Bukti pembayaran sedang dicek admin.</p>}
        {actions.includes("deliver") && <DeliverBox onDeliver={(n) => run("deliver_order", { _order_id: o.id, _note: n }, "Hasil dikirim ke client")} />}
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
      </div>
      <Chat orderId={o.id} userId={user.id} closed={o.status === "cancelled" || o.status === "declined"} />
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
        <div><Label htmlFor="amt">Harga final (Rp)</Label><Input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className="w-44" /></div>
        <Button onClick={() => { const a = Number(amount); if (a < 1000) toast.error("Harga minimal Rp1.000"); else onAccept(a); }}><Check /> Terima</Button>
        <Button variant="outline" onClick={onDecline}><X /> Tolak</Button>
      </div>
    </section>
  );
}

type Settings = { bank_name: string | null; account_number: string | null; account_name: string | null; qris_url: string | null; payment_instructions: string } | null;

function PayBox({ orderId, userId, amount, settings, onDone }: { orderId: string; userId: string; amount: number; settings: Settings; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!(settings?.account_number || settings?.qris_url);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error("Pilih foto bukti transfer."); return; }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") { toast.error("Bukti harus gambar atau PDF."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Maksimal 5 MB."); return; }
    setBusy(true);
    try {
      const path = `${userId}/${orderId}-${Date.now()}-${safeFileName(file.name)}`;
      const up = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc("submit_payment", { _order_id: orderId, _proof_path: path, _note: note });
      if (error) throw error;
      toast.success("Bukti terkirim, menunggu verifikasi admin");
      onDone();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-lg border border-primary/50 bg-card p-4">
      <h2 className="font-semibold">Bayar {formatRupiah(amount)}</h2>
      {ready ? (
        <div className="mt-2 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1 text-sm">
            {settings?.account_number && <><p>Transfer ke <b>{settings.bank_name}</b></p><p className="font-mono text-lg font-bold">{settings.account_number}</p><p>a.n. {settings.account_name}</p></>}
            {settings?.payment_instructions && <p className="whitespace-pre-wrap pt-2 text-muted-foreground">{settings.payment_instructions}</p>}
          </div>
          {settings?.qris_url && <img src={settings.qris_url} alt="QRIS Pastodev" className="w-40 rounded-md border border-border bg-background" />}
        </div>
      ) : <p className="mt-2 rounded-md bg-muted p-3 text-sm">Admin belum mengisi rekening pembayaran. Coba lagi nanti atau tanyakan lewat chat.</p>}
      <form onSubmit={submit} className="mt-4 space-y-2">
        <Label htmlFor="proof">Bukti transfer</Label>
        <Input id="proof" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Input aria-label="Catatan" placeholder="Catatan (opsional), mis. nama pengirim" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <Button disabled={busy || !ready}><Upload /> Kirim bukti pembayaran</Button>
      </form>
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
      <h2 className="font-semibold">Verifikasi pembayaran (admin)</h2>
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

function Chat({ orderId, userId, closed }: { orderId: string; userId: string; closed: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const { data: msgs = [] } = useQuery({
    queryKey: ["order-messages", orderId],
    queryFn: async () => (await supabase.from("order_messages").select("id,body,is_system,created_at,sender_id, sender:profiles(username,avatar_url)").eq("order_id", orderId).order("created_at").limit(500)).data ?? [],
  });
  useEffect(() => {
    const ch = supabase
      .channel(`order-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` }, () => {
        qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
        qc.invalidateQueries({ queryKey: ["order", orderId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, qc]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { error } = await supabase.from("order_messages").insert({ order_id: orderId, sender_id: userId, body: body.slice(0, 4000) });
    if (error) { toast.error(error.message); setText(body); } else qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
  }
  return (
    <aside className="flex h-[70vh] flex-col rounded-xl border border-border bg-card lg:sticky lg:top-20">
      <h2 className="border-b border-border px-4 py-3 font-semibold">Chat pesanan</h2>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m: any) => m.is_system ? (
          <p key={m.id} className="text-center text-xs text-muted-foreground">{m.body} · {timeAgo(m.created_at)}</p>
        ) : (
          <div key={m.id} className={cn("flex gap-2", m.sender_id === userId && "flex-row-reverse")}>
            <AvatarMini name={m.sender?.username ?? "?"} url={m.sender?.avatar_url} size={26} />
            <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.sender_id === userId ? "bg-primary text-primary-foreground" : "bg-secondary")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{timeAgo(m.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <Input aria-label="Tulis pesan" value={text} onChange={(e) => setText(e.target.value)} placeholder={closed ? "Pesanan ditutup" : "Tulis pesan…"} disabled={closed} maxLength={4000} />
        <Button size="icon" aria-label="Kirim" disabled={closed || !text.trim()}><Send /></Button>
      </form>
    </aside>
  );
}
