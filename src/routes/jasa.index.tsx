import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceCard, SERVICE_SELECT, type ServiceCardData } from "@/components/market-cards";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jasa/")({
  head: () => ({
    meta: [
      { title: "Jasa developer & freelancer — Pastodev" },
      { name: "description", content: "Pesan jasa pembuatan website, aplikasi, dan desain dari developer freelancer Indonesia." },
      { property: "og:title", content: "Jasa developer & freelancer — Pastodev" },
      { property: "og:description", content: "Pembuatan website, aplikasi, desain, dan lainnya dari freelancer Nusantara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JasaList,
});

function JasaList() {
  const { profile } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["services", "list", q, cat],
    queryFn: async () => {
      let query = supabase.from("services").select(SERVICE_SELECT).eq("is_active", true).order("created_at", { ascending: false }).limit(60);
      if (q.trim()) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
      if (cat) query = query.eq("category", cat);
      return ((await query).data ?? []) as unknown as ServiceCardData[];
    },
  });
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Jasa</h1>
          <p className="text-muted-foreground">Butuh website atau aplikasi? Pesan langsung ke developer freelancer.</p>
        </div>
        {profile?.account_type === "developer" && <Button asChild><Link to="/studio/jasa/$id" params={{ id: "baru" }}><Plus /> Buka jasa</Link></Button>}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari jasa…" className="pl-8" />
        </div>
        <Button size="sm" variant={cat === "" ? "default" : "outline"} onClick={() => setCat("")}>Semua</Button>
        {CATEGORIES.map(([k, l]) => <Button key={k} size="sm" variant={cat === k ? "default" : "outline"} onClick={() => setCat(k)}>{l}</Button>)}
      </div>
      <div className={cn("mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4", isLoading && "opacity-60")}>
        {(data ?? []).map((s) => <ServiceCard key={s.id} s={s} />)}
      </div>
      {!isLoading && data?.length === 0 && <p className="mt-10 text-center text-muted-foreground">Belum ada jasa yang cocok.</p>}
    </main>
  );
}
