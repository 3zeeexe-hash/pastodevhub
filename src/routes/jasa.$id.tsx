import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, MessageCircle, Pencil, Send, ShieldCheck, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { startConversation } from "@/lib/dm";
import { isFeatureOn } from "@/lib/features";
import { categoryLabel, formatRupiah } from "@/lib/market";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/jasa/$id")({
  // Real title, description and structured data come from the database; the text below is the fallback.
  loader: ({ params }) => getSeoInfo({ data: { kind: "service", id: params.id } }),
  staleTime: 300_000,
  head: ({ loaderData }) => seoHead(loaderData, { title: "Detail jasa — Pastodev", description: "Lihat detail jasa developer dan kirim permintaan pesanan di Pastodev." }),
  component: JasaDetail,
});

// Urutan ini sama dengan alur status pesanan: requested -> awaiting_payment -> in_progress -> delivered -> completed.
const STEPS = [
  { title: "Kirim permintaan", text: "Ceritakan kebutuhan dan budget. Belum ada pembayaran." },
  { title: "Developer menjawab", text: "Developer menerima dan menentukan harga final, atau menolak." },
  { title: "Bayar dengan aman", text: "Bayar lewat Virtual Account atau QRIS. Dana disimpan di escrow dan langsung diteruskan ke developer begitu kamu menerima hasil." },
  { title: "Terima hasil", text: "Periksa hasilnya, minta revisi kalau perlu, lalu tandai selesai." },
] as const;

function JasaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { flags } = useSiteConfig();
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const { data: s, isLoading } = useQuery({
    queryKey: ["service", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*, owner:profiles!services_owner_id_fkey(username,display_name,avatar_url,headline,skills)").eq("id", id).maybeSingle();
      return data as (typeof data & { owner: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] } | null }) | null;
    },
  });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!s) return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p>Jasa tidak ditemukan.</p>
      <Button asChild variant="secondary" className="mt-4"><Link to="/jasa">Lihat semua jasa</Link></Button>
    </main>
  );
  const isOwner = user?.id === s.owner_id;
  const briefLen = brief.trim().length;
  const briefOk = briefLen >= 10;
  const chatOn = isFeatureOn(flags, "discuss");

  async function order(e: React.FormEvent) {
    e.preventDefault();
    const b = budget.trim() ? Number(budget.replace(/\D/g, "")) : null;
    if (!briefOk) { toast.error("Jelaskan kebutuhanmu minimal 10 karakter."); return; }
    setBusy(true);
    const { data: oid, error } = await supabase.rpc("request_service", { _service_id: s!.id, _brief: brief.trim(), _budget: b as number });
    setBusy(false);
    if (error || !oid) toast.error(error?.message ?? "Gagal mengirim pesanan");
    else { toast.success("Permintaan terkirim ke developer"); navigate({ to: "/pesanan/$id", params: { id: oid } }); }
  }

  async function askDeveloper() {
    if (!s?.owner) return;
    setAsking(true);
    try {
      openChatDock({ conversationId: await startConversation(s.owner.username) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuka chat");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-8">
      <section className="min-w-0 lg:col-start-1 lg:row-start-1">
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-hero">
          {s.cover_url ? <img src={s.cover_url} alt={s.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Wrench className="size-16 text-primary/70" /></div>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary">{categoryLabel(s.category)}</span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"><Clock className="size-3.5" /> Estimasi {s.delivery_days} hari</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{s.title}</h1>
        {s.summary && <p className="mt-2 text-base text-muted-foreground sm:text-lg">{s.summary}</p>}
      </section>

      {/* Di layar kecil kartu pesan tampil tepat di bawah judul, bukan di dasar halaman. */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5 shadow-glow">
          <p className="text-sm text-muted-foreground">Mulai dari</p>
          <p className="text-3xl font-bold text-primary">{formatRupiah(s.price_from, "Nego")}</p>
          {isOwner ? (
            <Button asChild variant="secondary" className="mt-4 w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
          ) : !user ? (
            <div className="mt-4"><SignInCta text="Masuk untuk memesan jasa ini." /></div>
          ) : (
            <form onSubmit={order} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="brief">Kebutuhan kamu</Label>
                <Textarea id="brief" rows={5} maxLength={5000} value={brief} onChange={(e) => setBrief(e.target.value)} aria-describedby="brief-hint" placeholder="Contoh: website company profile 5 halaman, ada form kontak, deadline 2 minggu." />
                <p id="brief-hint" className={`mt-1 text-xs ${briefLen > 0 && !briefOk ? "text-destructive" : "text-muted-foreground"}`}>
                  {briefOk ? "Makin jelas kebutuhanmu, makin cepat developer menjawab." : `Minimal 10 karakter (${briefLen}/10).`}
                </p>
              </div>
              <div>
                <Label htmlFor="budget">Budget (opsional)</Label>
                <RupiahInput id="budget" value={budget} onValueChange={setBudget} placeholder={s.price_from ? formatRupiah(s.price_from) : "Rp 0"} />
                <p className="mt-1 text-xs text-muted-foreground">{budget ? formatRupiah(Number(budget)) : "Kosongkan kalau mau nego dengan developer."}</p>
              </div>
              <Button className="w-full" disabled={busy || !briefOk}><Send /> {busy ? "Mengirim…" : "Kirim permintaan"}</Button>
              {chatOn && s.owner && (
                <Button type="button" variant="outline" className="w-full" disabled={asking} onClick={askDeveloper}><MessageCircle /> {asking ? "Membuka chat…" : "Tanya developer dulu"}</Button>
              )}
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Kamu baru membayar setelah developer menyetujui dan menentukan harga final. Dana disimpan di escrow sampai kamu menerima hasil.</span>
              </p>
            </form>
          )}
        </div>
        {s.owner && (
          <Link to="/$username" params={{ username: s.owner.username }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/60">
            <AvatarMini name={s.owner.username} url={s.owner.avatar_url} size={44} />
            <span className="min-w-0"><b className="block truncate">{s.owner.display_name || s.owner.username}</b><span className="block truncate text-xs text-muted-foreground">{s.owner.headline || `@${s.owner.username}`}</span></span>
          </Link>
        )}
      </aside>

      <section className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
        <div className="rounded-lg border border-border bg-card p-6">
          {s.description ? <Markdown>{s.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Cara pesan di Pastodev</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((st, i) => (
              <li key={st.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{st.title}</p>
                  <p className="text-sm text-muted-foreground">{st.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
