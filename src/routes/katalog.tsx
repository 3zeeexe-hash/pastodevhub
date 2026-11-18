import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowRight, LayoutGrid, Package, PackageSearch, Search, SlidersHorizontal, Wrench, X, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, categoryLabel } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GobiLoader } from "@/components/gobi-loader";
import { ProductCard, PRODUCT_SELECT, ServiceCard, SERVICE_SELECT, type ProductCardData, type ServiceCardData } from "@/components/market-cards";
import { cn } from "@/lib/utils";

const TABS = ["semua", "karya", "jasa"] as const;
const SORTS = ["terbaru", "terlaris", "termurah", "termahal"] as const;
const HARGA = ["", "gratis", "berbayar"] as const;

type Tab = (typeof TABS)[number];
type Sort = (typeof SORTS)[number];
type Harga = (typeof HARGA)[number];
type KatalogSearch = { tab?: Tab; kategori?: string; q?: string; urut?: Sort; harga?: Harga; hal?: number };
type Paged<T> = { rows: T[]; total: number };

const schema = z.object({
  tab: z.enum(TABS).catch("semua"),
  kategori: z.string().catch(""),
  q: z.union([z.string(), z.number()]).transform((v) => String(v)).catch(""),
  urut: z.enum(SORTS).catch("terbaru"),
  harga: z.enum(HARGA).catch(""),
  hal: z.coerce.number().int().min(1).catch(1),
});

/** Buang nilai bawaan supaya link tetap pendek dan bersih. */
function clean(s: KatalogSearch): KatalogSearch {
  const o: KatalogSearch = {};
  if (s.tab && s.tab !== "semua") o.tab = s.tab;
  if (s.kategori) o.kategori = s.kategori;
  if (s.q) o.q = s.q;
  if (s.urut && s.urut !== "terbaru") o.urut = s.urut;
  if (s.harga) o.harga = s.harga;
  if (s.hal && s.hal > 1) o.hal = s.hal;
  return o;
}

