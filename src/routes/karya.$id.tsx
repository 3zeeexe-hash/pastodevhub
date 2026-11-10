import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, FileArchive, Package, Pencil, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { categoryLabel, errMsg, formatRupiah, safeUrl } from "@/lib/market";
import { downloadProduct } from "@/lib/downloads";
import { Button } from "@/components/ui/button";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";

export const Route = createFileRoute("/karya/$id")({
  head: () => ({
    meta: [
      { title: "Detail karya — Pastodev" },
      { name: "description", content: "Lihat detail, demo, dan unduh karya developer di Pastodev." },
      { property: "og:title", content: "Detail karya — Pastodev" },
      { property: "og:description", content: "Karya developer Nusantara di Pastodev." },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KaryaDetail,
});

function KaryaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["product", id, user?.id],
    queryFn: async () => {
      const { data: p } = await supabase.from("products").select("*, owner:profiles!products_owner_id_fkey(username,display_name,avatar_url,headline)").eq("id", id).maybeSingle();
      if (!p) return null;
      const order = user && p.price > 0
        ? (await supabase.from("orders").select("id,status").eq("product_id", id).eq("buyer_id", user.id).in("status", ["awaiting_payment", "payment_review", "completed"]).order("created_at", { ascending: false }).limit(1).maybeSingle()).data
        : null;
      return { p: p as typeof p & { owner: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null } | null }, order };
    },
  });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!data) return <main className="mx-auto max-w-6xl px-4 py-12">Karya tidak ditemukan.</main>;
  const { p, order } = data;
  const isOwner = user?.id === p.owner_id;
  const owned = isOwner || p.price === 0 || order?.status === "completed";
  const demo = safeUrl(p.demo_url);

  async function download() {
    setBusy(true);
    try { await downloadProduct(p); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function buy() {
    if (!user) { navigate({ to: "/auth" }); return; }
    setBusy(true);
    const { data: oid, error } = await supabase.rpc("buy_product", { _product_id: p.id });
    setBusy(false);
    if (error || !oid) toast.error(error?.message ?? "Gagal membuat pesanan");
    else navigate({ to: "/pesanan/$id", params: { id: oid } });
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-hero">
          {p.cover_url ? <img src={p.cover_url} alt={p.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Package className="size-16 text-primary/70" /></div>}
        </div>
        <h1 className="mt-6 text-3xl font-bold">{p.title}</h1>
        {p.summary && <p className="mt-2 text-lg text-muted-foreground">{p.summary}</p>}
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          {p.description ? <Markdown>{p.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-5 shadow-glow">
          <p className="text-3xl font-bold text-primary">{formatRupiah(p.price)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{categoryLabel(p.category)} · {p.download_count} unduhan · diperbarui {timeAgo(p.updated_at)}</p>
          {p.file_name && <p className="mt-3 flex items-center gap-2 text-sm"><FileArchive className="size-4 text-muted-foreground" /><span className="truncate font-mono">{p.file_name}</span>{p.file_size ? <span className="text-xs text-muted-foreground">({(p.file_size / 1048576).toFixed(1)} MB)</span> : null}</p>}
          <div className="mt-4 space-y-2">
            {owned ? (
              <Button className="w-full" onClick={download} disabled={busy || !p.file_path}><Download /> {p.file_path ? "Unduh" : "File belum tersedia"}</Button>
            ) : order ? (
              <Button asChild className="w-full"><Link to="/pesanan/$id" params={{ id: order.id }}><ShoppingCart /> Lanjutkan pembayaran</Link></Button>
            ) : (
              <Button className="w-full" onClick={buy} disabled={busy}><ShoppingCart /> Beli sekarang</Button>
            )}
            {demo && <Button asChild variant="outline" className="w-full"><a href={demo} target="_blank" rel="noreferrer noopener"><ExternalLink /> Lihat demo</a></Button>}
            {isOwner && <Button asChild variant="secondary" className="w-full"><Link to="/studio/karya/$id" params={{ id: p.id }}><Pencil /> Edit karya</Link></Button>}
          </div>
          {!owned && <p className="mt-3 text-xs text-muted-foreground">Bayar via transfer bank/QRIS. File terbuka setelah admin memverifikasi pembayaran.</p>}
        </div>
        {p.owner && (
          <Link to="/$username" params={{ username: p.owner.username }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/60">
            <AvatarMini name={p.owner.username} url={p.owner.avatar_url} size={44} />
            <span className="min-w-0"><b className="block truncate">{p.owner.display_name || p.owner.username}</b><span className="block truncate text-xs text-muted-foreground">{p.owner.headline || `@${p.owner.username}`}</span></span>
          </Link>
        )}
        {p.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{p.tags.map((t) => <span key={t} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">{t}</span>)}</div>}
      </aside>
    </main>
  );
}
