import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, PackageSearch, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
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
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

const SELECT_CLS = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** Grid hasil: 1 kolom di HP kecil, 2 di HP besar/tablet kecil, 3 di tablet/laptop (dengan sidebar), 4 di layar lebar. */
const GRID = "grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
/** Rail kurasi: geser horizontal (snap) di HP, berubah jadi grid di md ke atas. */
const RAIL = "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4 [&::-webkit-scrollbar]:hidden";
const RAIL_ITEM = "w-[74%] max-w-[290px] shrink-0 snap-start md:w-auto md:max-w-none";
const CHIPS = "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden";

function CardSkeletons({ n = 4 }: { n?: number }) {
  return <div className={GRID}>{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>;
}

function RailSkeletons() {
  return <div className={RAIL}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={cn(RAIL_ITEM, "h-72 rounded-xl")} />)}</div>;
}

function Section({ title, hint, query, onAll }: { title: string; hint: string; query: { isLoading: boolean; data?: ExploreResult }; onAll: () => void }) {
  if (!query.isLoading && (query.data?.rows.length ?? 0) === 0) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 text-primary hover:text-primary" onClick={onAll}>Lihat semua <ArrowRight /></Button>
      </div>
      {query.isLoading
        ? <RailSkeletons />
        : <div className={RAIL}>{query.data!.rows.map((s) => <div key={s.id} className={RAIL_ITEM}><ExploreCard s={s} /></div>)}</div>}
    </section>
  );
}

