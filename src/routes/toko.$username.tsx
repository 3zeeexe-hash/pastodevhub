import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Store, Wrench } from "lucide-react";
import { fetchStore } from "@/lib/store-data";
import { buildStoreDoc, STORE_IFRAME_SANDBOX } from "@/lib/store";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/toko/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `Toko ${params.username} — Pastodev` },
      { name: "description", content: `Karya digital dan jasa dari ${params.username} di Pastodev.` },
      { property: "og:title", content: `Toko ${params.username} — Pastodev` },
      { property: "og:description", content: `Beli karya atau pesan jasa langsung dari ${params.username}.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { username } = Route.useParams();
  const { data, isLoading } = useQuery({ queryKey: ["store", username], queryFn: () => fetchStore(username) });
  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat toko…</main>;
  if (!data || data.profile.account_type !== "developer") return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <Store className="mx-auto size-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Toko tidak ditemukan</h1>
    </main>
  );
  const { store, data: d } = data;
  if (store?.use_custom && store.html.trim()) {
    return <iframe title={store.title || `Toko ${d.developer.name}`} sandbox={STORE_IFRAME_SANDBOX} srcDoc={buildStoreDoc(store.html, d)} className="block h-[calc(100vh-3.5rem)] w-full border-0 bg-background" />;
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <AvatarMini name={d.developer.username} url={d.developer.avatar} size={96} />
        <h1 className="mt-3 text-3xl font-bold">{store?.title || `Toko ${d.developer.name}`}</h1>
        {d.developer.headline && <p className="mt-1 text-muted-foreground">{d.developer.headline}</p>}
        <Button asChild variant="link"><Link to="/$username" params={{ username }}>Lihat profil @{username}</Link></Button>
      </div>
      <StoreSection title="Karya" Icon={Package} items={d.products.map((p) => ({ ...p, label: p.priceLabel, to: "/karya/$id" as const }))} empty="Belum ada karya." />
      <StoreSection title="Jasa" Icon={Wrench} items={d.services.map((s) => ({ ...s, label: `Mulai ${s.priceLabel}`, to: "/jasa/$id" as const }))} empty="Belum ada jasa." />
    </main>
  );
}

function StoreSection({ title, Icon, items, empty }: {
  title: string; Icon: typeof Package; empty: string;
  items: { id: string; title: string; summary: string; cover: string | null; label: string; to: "/karya/$id" | "/jasa/$id" }[];
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-lg font-semibold"><Icon className="size-5 text-primary" />{title}</h2>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((x) => (
            <Link key={x.id} to={x.to} params={{ id: x.id }} className="overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary/60">
              {x.cover ? <img src={x.cover} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video w-full bg-muted" />}
              <div className="p-3">
                <p className="font-semibold">{x.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{x.summary}</p>
                <p className="mt-2 font-semibold text-primary">{x.label}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
