import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/market";
import {
  DAY_OPTIONS, EMPTY_FILTERS, PAGE_SIZE, RATING_OPTIONS, SECTION_SIZE, SORTS, SORT_LABEL, buildExploreArgs, hasActiveFilters, pageCount,
  type ExploreFilters, type ExploreResult, type ExploreSort, type TopSeller,
} from "@/lib/services-explore";
import { serviceRpc, useServiceTaxonomy } from "@/lib/services-db";
import { ExploreCard } from "@/components/service-explore-card";
import { RupiahInput } from "@/components/rupiah-input";
import { ServiceCard, SERVICE_SELECT, type ServiceCardData } from "@/components/market-cards";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jasa/")({
  head: () => ({
    meta: [
      { title: "Jasa developer & freelancer — GoBi" },
      { name: "description", content: "Pesan jasa pembuatan website, aplikasi, dan desain dari developer freelancer Indonesia." },
      { property: "og:title", content: "Jasa developer & freelancer — GoBi" },
      { property: "og:description", content: "Pembuatan website, aplikasi, desain, dan lainnya dari freelancer Nusantara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JasaExplore,
});

const SELECT_CLS = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

function CardSkeletons({ n = 4 }: { n?: number }) {
  return <div className={GRID}>{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;
}

function Section({ title, hint, query, onAll }: { title: string; hint: string; query: { isLoading: boolean; data?: ExploreResult }; onAll: () => void }) {
  if (!query.isLoading && (query.data?.rows.length ?? 0) === 0) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-muted-foreground">{hint}</p></div>
        <Button variant="ghost" size="sm" onClick={onAll}>Lihat semua</Button>
      </div>
      {query.isLoading ? <CardSkeletons /> : <div className={GRID}>{query.data!.rows.map((s) => <ExploreCard key={s.id} s={s} />)}</div>}
    </section>
  );
}

function TopSellers({ sellers }: { sellers: TopSeller[] }) {
  if (sellers.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Seller unggulan">
      <div><h2 className="text-xl font-bold">Seller unggulan</h2><p className="text-sm text-muted-foreground">Developer dengan pesanan selesai terbanyak.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sellers.map((p) => (
          <Link key={p.id} to="/$username" params={{ username: p.username }} search={{ tab: "jasa" }} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/60">
            <AvatarMini name={p.username} url={p.avatar_url} size={44} />
            <span className="min-w-0 text-sm">
              <b className="flex items-center gap-1"><span className="truncate">{p.display_name || p.username}</span><VerifiedBadge username={p.username} verified={p.is_verified} size={14} /></b>
              <span className="block truncate text-xs text-muted-foreground">{p.headline || `@${p.username}`}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {p.reviews > 0 && <span className="inline-flex items-center gap-0.5"><Star className="size-3 fill-primary text-primary" />{Number(p.rating).toFixed(1)}</span>}
                <span>{p.services} jasa</span>
                {p.orders_completed > 0 && <span>{p.orders_completed} selesai</span>}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Daftar lama (tabel services apa adanya). Dipakai hanya bila fungsi service_explore belum tersedia, supaya halaman tidak kosong. */
function LegacyList({ q, cat }: { q: string; cat: string }) {
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
    <>
      <div className={cn(GRID, isLoading && "opacity-60")}>{(data ?? []).map((s) => <ServiceCard key={s.id} s={s} />)}</div>
      {!isLoading && data?.length === 0 && <p className="mt-10 text-center text-muted-foreground">Belum ada jasa yang cocok.</p>}
    </>
  );
}

/** Satu bagian kurasi di halaman awal (populer, terbaru, rating tinggi). Hanya aktif saat tidak ada filter. */
function useSection(key: string, enabled: boolean, patch: Partial<ExploreFilters>) {
  return useQuery({
    queryKey: ["services", "explore-section", key],
    enabled,
    staleTime: 60_000,
    queryFn: () => serviceRpc<ExploreResult>("service_explore", buildExploreArgs({ ...EMPTY_FILTERS, ...patch }, 0, SECTION_SIZE)),
  });
}

function JasaExplore() {
  const { user, profile } = useAuth();
  const taxonomy = useServiceTaxonomy();
  const [f, setF] = useState<ExploreFilters>(EMPTY_FILTERS);
  const [text, setText] = useState("");
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [legacyCat, setLegacyCat] = useState("");

  const active = hasActiveFilters(f) || browseAll;
  const args = buildExploreArgs(f, page);
  const results = useQuery({ queryKey: ["services", "explore", args], enabled: active, queryFn: () => serviceRpc<ExploreResult>("service_explore", args) });
  const popular = useSection("popular", !active, { sort: "popular" });
  const newest = useSection("newest", !active, {});
  const topRated = useSection("rating", !active, { sort: "rating", minRating: "4" });
  const sellers = useQuery({ queryKey: ["services", "top-sellers"], enabled: !active, staleTime: 60_000, queryFn: () => serviceRpc<TopSeller[]>("service_top_sellers", { _limit: 8 }) });

  const rpcFailed = active ? !!results.error : !!(popular.error && newest.error);
  const categories = taxonomy.data?.categories ?? [];
  const subcats = (taxonomy.data?.subcategories ?? []).filter((s) => s.category_slug === f.category);

  const set = (patch: Partial<ExploreFilters>) => { setF((p) => ({ ...p, ...patch })); setPage(0); };
  const reset = () => { setF(EMPTY_FILTERS); setText(""); setPage(0); setBrowseAll(false); };
  const total = results.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Jasa</h1>
          <p className="text-muted-foreground">Butuh website atau aplikasi? Pesan langsung ke developer freelancer.</p>
        </div>
        {profile?.account_type === "developer" && <Button asChild><Link to="/studio/jasa"><Plus /> Jasa saya</Link></Button>}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text }); }}>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="Cari jasa, skill, atau penjual…" aria-label="Cari jasa" className="pl-8" />
        </div>
        <Button type="submit" variant="secondary">Cari</Button>
        {!rpcFailed && (
          <>
            <select aria-label="Urutkan" className={SELECT_CLS} value={f.sort} onChange={(e) => set({ sort: e.target.value as ExploreSort })}>
              {SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
            <Button type="button" variant={showFilters ? "default" : "outline"} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}><SlidersHorizontal /> Filter</Button>
          </>
        )}
        {active && <Button type="button" variant="ghost" onClick={reset}><X /> Reset</Button>}
      </form>

      {rpcFailed ? (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Button size="sm" variant={legacyCat === "" ? "default" : "outline"} className="shrink-0" onClick={() => setLegacyCat("")}>Semua</Button>
            {CATEGORIES.map(([k, l]) => <Button key={k} size="sm" variant={legacyCat === k ? "default" : "outline"} className="shrink-0" onClick={() => setLegacyCat(k)}>{l}</Button>)}
          </div>
          <LegacyList q={f.q} cat={legacyCat} />
        </>
      ) : (
        <>
          {categories.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Kategori">
              <Button size="sm" variant={f.category === "" ? "default" : "outline"} className="shrink-0" onClick={() => set({ category: "", subcategory: "" })}>Semua</Button>
              {categories.map((c) => <Button key={c.slug} size="sm" variant={f.category === c.slug ? "default" : "outline"} className="shrink-0" onClick={() => set({ category: c.slug, subcategory: "" })}>{c.label}</Button>)}
            </div>
          )}

          {showFilters && (
            <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label htmlFor="fmin">Harga minimal</Label><RupiahInput id="fmin" value={f.minPrice} onValueChange={(v) => set({ minPrice: v })} placeholder="Rp 0" /></div>
              <div><Label htmlFor="fmax">Harga maksimal</Label><RupiahInput id="fmax" value={f.maxPrice} onValueChange={(v) => set({ maxPrice: v })} placeholder="Tanpa batas" /></div>
              <div><Label htmlFor="fdays">Waktu pengerjaan</Label>
                <select id="fdays" className={cn(SELECT_CLS, "w-full")} value={f.maxDays} onChange={(e) => set({ maxDays: e.target.value })}>
                  <option value="">Semua</option>
                  {DAY_OPTIONS.map((d) => <option key={d} value={d}>Maks {d} hari</option>)}
                </select></div>
              <div><Label htmlFor="frate">Rating minimal</Label>
                <select id="frate" className={cn(SELECT_CLS, "w-full")} value={f.minRating} onChange={(e) => set({ minRating: e.target.value })}>
                  <option value="">Semua</option>
                  {RATING_OPTIONS.map((r) => <option key={r} value={r}>{r}+ bintang</option>)}
                </select></div>
              {subcats.length > 0 && (
                <div><Label htmlFor="fsub">Subkategori</Label>
                  <select id="fsub" className={cn(SELECT_CLS, "w-full")} value={f.subcategory} onChange={(e) => set({ subcategory: e.target.value })}>
                    <option value="">Semua</option>
                    {subcats.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
                  </select></div>
              )}
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.verifiedOnly} onCheckedChange={(v) => set({ verifiedOnly: v === true })} /> Hanya seller terverifikasi</label>
              {user && <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.favoritesOnly} onCheckedChange={(v) => set({ favoritesOnly: v === true })} /> Favorit saya</label>}
            </div>
          )}

          {active ? (
            <section aria-live="polite" className="space-y-4">
              {results.isLoading && <CardSkeletons n={8} />}
              {results.data && (
                <>
                  <p className="text-sm text-muted-foreground">{total.toLocaleString("id-ID")} jasa ditemukan</p>
                  {results.data.rows.length > 0
                    ? <div className={GRID}>{results.data.rows.map((s) => <ExploreCard key={s.id} s={s} />)}</div>
                    : <p className="py-10 text-center text-muted-foreground">{f.favoritesOnly ? "Belum ada jasa favorit." : "Tidak ada jasa yang cocok. Coba kata kunci atau filter lain."}</p>}
                  {pages > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                      <span className="text-muted-foreground">Halaman {page + 1} dari {pages}</span>
                      <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <div className="space-y-10">
              <Section title="Jasa populer" hint="Paling banyak dipesan sampai selesai." query={popular} onAll={() => set({ sort: "popular" })} />
              <Section title="Jasa terbaru" hint="Baru dibuka oleh developer." query={newest} onAll={() => { setBrowseAll(true); setPage(0); }} />
              <Section title="Rating tinggi" hint="Ulasan pembeli 4 bintang ke atas." query={topRated} onAll={() => set({ sort: "rating", minRating: "4" })} />
              <TopSellers sellers={sellers.data ?? []} />
              {!popular.isLoading && !newest.isLoading && (newest.data?.rows.length ?? 0) === 0 && <p className="py-10 text-center text-muted-foreground">Belum ada jasa yang terbit.</p>}
            </div>
          )}
        </>
      )}
    </main>
  );
}