function TopSellers({ sellers }: { sellers: TopSeller[] }) {
  if (sellers.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Seller unggulan">
      <div>
        <h2 className="text-lg font-bold sm:text-xl">Seller unggulan</h2>
        <p className="text-sm text-muted-foreground">Developer dengan pesanan selesai terbanyak.</p>
      </div>
      <div className={cn(RAIL, "md:grid-cols-2 xl:grid-cols-4")}>
        {sellers.map((p) => (
          <Link
            key={p.id}
            to="/$username"
            params={{ username: p.username }}
            search={{ tab: "jasa" }}
            className={cn(RAIL_ITEM, "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/60 hover:shadow-md md:max-w-none")}
          >
            <AvatarMini name={p.username} url={p.avatar_url} size={48} />
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
      {!isLoading && data?.length === 0 && <EmptyState text="Belum ada jasa yang cocok." />}
    </>
  );
}

function EmptyState({ text, onReset }: { text: string; onReset?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"><PackageSearch className="size-6" /></span>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {onReset && <Button variant="outline" size="sm" onClick={onReset}><X /> Reset pencarian</Button>}
    </div>
  );
}

/** Panel filter: dipakai di sidebar (desktop) dan di bottom sheet (mobile). `idp` mencegah id ganda di antara keduanya. */
function FilterPanel({ f, set, subcats, loggedIn, idp }: {
  f: ExploreFilters; set: (patch: Partial<ExploreFilters>) => void; subcats: { slug: string; label: string }[]; loggedIn: boolean; idp: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Rentang harga</Label>
        <div className="grid grid-cols-2 gap-2">
          <RupiahInput id={`${idp}-min`} aria-label="Harga minimal" value={f.minPrice} onValueChange={(v) => set({ minPrice: v })} placeholder="Min" />
          <RupiahInput id={`${idp}-max`} aria-label="Harga maksimal" value={f.maxPrice} onValueChange={(v) => set({ maxPrice: v })} placeholder="Maks" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idp}-days`}>Waktu pengerjaan</Label>
        <select id={`${idp}-days`} className={cn(SELECT_CLS, "w-full")} value={f.maxDays} onChange={(e) => set({ maxDays: e.target.value })}>
          <option value="">Semua</option>
          {DAY_OPTIONS.map((d) => <option key={d} value={d}>Maks {d} hari</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idp}-rate`}>Rating minimal</Label>
        <select id={`${idp}-rate`} className={cn(SELECT_CLS, "w-full")} value={f.minRating} onChange={(e) => set({ minRating: e.target.value })}>
          <option value="">Semua</option>
          {RATING_OPTIONS.map((r) => <option key={r} value={r}>{r}+ bintang</option>)}
        </select>
      </div>
      {subcats.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idp}-sub`}>Subkategori</Label>
          <select id={`${idp}-sub`} className={cn(SELECT_CLS, "w-full")} value={f.subcategory} onChange={(e) => set({ subcategory: e.target.value })}>
            <option value="">Semua</option>
            {subcats.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </select>
        </div>
      )}
      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
          <Checkbox checked={f.verifiedOnly} onCheckedChange={(v) => set({ verifiedOnly: v === true })} /> Hanya seller terverifikasi
        </label>
        {loggedIn && (
          <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox checked={f.favoritesOnly} onCheckedChange={(v) => set({ favoritesOnly: v === true })} /> Favorit saya
          </label>
        )}
      </div>
    </div>
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
  const goPage = (n: number) => { setPage(n); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };
  const total = results.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const filterCount =
    [f.subcategory, f.minPrice, f.maxPrice, f.maxDays, f.minRating].filter(Boolean).length + (f.verifiedOnly ? 1 : 0) + (f.favoritesOnly ? 1 : 0);
  const showSidebar = !rpcFailed;

  return (
    <main className="pb-[env(safe-area-inset-bottom)]">
      {/* Hero: biru tua GOBI dengan aksen oranye, pencarian jadi fokus utama */}
      <section className="relative overflow-hidden bg-header-gradient text-header-foreground">
        <div className="bg-hero absolute inset-0 opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:py-12 lg:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-glow">Marketplace jasa</p>
              <h1 className="text-balance text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">Temukan developer untuk proyekmu</h1>
              <p className="text-sm text-header-foreground/75 sm:text-base">Website, aplikasi, dan desain dari freelancer Nusantara. Pesan langsung, tanpa ribet.</p>
            </div>
            {profile?.account_type === "developer" && (
              <Button asChild size="lg" className="shadow-glow"><Link to="/studio/jasa"><Plus /> Jasa saya</Link></Button>
            )}
          </div>

          <form className="mt-6 flex max-w-2xl gap-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: text }); }}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-grey-500" />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={80}
                placeholder="Cari jasa, skill, atau penjual…"
                aria-label="Cari jasa"
                className="h-12 rounded-xl border-transparent bg-white pl-11 text-base text-navy shadow-lg placeholder:text-grey-500 md:text-base"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 rounded-xl px-5 shadow-glow">Cari</Button>
          </form>
        </div>
        <div className="batik-line" aria-hidden />
      </section>

      <div className={cn("mx-auto max-w-7xl px-4 py-6 sm:py-8", showSidebar && "lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8")}>
        {/* Sidebar filter (desktop) */}
        {showSidebar && (
          <aside className="hidden lg:block" aria-label="Filter jasa">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="size-4 text-primary" /> Filter</h2>
                {(filterCount > 0 || active) && <button type="button" onClick={reset} className="text-xs font-medium text-link hover:underline">Reset</button>}
              </div>
              <FilterPanel f={f} set={set} subcats={subcats} loggedIn={!!user} idp="d" />
            </div>
          </aside>
        )}

        <div className="min-w-0 space-y-6">
          {rpcFailed ? (
            <>
              <div className={CHIPS}>
                <Button size="sm" variant={legacyCat === "" ? "default" : "outline"} className="shrink-0 snap-start rounded-full" onClick={() => setLegacyCat("")}>Semua</Button>
                {CATEGORIES.map(([k, l]) => <Button key={k} size="sm" variant={legacyCat === k ? "default" : "outline"} className="shrink-0 snap-start rounded-full" onClick={() => setLegacyCat(k)}>{l}</Button>)}
              </div>
              <LegacyList q={f.q} cat={legacyCat} />
            </>
          ) : (
            <>
              {categories.length > 0 && (
                <div className={CHIPS} role="group" aria-label="Kategori">
                  <Button size="sm" variant={f.category === "" ? "default" : "outline"} className="shrink-0 snap-start rounded-full" onClick={() => set({ category: "", subcategory: "" })}>Semua</Button>
                  {categories.map((c) => (
                    <Button key={c.slug} size="sm" variant={f.category === c.slug ? "default" : "outline"} className="shrink-0 snap-start rounded-full" onClick={() => set({ category: c.slug, subcategory: "" })}>{c.label}</Button>
                  ))}
                </div>
              )}

              {/* Toolbar: ringkasan hasil, filter (mobile), urutan */}
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">
                  {active ? (results.data ? `${total.toLocaleString("id-ID")} jasa ditemukan` : "Memuat…") : "Pilihan kurasi untukmu"}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {active && <Button type="button" variant="ghost" size="sm" className="hidden sm:inline-flex lg:hidden" onClick={reset}><X /> Reset</Button>}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button type="button" variant="outline" className="relative h-10 rounded-lg lg:hidden">
                        <SlidersHorizontal /> Filter
                        {filterCount > 0 && <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{filterCount}</span>}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                      <SheetHeader className="text-left">
                        <SheetTitle>Filter jasa</SheetTitle>
                        <SheetDescription>Persempit hasil sesuai kebutuhan proyekmu.</SheetDescription>
                      </SheetHeader>
                      <div className="py-4"><FilterPanel f={f} set={set} subcats={subcats} loggedIn={!!user} idp="m" /></div>
                      <SheetFooter className="flex-row gap-2 sm:space-x-0">
                        <Button type="button" variant="outline" className="h-11 flex-1" onClick={reset}>Reset</Button>
                        <SheetClose asChild><Button type="button" className="h-11 flex-1">Lihat hasil</Button></SheetClose>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>
                  <select aria-label="Urutkan" className={SELECT_CLS} value={f.sort} onChange={(e) => set({ sort: e.target.value as ExploreSort })}>
                    {SORTS.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>

              {active ? (
                <section aria-live="polite" className="space-y-5">
                  {results.isLoading && <CardSkeletons n={8} />}
                  {results.data && (
                    <>
                      {results.data.rows.length > 0
                        ? <div className={GRID}>{results.data.rows.map((s) => <ExploreCard key={s.id} s={s} />)}</div>
                        : <EmptyState text={f.favoritesOnly ? "Belum ada jasa favorit." : "Tidak ada jasa yang cocok. Coba kata kunci atau filter lain."} onReset={reset} />}
                      {pages > 1 && (
                        <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Halaman">
                          <Button size="sm" variant="outline" className="h-10" disabled={page === 0} onClick={() => goPage(page - 1)}>Sebelumnya</Button>
                          <span className="text-center text-muted-foreground">Halaman {page + 1} dari {pages}</span>
                          <Button size="sm" variant="outline" className="h-10" disabled={page + 1 >= pages} onClick={() => goPage(page + 1)}>Berikutnya</Button>
                        </nav>
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
                  {!popular.isLoading && !newest.isLoading && (newest.data?.rows.length ?? 0) === 0 && <EmptyState text="Belum ada jasa yang terbit." />}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
