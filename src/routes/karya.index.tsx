import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { cn } from "@/lib/utils";

type Price = "all" | "free" | "paid";

export const Route = createFileRoute("/karya/")({
  head: () => ({
    meta: [
      { title: "Karya developer — Pastodev" },
      { name: "description", content: "Unduh template, source code, dan proyek karya developer Indonesia. Gratis atau berbayar." },
      { property: "og:title", content: "Karya developer — Pastodev" },
      { property: "og:description", content: "Template, source code, dan proyek dari developer Nusantara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KaryaList,
});

function KaryaList() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [price, setPrice] = useState<Price>("all");
  const [cat, setCat] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["products", "list", q, price, cat],
    queryFn: async () => {
      let query = supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(60);
      if (q.trim()) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
      if (price === "free") query = query.eq("price", 0);
      if (price === "paid") query = query.gt("price", 0);
      if (cat) query = query.eq("category", cat);
      return ((await query).data ?? []) as unknown as ProductCardData[];
    },
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Karya</h1>
          <p className="text-muted-foreground">Template, source code, dan proyek siap pakai dari developer Pastodev.</p>
        </div>
        {profile?.account_type === "developer" && <Button asChild><Link to="/studio/karya/$id" params={{ id: "baru" }}><Plus /> Unggah karya</Link></Button>}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari karya…" className="pl-8" />
        </div>
        {(["all", "free", "paid"] as const).map((p) => (
          <Button key={p} size="sm" variant={price === p ? "default" : "outline"} onClick={() => setPrice(p)}>{p === "all" ? "Semua" : p === "free" ? "Gratis" : "Berbayar"}</Button>
        ))}
        <select aria-label="Kategori" value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Semua kategori</option>
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className={cn("mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4", isLoading && "opacity-60")}>
        {(data ?? []).map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
      {!isLoading && data?.length === 0 && <p className="mt-10 text-center text-muted-foreground">Belum ada karya yang cocok.</p>}
    </main>
  );
}
