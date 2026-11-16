import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, MessageCircle, Pencil, Share2, Star, Wrench } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { FavoriteButton } from "@/components/service-explore-card";
import { ServiceOrderPanel } from "@/components/service-order-panel";
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

// Kolom dan tabel GOBI SERVICES belum ada di tipe Supabase hasil generate, jadi dibaca lewat looseDb dan toleran bila SQL belum diterapkan.
type Extra = { buyer_requirements?: string; revision_terms?: string; scope_limits?: string; skills?: string[]; rating_avg?: number; rating_count?: number; orders_completed?: number; status?: string };
type Pkg = { id: string; tier: string; name: string; description: string; price: number; delivery_days: number; revisions: number; features: string[]; work_limit: string };
type Addon = { id: string; name: string; description: string; price: number; extra_days: number; extra_revisions: number };
type Faq = { id: string; question: string; answer: string };
type Review = { id: string; rating: number; comment: string; seller_reply: string | null; created_at: string; buyer: { username: string; display_name: string | null; avatar_url: string | null } | null };
type PortfolioItem = { id: string; title: string; image_url: string | null };

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-3.5", i <= value ? "fill-primary text-primary" : "text-muted-foreground/40")} />)}
    </span>
  );
}

function JasaDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { flags } = useSiteConfig();
  const [asking, setAsking] = useState(false);
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [img, setImg] = useState(0);
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

  if (isLoading) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!s) return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <p>Jasa tidak ditemukan.</p>
      <Button asChild variant="secondary" className="mt-4"><Link to="/jasa">Lihat semua jasa</Link></Button>
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
  const pkg = packages.find((p) => p.id === pkgId) ?? null;
  const fromPrice = packages.length ? Math.min(...packages.map((p) => p.price)) : s.price_from;
  const ratingCount = x.rating_count ?? 0;
  const skills = x.skills ?? [];
  const hiddenNotice = isOwner && x.status && x.status !== "published";

  function choosePackage(p: Pkg) {
    setPkgId(p.id);
    document.getElementById("order-panel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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

  return (
    <main className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-8">
      <section className="min-w-0 lg:col-start-1 lg:row-start-1">
        {hiddenNotice && <p className="mb-3 rounded-lg border border-border bg-muted p-3 text-sm">Jasa ini belum tampil di marketplace (status: {x.status}). Hanya kamu yang bisa melihat halaman ini.</p>}
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-hero">
          {images[img] ? <img src={images[img]} alt={s.title} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Wrench className="size-16 text-primary/70" /></div>}
        </div>
        {images.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {images.map((u, i) => (
              <button key={u} type="button" onClick={() => setImg(i)} aria-label={`Gambar ${i + 1}`} aria-current={i === img}
                className={cn("aspect-video w-24 shrink-0 overflow-hidden rounded-md border bg-muted", i === img ? "border-primary" : "border-border")}>
                <img src={u} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary">{categoryLabel(s.category)}</span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"><Clock className="size-3.5" /> Estimasi {pkg?.delivery_days ?? s.delivery_days} hari</span>
          {ratingCount > 0 && <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"><Star className="size-3.5 fill-primary text-primary" /> {Number(x.rating_avg ?? 0).toFixed(1)} ({ratingCount} ulasan)</span>}
          {(x.orders_completed ?? 0) > 0 && <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground"><CheckCircle2 className="size-3.5" /> {x.orders_completed} pesanan selesai</span>}
        </div>
        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{s.title}</h1>
        {s.summary && <p className="mt-2 text-base text-muted-foreground sm:text-lg">{s.summary}</p>}
        {skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{skills.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {!isOwner && fav.data !== undefined && <FavoriteButton key={`${id}-${fav.data}`} serviceId={s.id} ownerId={s.owner_id} initial={fav.data} label className="h-9" />}
          {!isOwner && !user && <FavoriteButton serviceId={s.id} ownerId={s.owner_id} initial={false} label className="h-9" />}
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-full" onClick={share}><Share2 /> Bagikan</Button>
        </div>
      </section>

      {/* Di layar kecil kartu pesan tampil tepat di bawah judul, bukan di dasar halaman. */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div id="order-panel" className="scroll-mt-20 rounded-xl border border-border bg-card p-5 shadow-glow">
          <p className="text-sm text-muted-foreground">{pkg ? `Paket ${TIER_LABEL[pkg.tier] ?? pkg.tier}` : "Mulai dari"}</p>
          <p className="text-3xl font-bold text-primary">{formatRupiah(pkg ? pkg.price : fromPrice, "Nego")}</p>
          {isOwner ? (
            <Button asChild variant="secondary" className="mt-4 w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}><Pencil /> Edit jasa</Link></Button>
          ) : !user ? (
            <div className="mt-4"><SignInCta text="Masuk untuk memesan jasa ini." /></div>
          ) : (
            <>
              <ServiceOrderPanel service={{ id: s.id, title: s.title }} packages={packages} addons={addons} selectedPkgId={pkgId} onSelectPackage={setPkgId} fromPrice={fromPrice} />
              {chatOn && s.owner && (
                <Button type="button" variant="outline" className="mt-3 w-full" disabled={asking} onClick={askDeveloper}><MessageCircle /> {asking ? "Membuka chat…" : "Tanya developer dulu"}</Button>
              )}
            </>
          )}
        </div>
        {s.owner && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Link to="/$username" params={{ username: s.owner.username }} className="flex items-center gap-3 hover:text-primary">
              <AvatarMini name={s.owner.username} url={s.owner.avatar_url} size={44} />
              <span className="min-w-0">
                <b className="flex items-center gap-1"><span className="truncate">{s.owner.display_name || s.owner.username}</span><VerifiedBadge username={s.owner.username} verified={!!(s.owner as { is_verified?: boolean }).is_verified} size={14} /></b>
                <span className="block truncate text-xs text-muted-foreground">{s.owner.headline || `@${s.owner.username}`}</span>
              </span>
            </Link>
            {seller.data && (
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{seller.data.services} jasa aktif</span>
                {seller.data.completed > 0 && <span>{seller.data.completed} pesanan selesai</span>}
                {seller.data.reviews > 0 && <span className="inline-flex items-center gap-0.5"><Star className="size-3 fill-primary text-primary" />{seller.data.rating.toFixed(1)} ({seller.data.reviews})</span>}
              </p>
            )}
            {(seller.data?.portfolio.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium">Portofolio</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {seller.data!.portfolio.map((p) => (
                    <Link key={p.id} to="/$username" params={{ username: s.owner!.username }} search={{ tab: "portofolio" }} title={p.title} className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
                      {p.image_url ? <img src={p.image_url} alt={p.title} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">{p.title}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/$username" params={{ username: s.owner.username }} search={{ tab: "jasa" }}>Semua jasa</Link></Button>
              <Button asChild size="sm" variant="ghost"><Link to="/$username" params={{ username: s.owner.username }}>Profil</Link></Button>
            </div>
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
        {packages.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Pilih paket</h2>
            <div className={cn("grid gap-3", packages.length === 3 && "sm:grid-cols-3")}>
              {packages.map((p) => (
                <div key={p.id} className={cn("flex flex-col rounded-lg border bg-card p-4 text-sm", pkgId === p.id ? "border-primary ring-1 ring-primary" : "border-border")}>
                  <p className="text-xs font-medium uppercase text-muted-foreground">{TIER_LABEL[p.tier] ?? p.tier}</p>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xl font-bold text-primary">{formatRupiah(p.price, "—")}</p>
                  <p className="text-xs text-muted-foreground">{p.delivery_days} hari · {p.revisions} revisi{p.work_limit ? ` · ${p.work_limit}` : ""}</p>
                  {p.description && <p className="mt-2">{p.description}</p>}
                  {(p.features ?? []).length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>}
                  {!isOwner && user && <Button type="button" size="sm" variant={pkgId === p.id ? "default" : "outline"} className="mt-auto" onClick={() => choosePackage(p)}>{pkgId === p.id ? "Terpilih" : "Pilih paket"}</Button>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-6">
          {s.description ? <Markdown>{s.description}</Markdown> : <p className="text-sm text-muted-foreground">Belum ada deskripsi.</p>}
        </div>

        {addons.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Add-on</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {addons.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0"><b>{a.name}</b>{a.description && <span className="text-muted-foreground"> — {a.description}</span>}</span>
                  <span className="shrink-0 text-muted-foreground"><b className="text-foreground">{formatRupiah(a.price, "—")}</b>{a.extra_days > 0 && ` · +${a.extra_days} hari`}{a.extra_revisions > 0 && ` · +${a.extra_revisions} revisi`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(x.buyer_requirements || x.revision_terms || x.scope_limits) && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-6 text-sm">
            {x.buyer_requirements && <div><h2 className="font-semibold">Yang perlu kamu siapkan</h2><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{x.buyer_requirements}</p></div>}
            {x.revision_terms && <div><h2 className="font-semibold">Ketentuan revisi</h2><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{x.revision_terms}</p></div>}
            {x.scope_limits && <div><h2 className="font-semibold">Batas ruang lingkup</h2><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{x.scope_limits}</p></div>}
          </div>
        )}

        {faqs.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Pertanyaan umum</h2>
            <div className="mt-3 divide-y divide-border">
              {faqs.map((q) => (
                <details key={q.id} className="group py-2">
                  <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">{q.question}</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{q.answer}</p>
                </details>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Ulasan{ratingCount > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{Number(x.rating_avg ?? 0).toFixed(1)} dari {ratingCount} ulasan</span>}</h2>
          {reviews.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Belum ada ulasan. Ulasan hanya datang dari pembeli yang pesanannya sudah selesai.</p> : (
            <ul className="mt-3 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <AvatarMini name={r.buyer?.username ?? "?"} url={r.buyer?.avatar_url ?? null} size={24} />
                    <b className="truncate">{r.buyer?.display_name || r.buyer?.username || "Pembeli"}</b>
                    <Stars value={r.rating} />
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  {r.comment && <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>}
                  {r.seller_reply && <p className="mt-1.5 rounded-md bg-muted p-2 text-muted-foreground"><b className="text-foreground">Balasan penjual:</b> {r.seller_reply}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Cara pesan di GoBi</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((st, i) => (
              <li key={st.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{st.title}</p>
                  <p className="text-sm text-muted-foreground">{st.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
