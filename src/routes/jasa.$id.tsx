import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock, FileText, ListOrdered, MessageCircle,
  Package, Pencil, PlusCircle, RefreshCw, Ruler, Share2, ShieldCheck, ShoppingBag, Star, Wrench, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { openChatDock } from "@/lib/chat-dock";
import { startConversation } from "@/lib/dm";
import { looseDb } from "@/lib/escrow-db";
import { isFeatureOn } from "@/lib/features";
import { categoryLabel, formatRupiah } from "@/lib/market";
import { serviceShareUrl } from "@/lib/services-explore";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { FavoriteButton } from "@/components/service-explore-card";
import { ServiceOrderPanel } from "@/components/service-order-panel";
import { GobiLoader } from "@/components/gobi-loader";
import { Markdown } from "@/components/markdown";
import { SignInCta } from "@/components/sign-in-cta";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jasa/$id")({
  // Real title, description and structured data come from the database; the text below is the fallback.
  loader: ({ params }) => getSeoInfo({ data: { kind: "service", id: params.id } }),
  staleTime: 300_000,
  head: ({ loaderData }) => seoHead(loaderData, { title: "Detail jasa — GoBi", description: "Lihat detail jasa developer dan kirim permintaan pesanan di GoBi." }),
  component: JasaDetail,
});

// Urutan ini mengikuti alur pesanan: dibuat (menunggu pembayaran) -> dibayar -> dikerjakan -> hasil diterima.
const STEPS = [
  { title: "Pilih paket dan isi brief", text: "Pilih paket dan add-on, lalu jelaskan kebutuhanmu. Total dihitung server. Butuh pekerjaan di luar paket? Pakai Permintaan khusus: developer menjawab dengan harga final sebelum kamu membayar." },
  { title: "Bayar dengan aman", text: "Bayar lewat Virtual Account atau QRIS. Dana disimpan di escrow dan langsung diteruskan ke developer begitu kamu menerima hasil." },
  { title: "Developer mengerjakan", text: "Kamu bisa chat dengan developer selama pengerjaan dan meminta revisi sesuai jatah paket." },
  { title: "Terima hasil", text: "Periksa hasilnya, minta revisi kalau perlu, lalu tandai selesai." },
] as const;

const TIER_LABEL: Record<string, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };
const TIER_STYLE: Record<string, string> = {
  basic: "bg-secondary text-secondary-foreground",
  standard: "bg-navy-soft/15 text-link",
  premium: "bg-sun text-primary-foreground",
};

// Kolom dan tabel GOBI SERVICES belum ada di tipe Supabase hasil generate, jadi dibaca lewat looseDb dan toleran bila SQL belum diterapkan.
type Extra = { buyer_requirements?: string; revision_terms?: string; scope_limits?: string; skills?: string[]; rating_avg?: number; rating_count?: number; orders_completed?: number; status?: string };
type Pkg = { id: string; tier: string; name: string; description: string; price: number; delivery_days: number; revisions: number; features: string[]; work_limit: string };
type Addon = { id: string; name: string; description: string; price: number; extra_days: number; extra_revisions: number };
type Faq = { id: string; question: string; answer: string };
type Review = { id: string; rating: number; comment: string; seller_reply: string | null; created_at: string; buyer: { username: string; display_name: string | null; avatar_url: string | null } | null };
type PortfolioItem = { id: string; title: string; image_url: string | null };
type Owner = { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; is_verified?: boolean };
type SellerStats = { services: number; completed: number; reviews: number; rating: number };

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

// Titik lg (1024px) sama dengan layout dua kolom: di bawahnya form pesan tampil sebagai bottom sheet, di atasnya sebagai panel di samping.
// Snapshot server = desktop supaya HTML awal sama di server dan klien; di mobile klien langsung menyesuaikan setelah hidrasi.
const LG_QUERY = "(min-width: 1024px)";
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(LG_QUERY);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(LG_QUERY).matches,
    () => true,
  );
}

// Gerak masuk bertahap untuk setiap blok halaman. Dimatikan otomatis bila pengguna memilih "kurangi gerakan".
const RISE = "animate-in fade-in-0 slide-in-from-bottom-3 duration-500 fill-mode-both motion-reduce:animate-none";
const delay = (n: number) => ({ animationDelay: `${n * 70}ms` });
const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";
// Tombol bulat di atas gambar: sama dengan tombol Favorit supaya satu keluarga.
const FLOAT_BTN = "flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border transition hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Geser kiri/kanan di layar sentuh. Hanya bereaksi pada gerakan mendatar yang jelas, jadi gulir vertikal tidak terganggu. */
function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = start.current;
      start.current = null;
      if (!s0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x;
      const dy = t.clientY - s0.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
    },
  };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-3.5", i <= value ? "fill-primary text-primary" : "text-muted-foreground/40")} />)}
    </span>
  );
}

