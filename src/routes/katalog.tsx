import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { LayoutGrid, Package, Search, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/market";
import { Input } from "@/components/ui/input";
import { ProductCard, PRODUCT_SELECT, ServiceCard, SERVICE_SELECT, type ProductCardData, type ServiceCardData } from "@/components/market-cards";
import { cn } from "@/lib/utils";

const schema = z.object({ tab: z.enum(["semua", "karya", "jasa"]).catch("semua"), kategori: z.string().catch("") });

export const Route = createFileRoute("/katalog")({
  validateSearch: (s): { tab?: "semua" | "karya" | "jasa"; kategori?: string } => {
    const v = schema.parse(s);
    return { ...(v.tab !== "semua" ? { tab: v.tab } : {}), ...(v.kategori ? { kategori: v.kategori } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Katalog karya & jasa — Pastodev" },
      { name: "description", content: "Katalog source code, template, dan jasa developer Indonesia dalam satu tempat." },
      { property: "og:title", content: "Katalog karya & jasa — Pastodev" },
      { property: "og:description", content: "Temukan karya siap pakai dan jasa developer Nusantara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Catalog,
});

function Catalog() {
  const sp = Route.useSearch();
  const tab = sp.tab ?? "semua";
  const kategori = sp.kategori ?? "";
  const [q, setQ] = useState("");
  const term = q.trim().replace(/[%,()_]/g, " ").trim();
  const products = useQuery({
    queryKey: ["katalog", "karya", term, kategori],
    enabled: tab !== "jasa",
    queryFn: async () => {
      let qb = supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(tab === "semua" ? 8 : 60);
      if (term) qb = qb.ilike("title", `%${term}%`);
      if (kategori) qb = qb.eq("category", kategori);
      return ((await qb).data ?? []) as unknown as ProductCardData[];
    },
  });
  const services = useQuery({
    queryKey: ["katalog", "jasa", term, kategori],
    enabled: tab !== "karya",
    queryFn: async () => {
      let qb = supabase.from("services").select(SERVICE_SELECT).eq("is_active", true).order("created_at", { ascending: false }).limit(tab === "semua" ? 8 : 60);
      if (term) qb = qb.ilike("title", `%${term}%`);
      if (kategori) qb = qb.eq("category", kategori);
      return ((await qb).data ?? []) as unknown as ServiceCardData[];
    },
  });
  const tabs = [["semua", "Semua", LayoutGrid], ["karya", "Karya", Package], ["jasa", "Jasa", Wrench]] as const;
  return (
    <main>
      <section className="bg-hero border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <h1 className="text-3xl font-bold md:text-4xl">Katalog</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">Karya siap pakai dan jasa developer — gratis, berbayar, atau sesuai kebutuhanmu.</p>
          <div className="relative mt-5 max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari template, aplikasi, jasa website…" className="h-11 bg-background pl-9" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(([k, l, Icon]) => (
            <Link key={k} to="/katalog" search={{ tab: k, kategori }} className={cn("flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm", tab === k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}><Icon className="size-4" />{l}</Link>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <Link to="/katalog" search={{ tab, kategori: "" }} className={cn("shrink-0 rounded-full px-3 py-1 text-xs", !kategori ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-accent")}>Semua kategori</Link>
            {CATEGORIES.map(([k, l]) => (
              <Link key={k} to="/katalog" search={{ tab, kategori: k }} className={cn("shrink-0 rounded-full px-3 py-1 text-xs", kategori === k ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-accent")}>{l}</Link>
            ))}
          </div>
        </div>
        {tab !== "jasa" && (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" /> Karya</h2>{tab === "semua" && <Link to="/katalog" search={{ tab: "karya", kategori }} className="text-sm text-link hover:underline">Lihat semua</Link>}</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.data?.map((p) => <ProductCard key={p.id} p={p} />)}</div>
            {products.data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada karya yang cocok.</p>}
          </section>
        )}
        {tab !== "karya" && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Wrench className="size-4 text-primary" /> Jasa</h2>{tab === "semua" && <Link to="/katalog" search={{ tab: "jasa", kategori }} className="text-sm text-link hover:underline">Lihat semua</Link>}</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{services.data?.map((s) => <ServiceCard key={s.id} s={s} />)}</div>
            {services.data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Belum ada jasa yang cocok.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
