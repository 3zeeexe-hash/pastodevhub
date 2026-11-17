import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-3.5", i <= value ? "fill-primary text-primary" : "text-muted-foreground/40")} />)}
    </span>
  );
}

/** Bagian halaman berbentuk kartu. `id` dipakai bilah navigasi bagian di atas konten. */
function Section({ id, title, Icon, children }: { id: string; title: string; Icon: LucideIcon; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-base font-bold sm:text-lg">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon className="size-4" /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function HeroStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
      <p className="flex items-center gap-1 truncate text-base font-bold sm:text-lg">{value}</p>
      <p className="truncate text-[11px] text-white/60">{label}</p>
    </div>
  );
}

/** Kartu penjual. Di desktop tampil di kolom samping, di mobile tampil di aliran konten (duplikat tampilan saja, tanpa state). */
function SellerCard({ owner, stats, portfolio, className }: { owner: Owner; stats: SellerStats | undefined; portfolio: PortfolioItem[]; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5", className)}>
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

/** Menandai bagian yang sedang terlihat di layar untuk bilah navigasi bagian. Hanya jalan di browser. */
function useActiveSection(ids: string[], ready: boolean) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    const els = key.split("|").map((i) => document.getElementById(i)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-112px 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key, ready]);
  return active;
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
  const [img, setImg] = useState(0);
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

  // Bilah navigasi bagian hanya memuat bagian yang benar-benar ada isinya. Hook ini harus dipanggil sebelum return dini di bawah.
  const terms = s as (typeof s & Extra) | null | undefined;
  const hasTerms = !!(terms?.buyer_requirements || terms?.revision_terms || terms?.scope_limits);
  const navSections = [
    ...(extra.data?.packages.length ? [{ id: "paket", label: "Paket" }] : []),
    { id: "deskripsi", label: "Deskripsi" },
    ...(extra.data?.addons.length ? [{ id: "addon", label: "Add-on" }] : []),
    ...(hasTerms ? [{ id: "ketentuan", label: "Ketentuan" }] : []),
    ...(extra.data?.faqs.length ? [{ id: "faq", label: "FAQ" }] : []),
    { id: "ulasan", label: "Ulasan" },
    { id: "cara-pesan", label: "Cara pesan" },
  ];
  const activeSection = useActiveSection(navSections.map((n) => n.id), !!s && !extra.isLoading);

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
  const reviews = extra.data?.reviews ?? [];
  const images = [...(s.cover_url ? [s.cover_url] : []), ...(extra.data?.gallery ?? [])];
  const cur = images[img] ? img : 0;
  const goImg = (d: number) => setImg((cur + d + images.length) % images.length);
  const pkg = packages.find((p) => p.id === pkgId) ?? null;
  const fromPrice = packages.length ? Math.min(...packages.map((p) => p.price)) : s.price_from;
  const ratingCount = x.rating_count ?? 0;
  const ratingAvg = Number(x.rating_avg ?? 0);
  const skills = x.skills ?? [];
  const hiddenNotice = isOwner && x.status && x.status !== "published";
  const favReady = !user || fav.data !== undefined;
  const priceLabel = pkg ? `Paket ${TIER_LABEL[pkg.tier] ?? pkg.tier}` : "Mulai dari";
  const priceText = formatRupiah(pkg ? pkg.price : fromPrice, "Nego");

  function choosePackage(p: Pkg) {
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
        <p className="mt-0.5 text-3xl font-bold text-primary">{priceText}</p>
        {pkg && <p className="mt-1 text-xs text-muted-foreground">{pkg.name} · {pkg.delivery_days} hari · {pkg.revisions} revisi</p>}
      </div>
      <div className="mt-4 border-t border-border pt-1">
        {isOwner ? (
          <Button asChild variant="secondary" className="mt-4 w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
        ) : !user ? (
          <div className="mt-4"><SignInCta text="Masuk untuk memesan jasa ini." /></div>
        ) : (
          <>
            <ServiceOrderPanel service={{ id: s.id, title: s.title }} packages={packages} addons={addons} selectedPkgId={pkgId} onSelectPackage={setPkgId} fromPrice={fromPrice} />
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
    <main className="mx-auto max-w-6xl px-4 py-4 sm:py-6 lg:py-8">
      {hiddenNotice && <p role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/15 p-3 text-sm">Jasa ini belum tampil di marketplace (status: {x.status}). Hanya kamu yang bisa melihat halaman ini.</p>}

      {/* Kepala: kartu biru tua bergaya GOBI dengan judul, ringkasan, angka penting, penjual, dan aksi. Keahlian dipindah ke bagian deskripsi supaya kepala tetap ringkas. */}
      <header className="relative overflow-hidden rounded-3xl bg-header-gradient p-5 pb-7 text-white shadow-lg ring-1 ring-white/10 sm:p-8 sm:pb-10">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-60 rounded-full bg-navy-soft/40 blur-3xl" />
        <div className="relative">
          <nav aria-label="Jejak halaman" className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-white/70">
            <Link to="/jasa" className="rounded px-0.5 hover:text-white">Jasa</Link>
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate font-semibold text-primary-glow">{categoryLabel(s.category)}</span>
          </nav>
          <h1 className="mt-3 max-w-3xl text-balance text-xl font-bold leading-tight sm:text-3xl lg:text-4xl">{s.title}</h1>
          {s.summary && <p className="mt-2 max-w-3xl text-sm text-white/75 sm:mt-3 sm:text-base">{s.summary}</p>}

          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
            <HeroStat
              value={ratingCount > 0 ? <><Star className="size-4 shrink-0 fill-primary text-primary" />{ratingAvg.toFixed(1)}</> : "Baru"}
              label={ratingCount > 0 ? `${ratingCount} ulasan` : "Belum ada ulasan"}
            />
            <HeroStat value={<><CheckCircle2 className="size-4 shrink-0 text-primary-glow" />{x.orders_completed ?? 0}</>} label="Pesanan selesai" />
            <HeroStat value={<><Clock className="size-4 shrink-0 text-primary-glow" />{pkg?.delivery_days ?? s.delivery_days} hari</>} label={pkg ? "Estimasi paket" : "Estimasi"} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {s.owner ? (
              <Link to="/$username" params={{ username: s.owner.username }} className="flex min-w-0 max-w-full items-center gap-2.5 rounded-full bg-white/10 py-1 pl-1 pr-4 ring-1 ring-white/10 transition hover:bg-white/15">
                <AvatarMini name={s.owner.username} url={s.owner.avatar_url} size={32} />
                <span className="min-w-0 text-sm">
                  <span className="block text-[11px] leading-none text-white/60">Oleh</span>
                  <b className="flex items-center gap-1"><span className="truncate">{s.owner.display_name || s.owner.username}</span><VerifiedBadge username={s.owner.username} verified={!!(s.owner as { is_verified?: boolean }).is_verified} size={14} /></b>
                </span>
              </Link>
            ) : <span />}
            <div className="flex flex-wrap gap-2">
              {!isOwner && favReady && <FavoriteButton key={`${id}-${fav.data}`} serviceId={s.id} ownerId={s.owner_id} initial={fav.data ?? false} label className="h-9" />}
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={share}><Share2 /> Bagikan</Button>
            </div>
          </div>
        </div>
        <div aria-hidden className="batik-line absolute inset-x-0 bottom-0" />
      </header>

      <div className="mt-5 grid gap-x-8 gap-y-5 sm:mt-6 sm:gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Galeri */}
        <section aria-label="Galeri jasa" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-hero">
            {images[cur] ? <img src={images[cur]} alt={s.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Wrench className="size-16 text-primary/70" /></div>}
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => goImg(-1)} aria-label="Gambar sebelumnya" className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-navy/70 text-white backdrop-blur transition hover:bg-navy"><ChevronLeft className="size-5" /></button>
                <button type="button" onClick={() => goImg(1)} aria-label="Gambar berikutnya" className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-navy/70 text-white backdrop-blur transition hover:bg-navy"><ChevronRight className="size-5" /></button>
                <span className="absolute bottom-2 right-2 rounded-full bg-navy/70 px-2.5 py-1 font-mono text-xs text-white backdrop-blur">{cur + 1}/{images.length}</span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {images.map((u, i) => (
                <button key={u} type="button" onClick={() => setImg(i)} aria-label={`Gambar ${i + 1}`} aria-current={i === cur}
                  className={cn("aspect-video w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition sm:w-24", i === cur ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}>
                  <img src={u} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Kolom samping hanya untuk desktop: panel pesan lengket + kartu penjual. Di mobile panel pesan ada di bottom sheet dan kartu penjual masuk ke aliran konten. */}
        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          {isDesktop && (
            <div id="order-panel" className="scroll-mt-20 rounded-2xl border border-border bg-card p-5 shadow-glow">
              {orderBody}
            </div>
          )}
          {s.owner && <SellerCard owner={s.owner as Owner} stats={seller.data} portfolio={seller.data?.portfolio ?? []} />}
        </aside>

        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-start-2">
          {/* Navigasi bagian: lengket di bawah header situs, bisa digeser ke samping di layar sempit. */}
          <nav aria-label="Bagian halaman" className="sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navSections.map((n) => (
              <button key={n.id} type="button" onClick={() => scrollToId(n.id)} aria-current={activeSection === n.id ? "true" : undefined}
                className={cn("shrink-0 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition", activeSection === n.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                {n.label}
              </button>
            ))}
          </nav>

          {packages.length > 0 && (
            <Section id="paket" title="Pilih paket" Icon={Package}>
              <ul className="space-y-3">
                {packages.map((p) => {
                  const on = pkgId === p.id;
                  return (
                    <li key={p.id} className={cn("rounded-2xl border p-4 transition sm:p-5", on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border hover:border-primary/50")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide", TIER_STYLE[p.tier] ?? "bg-secondary text-secondary-foreground")}>{TIER_LABEL[p.tier] ?? p.tier}</span>
                          <h3 className="mt-1.5 break-words font-semibold">{p.name}</h3>
                        </div>
                        <p className="shrink-0 text-xl font-bold text-primary sm:text-2xl">{formatRupiah(p.price, "—")}</p>
                      </div>
                      {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><Clock className="size-3.5" /> {p.delivery_days} hari</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><RefreshCw className="size-3.5" /> {p.revisions} revisi</span>
                        {p.work_limit && <span className="inline-flex min-w-0 items-start gap-1.5 rounded-2xl bg-muted px-2.5 py-1"><Ruler className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 break-words">{p.work_limit}</span></span>}
                      </div>
                      {(p.features ?? []).length > 0 && (
                        <ul className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm sm:grid-cols-2">
                          {p.features.map((f) => <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 break-words">{f}</span></li>)}
                        </ul>
                      )}
                      {!isOwner && (
                        <Button type="button" variant={on ? "default" : "outline"} className="mt-4 w-full rounded-full sm:w-auto" onClick={() => choosePackage(p)}>
                          {on ? <><Check /> Terpilih</> : "Pilih paket"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <Section id="deskripsi" title="Tentang jasa ini" Icon={FileText}>
            {s.description ? <Markdown>{s.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
            {skills.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Keahlian</p>
                <ul className="flex flex-wrap gap-1.5" aria-label="Keahlian">
                  {skills.map((k) => <li key={k} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{k}</li>)}
                </ul>
              </div>
            )}
          </Section>

          {/* Mobile: kenali penjual tepat setelah deskripsi. Desktop memakai kartu di kolom samping. */}
          {s.owner && <SellerCard owner={s.owner as Owner} stats={seller.data} portfolio={seller.data?.portfolio ?? []} className="lg:hidden" />}

          {addons.length > 0 && (
            <Section id="addon" title="Add-on" Icon={PlusCircle}>
              <ul className="divide-y divide-border text-sm">
                {addons.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="min-w-0"><b>{a.name}</b>{a.description && <span className="block text-muted-foreground">{a.description}</span>}</span>
                    <span className="shrink-0 text-muted-foreground"><b className="text-base text-primary">{formatRupiah(a.price, "—")}</b>{a.extra_days > 0 && ` · +${a.extra_days} hari`}{a.extra_revisions > 0 && ` · +${a.extra_revisions} revisi`}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {hasTerms && (
            <Section id="ketentuan" title="Ketentuan pesanan" Icon={ClipboardList}>
              <div className="grid gap-3 text-sm">
                {x.buyer_requirements && <div className="rounded-xl bg-muted p-4"><h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="size-4 text-primary" /> Yang perlu kamu siapkan</h3><p className="mt-1.5 whitespace-pre-wrap break-words text-muted-foreground">{x.buyer_requirements}</p></div>}
                {x.revision_terms && <div className="rounded-xl bg-muted p-4"><h3 className="flex items-center gap-2 font-semibold"><RefreshCw className="size-4 text-primary" /> Ketentuan revisi</h3><p className="mt-1.5 whitespace-pre-wrap break-words text-muted-foreground">{x.revision_terms}</p></div>}
                {x.scope_limits && <div className="rounded-xl bg-muted p-4"><h3 className="flex items-center gap-2 font-semibold"><Ruler className="size-4 text-primary" /> Batas ruang lingkup</h3><p className="mt-1.5 whitespace-pre-wrap break-words text-muted-foreground">{x.scope_limits}</p></div>}
              </div>
            </Section>
          )}

          {faqs.length > 0 && (
            <Section id="faq" title="Pertanyaan umum" Icon={CircleHelp}>
              <div className="divide-y divide-border">
                {faqs.map((q) => (
                  <details key={q.id} className="group py-3 first:pt-0 last:pb-0">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 break-words">{q.question}</span>
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{q.answer}</p>
                  </details>
                ))}
              </div>
            </Section>
          )}

          <Section id="ulasan" title="Ulasan pembeli" Icon={Star}>
            {ratingCount > 0 && (
              <div className="mb-4 flex items-center gap-4 rounded-xl bg-muted p-4">
                <p className="text-4xl font-bold text-primary">{ratingAvg.toFixed(1)}</p>
                <div>
                  <Stars value={Math.round(ratingAvg)} />
                  <p className="mt-1 text-xs text-muted-foreground">dari {ratingCount} ulasan</p>
                </div>
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
          </Section>

          <Section id="cara-pesan" title="Cara pesan di GoBi" Icon={ListOrdered}>
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
          </Section>
        </div>
      </div>

      {/* Mobile: bar pesan lengket di dasar layar (sticky di dalam <main>, jadi ikut berakhir sebelum footer). Menu bawah global disembunyikan di halaman ini. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgb(10_26_69/0.35)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-muted-foreground">{pkg ? `${priceLabel} · ${pkg.delivery_days} hari` : priceLabel}</p>
            <p className="truncate text-lg font-bold leading-tight text-primary">{priceText}</p>
          </div>
          {isOwner ? (
            <Button asChild className="h-11 shrink-0 rounded-full px-6"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
          ) : (
            <Button type="button" className="h-11 shrink-0 rounded-full px-7" onClick={() => setOrderOpen(true)}><ShoppingBag /> Pesan</Button>
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
