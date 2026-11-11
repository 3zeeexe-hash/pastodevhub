import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, Pencil, Send, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { categoryLabel, formatRupiah } from "@/lib/market";
import { Button } from "@/components/ui/button";
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

function JasaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: s, isLoading } = useQuery({
    queryKey: ["service", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*, owner:profiles!services_owner_id_fkey(username,display_name,avatar_url,headline,skills)").eq("id", id).maybeSingle();
      return data as (typeof data & { owner: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] } | null }) | null;
    },
  });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!s) return <main className="mx-auto max-w-6xl px-4 py-12">Jasa tidak ditemukan.</main>;
  const isOwner = user?.id === s.owner_id;

  async function order(e: React.FormEvent) {
    e.preventDefault();
    const b = budget.trim() ? Number(budget.replace(/\D/g, "")) : null;
    if (brief.trim().length < 10) { toast.error("Jelaskan kebutuhanmu minimal 10 karakter."); return; }
    setBusy(true);
    const { data: oid, error } = await supabase.rpc("request_service", { _service_id: s!.id, _brief: brief.trim(), _budget: b as number });
    setBusy(false);
    if (error || !oid) toast.error(error?.message ?? "Gagal mengirim pesanan");
    else { toast.success("Permintaan terkirim ke developer"); navigate({ to: "/pesanan/$id", params: { id: oid } }); }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-hero">
          {s.cover_url ? <img src={s.cover_url} alt={s.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Wrench className="size-16 text-primary/70" /></div>}
        </div>
        <h1 className="mt-6 text-3xl font-bold">{s.title}</h1>
        {s.summary && <p className="mt-2 text-lg text-muted-foreground">{s.summary}</p>}
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          {s.description ? <Markdown>{s.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5 shadow-glow">
          <p className="text-sm text-muted-foreground">Mulai dari</p>
          <p className="text-3xl font-bold text-primary">{formatRupiah(s.price_from, "Nego")}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" /> Estimasi {s.delivery_days} hari · {categoryLabel(s.category)}</p>
          {isOwner ? (
            <Button asChild variant="secondary" className="mt-4 w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
          ) : !user ? (
            <div className="mt-4"><SignInCta text="Masuk untuk memesan jasa ini." /></div>
          ) : (
            <form onSubmit={order} className="mt-4 space-y-3">
              <div><Label htmlFor="brief">Kebutuhan kamu</Label><Textarea id="brief" rows={5} maxLength={5000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Contoh: website company profile 5 halaman, ada form kontak, deadline 2 minggu." /></div>
              <div><Label htmlFor="budget">Budget (opsional, Rp)</Label><Input id="budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder={String(s.price_from || "")} /></div>
              <Button className="w-full" disabled={busy}><Send /> Kirim permintaan</Button>
              <p className="text-xs text-muted-foreground">Developer akan menerima atau menolak dan menentukan harga final. Kamu bayar setelah harga disetujui.</p>
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
    </main>
  );
}