export const Route = createFileRoute("/katalog")({
  validateSearch: (s): KatalogSearch => clean(schema.parse(s)),
  head: () => ({
    meta: [
      { title: "Katalog karya & jasa — GoBi" },
      { name: "description", content: "Katalog source code, template, dan jasa developer Indonesia dalam satu tempat." },
      { property: "og:title", content: "Katalog karya & jasa — GoBi" },
      { property: "og:description", content: "Temukan karya siap pakai dan jasa developer Nusantara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Catalog,
});

const PREVIEW = 8;
const PAGE = 12;

const TAB_META: Record<Tab, readonly [string, LucideIcon]> = {
  semua: ["Semua", LayoutGrid],
  karya: ["Karya", Package],
  jasa: ["Jasa", Wrench],
};
const SORT_LABEL: Record<Sort, string> = { terbaru: "Terbaru", terlaris: "Terlaris", termurah: "Harga terendah", termahal: "Harga tertinggi" };
const HARGA_LABEL: Record<Harga, string> = { "": "Semua harga", gratis: "Gratis", berbayar: "Berbayar" };

const SELECT_CLS = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** 1 kolom di HP kecil, 2 di HP besar, 3 di tablet, lalu 2 → 3 kolom di desktop (sisi kiri dipakai sidebar filter). */
const GRID = "grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3";
/** Baris chip: geser horizontal di HP, membungkus di layar lebar. */
const CHIPS = "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden";

function EmptyState({ text, reset }: { text: string; reset?: KatalogSearch }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary"><PackageSearch className="size-6" /></span>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {reset && <Button asChild variant="outline" size="sm"><Link to="/katalog" search={reset}><X /> Reset pencarian</Link></Button>}
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-card/60 px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">Data belum bisa ditampilkan. Periksa koneksi lalu coba lagi.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Coba lagi</Button>
    </div>
  );
}

function SectionHead({ Icon, title, total, all }: { Icon: LucideIcon; title: string; total?: number; all?: KatalogSearch }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold sm:text-xl">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon className="size-4" /></span>
        <span className="truncate">{title}</span>
        {total !== undefined && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{total.toLocaleString("id-ID")}</span>}
      </h2>
      {all && (
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-primary hover:text-primary">
          <Link to="/katalog" search={all}>Lihat semua <ArrowRight /></Link>
        </Button>
      )}
    </div>
  );
}

function Pager({ page, pages, prev, next }: { page: number; pages: number; prev: KatalogSearch; next: KatalogSearch }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2 pt-2 text-sm" aria-label="Halaman">
      {page > 1
        ? <Button asChild size="sm" variant="outline" className="h-10"><Link to="/katalog" search={prev}>Sebelumnya</Link></Button>
        : <Button size="sm" variant="outline" className="h-10" disabled>Sebelumnya</Button>}
      <span className="text-center text-muted-foreground">Halaman {page} dari {pages}</span>
      {page < pages
        ? <Button asChild size="sm" variant="outline" className="h-10"><Link to="/katalog" search={next}>Berikutnya</Link></Button>
        : <Button size="sm" variant="outline" className="h-10" disabled>Berikutnya</Button>}
    </nav>
  );
}

/** Satu baris pilihan di sidebar desktop dan di lembar filter mobile. */
function Opt({ active, search, Icon, children }: { active: boolean; search: KatalogSearch; Icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <Link
      to="/katalog"
      search={search}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {Icon && <Icon className={cn("size-4 shrink-0", active && "text-primary")} />}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Catalog() {
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = sp.tab ?? "semua";
  const kategori = sp.kategori ?? "";
  const q = sp.q ?? "";
  const urut = sp.urut ?? "terbaru";
  const harga = sp.harga ?? "";
  const hal = sp.hal ?? 1;

  const cur: KatalogSearch = { tab, kategori, q, urut, harga, hal };
  /** Pindah ke halaman 1 setiap kali filter berubah, kecuali `hal` diisi sendiri. */
  const to = (patch: KatalogSearch): KatalogSearch => clean({ ...cur, hal: 1, ...patch });

  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const term = q.trim().replace(/[%,()_]/g, " ").trim().slice(0, 80);
  const single = tab !== "semua";
  const from = single ? (hal - 1) * PAGE : 0;
  const upto = single ? from + PAGE - 1 : PREVIEW - 1;

  const products = useQuery({
    queryKey: ["katalog", "karya", term, kategori, harga, urut, single, hal],
    enabled: tab !== "jasa",
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Paged<ProductCardData>> => {
      let qb = supabase.from("products").select(PRODUCT_SELECT, { count: "exact" }).eq("is_published", true);
      if (term) qb = qb.ilike("title", `%${term}%`);
      if (kategori) qb = qb.eq("category", kategori);
      if (harga === "gratis") qb = qb.eq("price", 0);
      if (harga === "berbayar") qb = qb.gt("price", 0);
      if (urut === "terlaris") qb = qb.order("download_count", { ascending: false });
      else if (urut === "termurah") qb = qb.order("price", { ascending: true });
      else if (urut === "termahal") qb = qb.order("price", { ascending: false });
      const { data, error, count } = await qb.order("created_at", { ascending: false }).range(from, upto);
      if (error) {
        if (error.code === "PGRST103") return { rows: [], total: 0 };
        throw error;
      }
      return { rows: (data ?? []) as unknown as ProductCardData[], total: count ?? 0 };
    },
  });

  const services = useQuery({
    queryKey: ["katalog", "jasa", term, kategori, urut === "termurah" || urut === "termahal" ? urut : "terbaru", single, hal],
    enabled: tab !== "karya",
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Paged<ServiceCardData>> => {
      let qb = supabase.from("services").select(SERVICE_SELECT, { count: "exact" }).eq("is_active", true);
      if (term) qb = qb.ilike("title", `%${term}%`);
      if (kategori) qb = qb.eq("category", kategori);
      if (urut === "termurah") qb = qb.order("price_from", { ascending: true });
      else if (urut === "termahal") qb = qb.order("price_from", { ascending: false });
      const { data, error, count } = await qb.order("created_at", { ascending: false }).range(from, upto);
      if (error) {
        if (error.code === "PGRST103") return { rows: [], total: 0 };
        throw error;
      }
      return { rows: (data ?? []) as unknown as ServiceCardData[], total: count ?? 0 };
    },
  });

  const hasFilter = !!(q || kategori || harga);
  const resetAll: KatalogSearch = clean({ tab });
  const sortOptions = SORTS.filter((s) => tab !== "jasa" || s !== "terlaris");
  const sortValue: Sort = tab === "jasa" && urut === "terlaris" ? "terbaru" : urut;
  const showPrice = tab !== "jasa";

  const nProducts = products.data?.total;
  const nServices = services.data?.total;
  const summary =
    tab === "karya" ? (nProducts !== undefined ? `${nProducts.toLocaleString("id-ID")} karya ditemukan` : "")
    : tab === "jasa" ? (nServices !== undefined ? `${nServices.toLocaleString("id-ID")} jasa ditemukan` : "")
    : nProducts !== undefined && nServices !== undefined ? (hasFilter ? `${(nProducts + nServices).toLocaleString("id-ID")} hasil ditemukan` : "Karya dan jasa terbaru")
    : "";

  const pills: { label: string; remove: KatalogSearch }[] = [
    ...(q ? [{ label: `“${q}”`, remove: to({ q: "" }) }] : []),
    ...(kategori ? [{ label: categoryLabel(kategori), remove: to({ kategori: "" }) }] : []),
    ...(harga && showPrice ? [{ label: HARGA_LABEL[harga], remove: to({ harga: "" }) }] : []),
  ];

  return (
    <main className="pb-[env(safe-area-inset-bottom)]">
      {/* Hero: biru tua GOBI dengan aksen oranye, pencarian jadi fokus utama */}
      <section className="relative overflow-hidden bg-header-gradient text-header-foreground">
        <div className="bg-hero absolute inset-0 opacity-80" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:py-12 lg:py-14">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-glow">Katalog GoBi</p>
            <h1 className="text-balance text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">Karya siap pakai dan jasa developer</h1>
            <p className="text-sm text-header-foreground/75 sm:text-base">Template, source code, dan layanan dari developer Nusantara. Gratis, berbayar, atau sesuai kebutuhanmu.</p>
          </div>
          <form
            className="mt-6 flex max-w-2xl gap-2"
            role="search"
            onSubmit={(e) => { e.preventDefault(); navigate({ search: to({ q: text.trim() }) }); }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-grey-500" />
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={80}
                placeholder="Cari template, aplikasi, jasa website…"
                aria-label="Cari di katalog"
                className="h-12 rounded-xl border-transparent bg-white pl-11 pr-10 text-base text-navy shadow-lg placeholder:text-grey-500 md:text-base"
              />
              {text && (
                <button
                  type="button"
                  aria-label="Hapus kata kunci"
                  onClick={() => { setText(""); if (q) navigate({ search: to({ q: "" }) }); }}
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-grey-500 hover:bg-grey-100"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button type="submit" size="lg" className="h-12 rounded-xl px-5 shadow-glow">Cari</Button>
          </form>
        </div>
        <div className="batik-line" aria-hidden />
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-8">
        {/* Sidebar filter: hanya di desktop */}
        <aside className="hidden lg:block" aria-label="Filter katalog">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-5 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="size-4 text-primary" /> Filter</h2>
              {hasFilter && <Link to="/katalog" search={resetAll} className="text-xs font-medium text-link hover:underline">Reset</Link>}
            </div>
            <Group title="Jenis">
              {TABS.map((k) => {
                const [label, Icon] = TAB_META[k];
                return <Opt key={k} active={tab === k} search={to({ tab: k })} Icon={Icon}>{label}</Opt>;
              })}
            </Group>
            <Group title="Kategori">
              <Opt active={!kategori} search={to({ kategori: "" })}>Semua kategori</Opt>
              {CATEGORIES.map(([k, l]) => <Opt key={k} active={kategori === k} search={to({ kategori: k })}>{l}</Opt>)}
            </Group>
            {showPrice && (
              <Group title="Harga karya">
                {HARGA.map((h) => <Opt key={h} active={harga === h} search={to({ harga: h })}>{HARGA_LABEL[h]}</Opt>)}
              </Group>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {/* Mobile & tablet: pilihan jenis dan kategori di atas konten */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1 lg:hidden" role="tablist" aria-label="Jenis katalog">
            {TABS.map((k) => {
              const [label, Icon] = TAB_META[k];
              return (
                <Link
                  key={k}
                  to="/katalog"
                  search={to({ tab: k })}
                  role="tab"
                  aria-selected={tab === k}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition",
                    tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4", tab === k && "text-primary")} />{label}
                </Link>
              );
            })}
          </div>
          <div className={cn(CHIPS, "lg:hidden")} role="group" aria-label="Kategori">
            <Button asChild size="sm" variant={kategori === "" ? "default" : "outline"} className="shrink-0 snap-start rounded-full">
              <Link to="/katalog" search={to({ kategori: "" })}>Semua</Link>
            </Button>
            {CATEGORIES.map(([k, l]) => (
              <Button key={k} asChild size="sm" variant={kategori === k ? "default" : "outline"} className="shrink-0 snap-start rounded-full">
                <Link to="/katalog" search={to({ kategori: k })}>{l}</Link>
              </Button>
            ))}
          </div>

          {/* Toolbar: ringkasan hasil, filter harga (mobile), urutan */}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">{summary}</p>
            <div className="flex shrink-0 items-center gap-2">
              {showPrice && (
                <Sheet>
                  <SheetTrigger asChild>
                    <Button type="button" variant="outline" className="h-10 rounded-lg lg:hidden">
                      <SlidersHorizontal /> Harga
                      {harga && <span className="ml-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <SheetHeader className="text-left">
                      <SheetTitle>Filter harga karya</SheetTitle>
                      <SheetDescription>Pilih karya gratis atau berbayar.</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-1 py-4">
                      {HARGA.map((h) => <Opt key={h} active={harga === h} search={to({ harga: h })}>{HARGA_LABEL[h]}</Opt>)}
                    </div>
                    <SheetFooter className="flex-row gap-2 sm:space-x-0">
                      <SheetClose asChild><Button asChild variant="outline" className="h-11 flex-1"><Link to="/katalog" search={to({ harga: "" })}>Reset</Link></Button></SheetClose>
                      <SheetClose asChild><Button type="button" className="h-11 flex-1">Lihat hasil</Button></SheetClose>
                    </SheetFooter>
                  </SheetContent>
                </Sheet>
              )}
              <select
                aria-label="Urutkan"
                className={SELECT_CLS}
                value={sortValue}
                onChange={(e) => navigate({ search: to({ urut: e.target.value as Sort }) })}
              >
                {sortOptions.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Filter aktif: satu ketukan untuk melepas */}
          {pills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Filter aktif">
              {pills.map((p) => (
                <Link key={p.label} to="/katalog" search={p.remove} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-accent">
                  <span className="max-w-[12rem] truncate">{p.label}</span><X className="size-3.5" aria-hidden /><span className="sr-only">Hapus filter</span>
                </Link>
              ))}
              <Link to="/katalog" search={resetAll} className="text-xs font-medium text-link hover:underline">Hapus semua</Link>
            </div>
          )}

          {tab !== "jasa" && (
            <section className="space-y-3" aria-label="Karya">
              <SectionHead Icon={Package} title="Karya" total={nProducts} all={tab === "semua" && (nProducts ?? 0) > PREVIEW ? to({ tab: "karya" }) : undefined} />
              {products.isLoading ? <GobiLoader />
                : products.error ? <ErrorBox onRetry={() => products.refetch()} />
                : products.data && (products.data.rows.length > 0
                  ? <div className={cn(GRID, products.isPlaceholderData && "opacity-60 transition-opacity")}>{products.data.rows.map((p) => <ProductCard key={p.id} p={p} />)}</div>
                  : <EmptyState text={hasFilter ? "Belum ada karya yang cocok. Coba kata kunci atau filter lain." : "Belum ada karya yang terbit."} reset={hasFilter ? resetAll : undefined} />)}
              {tab === "karya" && products.data && (
                <Pager page={hal} pages={Math.max(1, Math.ceil(products.data.total / PAGE))} prev={to({ hal: hal - 1 })} next={to({ hal: hal + 1 })} />
              )}
            </section>
          )}

          {tab !== "karya" && (
            <section className={cn("space-y-3", tab === "semua" && "pt-3")} aria-label="Jasa">
              <SectionHead Icon={Wrench} title="Jasa" total={nServices} all={tab === "semua" && (nServices ?? 0) > PREVIEW ? to({ tab: "jasa" }) : undefined} />
              {services.isLoading ? <GobiLoader />
                : services.error ? <ErrorBox onRetry={() => services.refetch()} />
                : services.data && (services.data.rows.length > 0
                  ? <div className={cn(GRID, services.isPlaceholderData && "opacity-60 transition-opacity")}>{services.data.rows.map((s) => <ServiceCard key={s.id} s={s} />)}</div>
                  : <EmptyState text={hasFilter ? "Belum ada jasa yang cocok. Coba kata kunci atau kategori lain." : "Belum ada jasa yang terbit."} reset={hasFilter ? resetAll : undefined} />)}
              {tab === "jasa" && services.data && (
                <Pager page={hal} pages={Math.max(1, Math.ceil(services.data.total / PAGE))} prev={to({ hal: hal - 1 })} next={to({ hal: hal + 1 })} />
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