/** Buka-tutup dengan tinggi yang beranimasi. Isi yang tertutup tidak bisa difokus (inert) dan tidak dibaca pembaca layar. */
function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div id={id} inert={!open} className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Kartu bagian yang bisa dibuka-tutup (dropdown). */
function Disclosure({ id, title, Icon, badge, defaultOpen = false, className, style, children }: {
  id: string; title: string; Icon: LucideIcon; badge?: ReactNode; defaultOpen?: boolean; className?: string; style?: React.CSSProperties; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${id}-isi`;
  return (
    <section id={id} style={style} className={cn("scroll-mt-20 rounded-2xl border bg-card transition-[border-color,box-shadow] duration-300", open ? "border-primary/40 shadow-sm" : "border-border", className)}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-300", open ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary")}><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1 text-base font-bold">{title}</span>
        {badge && <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{badge}</span>}
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180 text-primary")} aria-hidden />
      </button>
      <Collapse open={open} id={bodyId}>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
      </Collapse>
    </section>
  );
}

/** Baris dropdown kecil di dalam kartu (ketentuan, FAQ). */
function Row({ title, Icon, defaultOpen = false, children }: { title: ReactNode; Icon?: LucideIcon; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className={cn("rounded-xl border transition-colors duration-300", open ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40")}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {Icon && <Icon className="size-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 break-words">{title}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180 text-primary")} aria-hidden />
      </button>
      <Collapse open={open} id={bodyId}>
        <div className="px-3.5 pb-3.5 text-sm text-muted-foreground">{children}</div>
      </Collapse>
    </div>
  );
}

/** Teks panjang: tampil sebagian dengan pudar di bawah, "Lihat selengkapnya" membuka semuanya, "Sembunyikan" melipat lagi. Tinggi dianimasikan. */
function Expandable({ children, collapsedHeight = 150 }: { children: ReactNode; collapsedHeight?: number }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFull(el.scrollHeight));
    ro.observe(el);
    setFull(el.scrollHeight);
    return () => ro.disconnect();
  }, []);
  const needs = full > collapsedHeight + 24;
  return (
    <div>
      <div className={cn("relative overflow-hidden transition-[max-height] duration-500 motion-reduce:transition-none", EASE)} style={needs ? { maxHeight: open ? full : collapsedHeight } : undefined}>
        <div ref={inner}>{children}</div>
        {needs && <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent transition-opacity duration-300", open ? "opacity-0" : "opacity-100")} />}
      </div>
      {needs && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {open ? "Sembunyikan" : "Lihat selengkapnya"}
          <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Gambar paling atas: geser di layar sentuh, panah dan thumbnail di layar lebar. `controls` = tombol kembali/favorit/bagikan di atas gambar. */
function Gallery({ images, title, controls }: { images: string[]; title: string; controls: ReactNode }) {
  const [i, setI] = useState(0);
  const n = images.length;
  const cur = Math.min(i, Math.max(n - 1, 0));
  const go = (d: number) => setI((c) => (Math.min(c, n - 1) + d + n) % n);
  const swipe = useSwipe(() => n > 1 && go(-1), () => n > 1 && go(1));
  return (
    <section aria-label="Galeri jasa" className="min-w-0">
      <div {...swipe} className="relative aspect-[4/3] touch-pan-y overflow-hidden bg-hero sm:aspect-video lg:rounded-3xl lg:border lg:border-border">
        {n > 0 ? (
          <div className={cn("flex h-full transition-transform duration-500 motion-reduce:transition-none", EASE)} style={{ transform: `translateX(-${cur * 100}%)` }}>
            {images.map((u, k) => (
              <img key={u} src={u} alt={k === 0 ? title : `${title} (gambar ${k + 1})`} loading={k === 0 ? "eager" : "lazy"} draggable={false} className="size-full shrink-0 select-none object-cover" />
            ))}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center"><Wrench className="size-16 text-primary/70" /></div>
        )}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/45 to-transparent" />
        {controls}
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Gambar sebelumnya" className={cn(FLOAT_BTN, "absolute left-3 top-1/2 hidden -translate-y-1/2 sm:flex")}><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Gambar berikutnya" className={cn(FLOAT_BTN, "absolute right-3 top-1/2 hidden -translate-y-1/2 sm:flex")}><ChevronRight className="size-5" /></button>
            <div className="absolute inset-x-0 bottom-9 flex justify-center gap-1.5 lg:bottom-3" role="tablist" aria-label="Pilih gambar">
              {images.map((u, k) => (
                <button key={u} type="button" role="tab" aria-selected={k === cur} aria-label={`Gambar ${k + 1}`} onClick={() => setI(k)}
                  className={cn("h-1.5 rounded-full transition-all duration-300", k === cur ? "w-6 bg-primary" : "w-1.5 bg-white/70 hover:bg-white")} />
              ))}
            </div>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="mt-3 hidden gap-2 overflow-x-auto pb-1 lg:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((u, k) => (
            <button key={u} type="button" onClick={() => setI(k)} aria-label={`Lihat gambar ${k + 1}`} aria-current={k === cur}
              className={cn("aspect-video w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-muted transition-all duration-300", k === cur ? "border-primary" : "border-transparent opacity-60 hover:opacity-100")}>
              <img src={u} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Tab paket: pil oranye bergeser ke tab yang dipilih, panelnya ikut meluncur ke samping dan tingginya menyesuaikan. Bisa digeser dengan jari. */
function PackageTabs({ packages, activeId, onChange, onOrder }: { packages: Pkg[]; activeId: string; onChange: (id: string) => void; onOrder: ((p: Pkg) => void) | null }) {
  const n = packages.length;
  const idx = Math.max(0, packages.findIndex((p) => p.id === activeId));
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = panels.current[idx];
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [idx, n]);
  const select = (k: number) => onChange(packages[Math.min(Math.max(k, 0), n - 1)].id);
  const swipe = useSwipe(() => select(idx - 1), () => select(idx + 1));
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") { e.preventDefault(); select(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); select(idx - 1); }
  }
  return (
    <div>
      <div className="rounded-2xl bg-muted p-1">
        <div role="tablist" aria-label="Pilihan paket" onKeyDown={onKey} className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          <span aria-hidden className={cn("absolute inset-y-0 left-0 rounded-xl bg-primary shadow-glow transition-transform duration-500 motion-reduce:transition-none", EASE)}
            style={{ width: `${100 / n}%`, transform: `translateX(${idx * 100}%)` }} />
          {packages.map((p, k) => (
            <button key={p.id} type="button" role="tab" id={`pkg-tab-${p.id}`} aria-selected={k === idx} aria-controls={`pkg-panel-${p.id}`} tabIndex={k === idx ? 0 : -1} onClick={() => select(k)}
              className={cn("relative z-10 min-w-0 rounded-xl px-1.5 py-2.5 text-center transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", k === idx ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <span className="block truncate text-[11px] font-bold uppercase tracking-wide">{TIER_LABEL[p.tier] ?? p.tier}</span>
              <span className="block truncate text-[13px] font-bold sm:text-sm">{formatRupiah(p.price, "—")}</span>
            </button>
          ))}
        </div>
      </div>
      {n > 1 && <p className="mt-2 text-center text-[11px] text-muted-foreground sm:hidden">Geser ke kiri atau kanan untuk melihat paket lain</p>}

      <div {...swipe} className={cn("mt-3 touch-pan-y overflow-hidden rounded-2xl border border-border bg-card transition-[height] duration-500 motion-reduce:transition-none", EASE)} style={height ? { height } : undefined}>
        <div className={cn("flex items-start transition-transform duration-500 motion-reduce:transition-none", EASE)} style={{ transform: `translateX(-${idx * 100}%)` }}>
          {packages.map((p, k) => {
            const on = k === idx;
            return (
              <div key={p.id} ref={(el) => { panels.current[k] = el; }} role="tabpanel" id={`pkg-panel-${p.id}`} aria-labelledby={`pkg-tab-${p.id}`} aria-hidden={!on} inert={!on} className="w-full shrink-0 basis-full">
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide", TIER_STYLE[p.tier] ?? "bg-secondary text-secondary-foreground")}>{TIER_LABEL[p.tier] ?? p.tier}</span>
                      <h3 className="mt-1.5 break-words text-lg font-bold leading-snug">{p.name}</h3>
                    </div>
                    <p className="shrink-0 text-2xl font-bold text-primary">{formatRupiah(p.price, "—")}</p>
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><Clock className="size-3.5" /> {p.delivery_days} hari</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><RefreshCw className="size-3.5" /> {p.revisions} revisi</span>
                    {p.work_limit && <span className="inline-flex min-w-0 items-start gap-1.5 rounded-2xl bg-muted px-2.5 py-1"><Ruler className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 break-words">{p.work_limit}</span></span>}
                  </div>
                  {(p.features ?? []).length > 0 && (
                    <ul className="grid gap-x-4 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
                      {p.features.map((f, fi) => (
                        <li key={f} className={cn("flex items-start gap-2 transition-all duration-500 motion-reduce:transition-none", on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")} style={{ transitionDelay: on ? `${150 + fi * 60}ms` : "0ms" }}>
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 break-words">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {onOrder && <Button type="button" className="h-11 w-full rounded-full" onClick={() => onOrder(p)}><ShoppingBag /> Pesan paket ini</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatTile({ Icon, value, label, fill }: { Icon: LucideIcon; value: ReactNode; label: string; fill?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-3 transition-shadow duration-300 hover:shadow-sm">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon className={cn("size-4", fill && "fill-primary")} /></span>
      <p className="mt-2 truncate text-base font-bold leading-tight">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Kartu penjual. Di desktop tampil di kolom samping, di mobile tampil di aliran konten (duplikat tampilan saja, tanpa state). */
function SellerCard({ owner, stats, portfolio, className, style }: { owner: Owner; stats: SellerStats | undefined; portfolio: PortfolioItem[]; className?: string; style?: React.CSSProperties }) {
  return (
    <div style={style} className={cn("space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
      <Link to="/$username" params={{ username: owner.username }} className="flex items-center gap-3 hover:text-primary">
        <AvatarMini name={owner.username} url={owner.avatar_url} size={52} />
        <span className="min-w-0">
          <b className="flex items-center gap-1"><span className="truncate">{owner.display_name || owner.username}</span><VerifiedBadge username={owner.username} verified={!!owner.is_verified} size={14} /></b>
          <span className="block truncate text-xs text-muted-foreground">{owner.headline || `@${owner.username}`}</span>
        </span>
      </Link>
      {stats && (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted px-2 py-2"><dt className="text-[11px] text-muted-foreground">Jasa aktif</dt><dd className="font-bold">{stats.services}</dd></div>
          <div className="rounded-xl bg-muted px-2 py-2"><dt className="text-[11px] text-muted-foreground">Selesai</dt><dd className="font-bold">{stats.completed}</dd></div>
          <div className="rounded-xl bg-muted px-2 py-2"><dt className="text-[11px] text-muted-foreground">Rating</dt><dd className="flex items-center justify-center gap-0.5 font-bold">{stats.reviews > 0 ? <><Star className="size-3 fill-primary text-primary" />{stats.rating.toFixed(1)}</> : "—"}</dd></div>
        </dl>
      )}
      {portfolio.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold">Portofolio</p>
          <div className="grid grid-cols-3 gap-1.5">
            {portfolio.map((p) => (
              <Link key={p.id} to="/$username" params={{ username: owner.username }} search={{ tab: "portofolio" }} title={p.title} className="aspect-video overflow-hidden rounded-lg border border-border bg-muted transition hover:border-primary">
                {p.image_url ? <img src={p.image_url} alt={p.title} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">{p.title}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/$username" params={{ username: owner.username }} search={{ tab: "jasa" }}>Semua jasa</Link></Button>
        <Button asChild size="sm" variant="secondary" className="rounded-full"><Link to="/$username" params={{ username: owner.username }}>Lihat profil</Link></Button>
      </div>
    </div>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function JasaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { flags } = useSiteConfig();
  const isDesktop = useIsDesktop();
  const [asking, setAsking] = useState(false);
  const [pkgId, setPkgId] = useState<string | null>(null);
  // Hanya dipakai di mobile: form pesan dibuka dari bar lengket di bawah.
  const [orderOpen, setOrderOpen] = useState(false);
  useEffect(() => {
    if (isDesktop) setOrderOpen(false);
  }, [isDesktop]);
  const { data: s, isLoading } = useQuery({
    queryKey: ["service", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*, owner:profiles!services_owner_id_fkey(username,display_name,avatar_url,headline,skills)").eq("id", id).maybeSingle();
      return data as (typeof data & { owner: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] } | null }) | null;
    },
  });
  const extra = useQuery({
    queryKey: ["service-extra", id],
    queryFn: async () => {
      const [packages, addons, faqs, gallery, reviews] = await Promise.all([
        rows<Pkg>(looseDb.from("service_packages").select("id,tier,name,description,price,delivery_days,revisions,features,work_limit").eq("service_id", id).eq("is_active", true).order("price")),
        rows<Addon>(looseDb.from("service_addons").select("id,name,description,price,extra_days,extra_revisions").eq("service_id", id).eq("is_active", true).order("price")),
        rows<Faq>(looseDb.from("service_faqs").select("id,question,answer").eq("service_id", id).order("position")),
        rows<{ id: string; url: string | null }>(looseDb.from("service_gallery").select("id,url").eq("service_id", id).order("position")),
        rows<Review>(looseDb.from("service_reviews").select("id,rating,comment,seller_reply,created_at,buyer:profiles!service_reviews_buyer_id_fkey(username,display_name,avatar_url)").eq("service_id", id).eq("is_visible", true).order("created_at", { ascending: false }).limit(10)),
      ]);
      return { packages, addons, faqs, gallery: gallery.filter((g) => g.url).map((g) => g.url as string), reviews };
    },
  });
  // Ulasan lengkap: daftar bisa dimuat bertahap, dan sebaran bintang dihitung dari semua ulasan yang tampil.
  const [reviewLimit, setReviewLimit] = useState(10);
  const revQ = useQuery({
    queryKey: ["service-reviews", id, reviewLimit],
    queryFn: async () => {
      const [list, ratings] = await Promise.all([
        rows<Review>(looseDb.from("service_reviews").select("id,rating,comment,seller_reply,created_at,buyer:profiles!service_reviews_buyer_id_fkey(username,display_name,avatar_url)").eq("service_id", id).eq("is_visible", true).order("created_at", { ascending: false }).limit(reviewLimit)),
        rows<{ rating: number }>(looseDb.from("service_reviews").select("rating").eq("service_id", id).eq("is_visible", true).limit(2000)),
      ]);
      const dist = [0, 0, 0, 0, 0];
      for (const r of ratings) if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++;
      return { list, dist, total: ratings.length };
    },
    placeholderData: (prev) => prev,
  });
  const ownerId = s?.owner_id;
  const seller = useQuery({
    queryKey: ["service-seller-info", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const [list, portfolio] = await Promise.all([
        rows<{ orders_completed: number | null; rating_avg: number | null; rating_count: number | null }>(looseDb.from("services").select("orders_completed,rating_avg,rating_count").eq("owner_id", ownerId!).eq("is_active", true)),
        rows<PortfolioItem>(looseDb.from("portfolio_items").select("id,title,image_url").eq("owner_id", ownerId!).order("position").order("created_at", { ascending: false }).limit(3)),
      ]);
      const reviews = list.reduce((n, r) => n + (r.rating_count ?? 0), 0);
      const weighted = list.reduce((n, r) => n + (r.rating_avg ?? 0) * (r.rating_count ?? 0), 0);
      return { services: list.length, completed: list.reduce((n, r) => n + (r.orders_completed ?? 0), 0), reviews, rating: reviews ? weighted / reviews : 0, portfolio };
    },
  });
  const isOwnerEarly = !!user && !!s && user.id === s.owner_id;
  const fav = useQuery({
    queryKey: ["service-fav", id, user?.id],
    enabled: !!user && !!s && !isOwnerEarly,
    queryFn: async () => {
      const { data } = await looseDb.from("service_favorites").select("service_id").eq("service_id", id).eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
  });

  if (isLoading) return <GobiLoader page />;
  if (!s) return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Wrench className="size-7" /></span>
        <h1 className="mt-4 text-xl font-bold">Jasa tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Jasa ini mungkin sudah dihapus, disembunyikan, atau tautannya salah.</p>
        <Button asChild className="mt-5 rounded-full"><Link to="/jasa">Lihat semua jasa</Link></Button>
      </div>
    </main>
  );
  const x = s as typeof s & Extra;
  const isOwner = user?.id === s.owner_id;
  const chatOn = isFeatureOn(flags, "discuss");
  const packages = extra.data?.packages ?? [];
  const addons = extra.data?.addons ?? [];
  const faqs = extra.data?.faqs ?? [];
  const reviews = revQ.data?.list ?? extra.data?.reviews ?? [];
  const dist = revQ.data?.dist ?? [0, 0, 0, 0, 0];
  const reviewTotal = revQ.data?.total ?? 0;
  const images = [...(s.cover_url ? [s.cover_url] : []), ...(extra.data?.gallery ?? [])];
  // Selalu ada paket aktif bila jasa punya paket: tab pertama (termurah) terpilih dari awal, jadi harga di bar dan panel pesan langsung terisi.
  const selectedId = pkgId && packages.some((p) => p.id === pkgId) ? pkgId : (packages[0]?.id ?? null);
  const pkg = packages.find((p) => p.id === selectedId) ?? null;
  const fromPrice = packages.length ? Math.min(...packages.map((p) => p.price)) : s.price_from;
  const ratingCount = x.rating_count ?? 0;
  const ratingAvg = Number(x.rating_avg ?? 0);
  const skills = x.skills ?? [];
  const hasTerms = !!(x.buyer_requirements || x.revision_terms || x.scope_limits);
  const hiddenNotice = isOwner && x.status && x.status !== "published";
  const favReady = !user || fav.data !== undefined;
  const priceLabel = pkg ? `Paket ${TIER_LABEL[pkg.tier] ?? pkg.tier}` : "Mulai dari";
  const priceText = formatRupiah(pkg ? pkg.price : fromPrice, "Nego");

  function orderPackage(p: Pkg) {
    setPkgId(p.id);
    // Desktop: panel pesan ada di samping, cukup gulir ke sana. Mobile: buka form pesan sebagai bottom sheet.
    if (isDesktop) scrollToId("order-panel");
    else setOrderOpen(true);
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

  async function share() {
    const url = serviceShareUrl(window.location.origin, s!.id);
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title: s!.title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Tautan jasa disalin");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      toast.error("Tidak bisa membagikan tautan");
    }
  }

  // Isi pesan: satu instance saja. Di desktop dirender di panel samping, di mobile di dalam bottom sheet (tidak pernah dua-duanya, supaya isian form tidak ganda).
  const orderBody = (
    <div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{priceLabel}</p>
        <p key={priceText} className="mt-0.5 animate-in fade-in-0 slide-in-from-bottom-1 text-3xl font-bold text-primary duration-300 motion-reduce:animate-none">{priceText}</p>
        {pkg && <p className="mt-1 text-xs text-muted-foreground">{pkg.name} · {pkg.delivery_days} hari · {pkg.revisions} revisi</p>}
      </div>
      <div className="mt-4 border-t border-border pt-1">
        {isOwner ? (
          <Button asChild variant="secondary" className="mt-4 w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
        ) : !user ? (
          <div className="mt-4"><SignInCta text="Masuk untuk memesan jasa ini." /></div>
        ) : (
          <>
            <ServiceOrderPanel service={{ id: s.id, title: s.title }} packages={packages} addons={addons} selectedPkgId={selectedId} onSelectPackage={setPkgId} fromPrice={fromPrice} />
            {chatOn && s.owner && (
              <Button type="button" variant="outline" className="mt-3 w-full rounded-full" disabled={asking} onClick={askDeveloper}><MessageCircle /> {asking ? "Membuka chat…" : "Tanya developer dulu"}</Button>
            )}
          </>
        )}
      </div>
      {!isOwner && (
        <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> Dana aman di escrow sampai kamu menerima hasil</li>
          <li className="flex items-start gap-2"><RefreshCw className="mt-0.5 size-4 shrink-0 text-success" /> Revisi sesuai jatah paket</li>
          <li className="flex items-start gap-2"><MessageCircle className="mt-0.5 size-4 shrink-0 text-success" /> Chat langsung dengan developer selama pengerjaan</li>
        </ul>
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl pb-0 lg:px-4 lg:py-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
        <div className="min-w-0">
          {/* 1. Gambar paling atas, dengan tombol kembali, favorit, dan bagikan di atasnya (gaya aplikasi). */}
          <Gallery
            images={images}
            title={s.title}
            controls={
              <>
                <Link to="/jasa" aria-label="Kembali ke daftar jasa" className={cn(FLOAT_BTN, "absolute left-3 top-3")}><ChevronLeft className="size-5" /></Link>
                <div className="absolute right-3 top-3 flex gap-2">
                  {!isOwner && favReady && <FavoriteButton key={`${id}-${fav.data}`} serviceId={s.id} ownerId={s.owner_id} initial={fav.data ?? false} className="size-9 justify-center p-0 active:scale-95" />}
                  <button type="button" onClick={share} aria-label="Bagikan jasa" className={FLOAT_BTN}><Share2 className="size-4" /></button>
                </div>
              </>
            }
          />

          {/* 2. Judul, ringkasan, dan angka penting tepat di bawah gambar. Di mobile kartu ini menimpa tepi bawah gambar. */}
          <div className="relative -mt-6 rounded-t-3xl bg-background px-4 pb-1 pt-5 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-6">
            {hiddenNotice && <p role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/15 p-3 text-sm">Jasa ini belum tampil di marketplace (status: {x.status}). Hanya kamu yang bisa melihat halaman ini.</p>}
            <div className={RISE}>
              <span className="inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-orange-ink">{categoryLabel(s.category)}</span>
              <h1 className="mt-2 text-balance text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">{s.title}</h1>
              {s.owner && (
                <Link to="/$username" params={{ username: s.owner.username }} className="mt-2 inline-flex max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  <AvatarMini name={s.owner.username} url={s.owner.avatar_url} size={22} />
                  <span className="min-w-0 truncate">Oleh <b className="text-foreground">{s.owner.display_name || s.owner.username}</b></span>
                  <VerifiedBadge username={s.owner.username} verified={!!(s.owner as { is_verified?: boolean }).is_verified} size={14} />
                </Link>
              )}
              {s.summary && <p className="mt-3 text-sm text-muted-foreground sm:text-base">{s.summary}</p>}
            </div>
            <div className={cn("mt-4 grid grid-cols-3 gap-2 sm:gap-3", RISE)} style={delay(1)}>
              <StatTile Icon={Star} fill={ratingCount > 0} value={ratingCount > 0 ? ratingAvg.toFixed(1) : "Baru"} label={ratingCount > 0 ? `${ratingCount} ulasan` : "Belum ada ulasan"} />
              <StatTile Icon={CheckCircle2} value={x.orders_completed ?? 0} label="Pesanan selesai" />
              <StatTile Icon={Clock} value={`${pkg?.delivery_days ?? s.delivery_days} hari`} label={pkg ? "Estimasi paket" : "Estimasi"} />
            </div>
          </div>

          <div className="space-y-3 px-4 pt-4 sm:space-y-4 lg:px-0">
            {/* 3. Menu paket: tab dengan pil yang bergeser. */}
            {packages.length > 0 && (
              <section id="paket" aria-label="Pilih paket" className={cn("scroll-mt-20", RISE)} style={delay(2)}>
                <h2 className="mb-3 flex items-center gap-2.5 text-base font-bold">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Package className="size-4" /></span>
                  Pilih paket
                </h2>
                <PackageTabs packages={packages} activeId={selectedId!} onChange={setPkgId} onOrder={isOwner ? null : orderPackage} />
              </section>
            )}

            {/* 4. Tentang jasa ini: tampil sebagian, bisa dibuka lengkap dan disembunyikan lagi. */}
            <section id="deskripsi" className={cn("scroll-mt-20 rounded-2xl border border-border bg-card p-4 sm:p-5", RISE)} style={delay(3)}>
              <h2 className="mb-3 flex items-center gap-2.5 text-base font-bold">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><FileText className="size-4" /></span>
                Tentang jasa ini
              </h2>
              <Expandable>
                {s.description ? <Markdown>{s.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
                {skills.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Keahlian</p>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Keahlian">
                      {skills.map((k) => <li key={k} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{k}</li>)}
                    </ul>
                  </div>
                )}
              </Expandable>
            </section>

            {/* Mobile: kenali penjual setelah deskripsi. Desktop memakai kartu di kolom samping. */}
            {s.owner && <SellerCard owner={s.owner as Owner} stats={seller.data} portfolio={seller.data?.portfolio ?? []} className={cn("lg:hidden", RISE)} style={delay(4)} />}

            {hasTerms && (
              <Disclosure id="ketentuan" title="Ketentuan pesanan" Icon={ClipboardList} className={RISE} style={delay(5)}>
                <div className="space-y-2">
                  {x.buyer_requirements && <Row title="Yang perlu kamu siapkan" Icon={ClipboardList} defaultOpen><p className="whitespace-pre-wrap break-words">{x.buyer_requirements}</p></Row>}
                  {x.revision_terms && <Row title="Ketentuan revisi" Icon={RefreshCw} defaultOpen><p className="whitespace-pre-wrap break-words">{x.revision_terms}</p></Row>}
                  {x.scope_limits && <Row title="Batas ruang lingkup" Icon={Ruler} defaultOpen><p className="whitespace-pre-wrap break-words">{x.scope_limits}</p></Row>}
                </div>
              </Disclosure>
            )}

            {addons.length > 0 && (
              <Disclosure id="addon" title="Add-on" Icon={PlusCircle} badge={addons.length} className={RISE} style={delay(6)}>
                <ul className="divide-y divide-border text-sm">
                  {addons.map((a) => (
                    <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <span className="min-w-0"><b>{a.name}</b>{a.description && <span className="block text-muted-foreground">{a.description}</span>}</span>
                      <span className="shrink-0 text-muted-foreground"><b className="text-base text-primary">{formatRupiah(a.price, "—")}</b>{a.extra_days > 0 && ` · +${a.extra_days} hari`}{a.extra_revisions > 0 && ` · +${a.extra_revisions} revisi`}</span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}

            {faqs.length > 0 && (
              <Disclosure id="faq" title="Pertanyaan umum" Icon={CircleHelp} badge={faqs.length} className={RISE} style={delay(7)}>
                <div className="space-y-2">
                  {faqs.map((q) => <Row key={q.id} title={q.question}><p className="whitespace-pre-wrap break-words">{q.answer}</p></Row>)}
                </div>
              </Disclosure>
            )}

            <Disclosure id="ulasan" title="Ulasan pembeli" Icon={Star} defaultOpen badge={ratingCount > 0 ? `${ratingAvg.toFixed(1)} · ${ratingCount}` : undefined} className={RISE} style={delay(8)}>
              {ratingCount > 0 && (
                <div className="mb-4 flex flex-col gap-4 rounded-xl bg-muted p-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4 sm:flex-col sm:gap-1 sm:px-3 sm:text-center">
                    <p className="text-4xl font-bold text-primary">{ratingAvg.toFixed(1)}</p>
                    <div>
                      <Stars value={Math.round(ratingAvg)} />
                      <p className="mt-1 text-xs text-muted-foreground">dari {ratingCount} ulasan</p>
                    </div>
                  </div>
                  {reviewTotal > 0 && (
                    <ul className="min-w-0 flex-1 space-y-1.5" aria-label="Sebaran bintang">
                      {[5, 4, 3, 2, 1].map((n) => (
                        <li key={n} className="flex items-center gap-2 text-xs">
                          <span className="flex w-6 shrink-0 items-center gap-0.5 font-medium">{n}<Star className="size-3 fill-primary text-primary" /></span>
                          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-background">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${(dist[n - 1] / reviewTotal) * 100}%` }} />
                          </span>
                          <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{dist[n - 1]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {reviews.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada ulasan. Ulasan hanya datang dari pembeli yang pesanannya sudah selesai.</p> : (
                <ul className="divide-y divide-border">
                  {reviews.map((r) => (
                    <li key={r.id} className="py-4 text-sm first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <AvatarMini name={r.buyer?.username ?? "?"} url={r.buyer?.avatar_url ?? null} size={28} />
                        <b className="min-w-0 truncate">{r.buyer?.display_name || r.buyer?.username || "Pembeli"}</b>
                        <Stars value={r.rating} />
                        <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                      {r.comment && <p className="mt-2 whitespace-pre-wrap break-words">{r.comment}</p>}
                      {r.seller_reply && <p className="mt-2 rounded-lg border-l-2 border-primary bg-muted p-3 text-muted-foreground"><b className="text-foreground">Balasan penjual:</b> {r.seller_reply}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {reviewTotal > reviews.length && (
                <Button variant="outline" className="mt-4 h-11 w-full rounded-full" disabled={revQ.isFetching} onClick={() => setReviewLimit((n) => n + 10)}>
                  {revQ.isFetching ? "Memuat…" : `Muat ulasan lainnya (${reviewTotal - reviews.length})`}
                </Button>
              )}
            </Disclosure>

            <Disclosure id="cara-pesan" title="Cara pesan di GoBi" Icon={ListOrdered} className={RISE} style={delay(9)}>
              <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
                {STEPS.map((st, i) => (
                  <li key={st.title} className="relative flex gap-3">
                    <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-4 ring-card">{i + 1}</span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-semibold">{st.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{st.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Disclosure>
          </div>
        </div>

        {/* Kolom samping hanya untuk desktop: panel pesan lengket + kartu penjual. Di mobile panel pesan ada di bottom sheet. */}
        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          {isDesktop && (
            <div id="order-panel" className={cn("scroll-mt-20 rounded-2xl border border-border bg-card p-5 shadow-glow", RISE)} style={delay(2)}>
              {orderBody}
            </div>
          )}
          {s.owner && <SellerCard owner={s.owner as Owner} stats={seller.data} portfolio={seller.data?.portfolio ?? []} className={RISE} style={delay(3)} />}
        </aside>
      </div>

      {/* Mobile: bar pesan lengket di dasar layar (sticky di dalam <main>, jadi ikut berakhir sebelum footer). Menu bawah global disembunyikan di halaman ini. */}
      <div className="sticky bottom-0 z-30 mt-6 animate-in fade-in-0 slide-in-from-bottom-4 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgb(10_26_69/0.35)] backdrop-blur duration-500 motion-reduce:animate-none lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-muted-foreground">{pkg ? `${priceLabel} · ${pkg.delivery_days} hari` : priceLabel}</p>
            <p key={priceText} className="animate-in fade-in-0 slide-in-from-bottom-1 truncate text-lg font-bold leading-tight text-primary duration-300 motion-reduce:animate-none">{priceText}</p>
          </div>
          {isOwner ? (
            <Button asChild className="h-11 shrink-0 rounded-full px-6"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
          ) : (
            <Button type="button" className="h-11 shrink-0 rounded-full px-7 active:scale-95" onClick={() => setOrderOpen(true)}><ShoppingBag /> Pesan</Button>
          )}
        </div>
      </div>

      {/* Mobile: form pesan sebagai bottom sheet. Hanya dirender saat layar kecil, jadi tidak ada dua form sekaligus. */}
      {!isDesktop && (
        <Sheet open={orderOpen} onOpenChange={setOrderOpen}>
          <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
            <span aria-hidden className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            <SheetHeader className="pr-8 text-left">
              <SheetTitle>Pesan jasa ini</SheetTitle>
              <SheetDescription className="sr-only">Pilih paket, isi kebutuhan, lalu buat pesanan.</SheetDescription>
            </SheetHeader>
            <div className="mt-4">{orderBody}</div>
          </SheetContent>
        </Sheet>
      )}
    </main>
  );
}
