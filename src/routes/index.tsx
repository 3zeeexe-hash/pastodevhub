import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, BookMarked, Briefcase, Compass, MessageSquare, Package, Plus, Receipt, Search, Sparkles, UserPlus, Users, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { siteJsonLd } from "@/lib/seo";
import { useAuth, timeAgo } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { workspacePath } from "@/lib/roles";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { brandMarkUrl } from "@/components/brand";
import { JobCard } from "@/components/job-card";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { JOB_SELECT, type JobCardData } from "@/lib/jobs";
import { SEARCH_TYPES } from "@/lib/search-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const origin = (matches[0]?.loaderData as { siteUrl?: string | null } | undefined)?.siteUrl;
    return {
    scripts: origin ? [{ type: "application/ld+json", children: siteJsonLd(origin) }] : [],
    meta: [
      { title: "Pastodev — Tempat developer, freelancer, dan client bekerja bareng" },
      { name: "description", content: "Satu akun untuk semua: cari developer, ambil proyek freelance, jual karya, pesan jasa, dan simpan kode pribadi bersama komunitas Nusantara." },
      { property: "og:title", content: "Pastodev — Tempat developer, freelancer, dan client bekerja bareng" },
      { property: "og:description", content: "Pribadi, client, freelancer, atau developer: semua punya ruang kerja di satu akun." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    };
  },
  component: Index,
});

type SearchType = (typeof SEARCH_TYPES)[number][0];
type DevRow = { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[]; available_for_hire: boolean };
type PostRow = { id: string; title: string; created_at: string; author: { username: string; avatar_url: string | null } | null; comments: { count: number }[] };
type Goal = { to: string; label: string; hint: string; Icon: LucideIcon; feature?: FeatureKey; search?: Record<string, string> };
type ActivityTile = { key: string; to: string; label: string; Icon: LucideIcon; count: number | null | undefined };

// Ringkasan aktivitas menghitung langsung ke tabel; dibuat tanpa tipe supaya filter ke tabel terkait
// (job_applications → jobs) tidak tertahan oleh tipe hasil generate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Status pesanan yang masih berjalan (belum selesai, ditolak, atau dibatalkan). */
const ACTIVE_ORDER_STATUSES = ["requested", "awaiting_payment", "payment_review", "in_progress", "delivered"];

/** Pintasan berdasarkan kebutuhan, sama untuk semua orang. */
const GOALS: Goal[] = [
  { to: "/search", search: { q: "", type: "users" }, label: "Cari talenta", hint: "Lihat profil dan keahlian", Icon: Users },
  { to: "/lowongan/baru", label: "Pasang lowongan", hint: "Terima lamaran untuk proyekmu", Icon: Plus, feature: "jobs" },
  { to: "/lowongan", label: "Cari proyek", hint: "Lowongan freelance yang dibuka", Icon: Briefcase, feature: "jobs" },
  { to: "/jasa", label: "Pesan jasa", hint: "Pilih layanan, langsung pesan", Icon: Wrench, feature: "jasa" },
  { to: "/katalog", label: "Beli atau jual karya", hint: "Template dan proyek siap pakai", Icon: Package, feature: "karya" },
  { to: "/new", label: "Simpan kode dan file", hint: "Repositori, hosting, berbagi file", Icon: BookMarked, feature: "repos" },
  { to: "/discuss", label: "Ngobrol di komunitas", hint: "Tanya, berbagi ilmu, cari teman", Icon: MessageSquare, feature: "discuss" },
  { to: "/explore", label: "Jelajahi proyek", hint: "Lihat apa yang dibuat orang lain", Icon: Compass },
];

const STEPS = [
  { title: "Buat akun gratis", text: "Cukup satu akun untuk mencari, menawarkan, dan menyimpan." },
  { title: "Pilih yang kamu butuhkan", text: "Cari talenta, pasang lowongan, buka jasa, atau jual karya." },
  { title: "Bekerja dan bertransaksi", text: "Chat, kirim hasil, dan pantau pesanan di satu tempat." },
];

function Index() {
  const { user, profile } = useAuth();
  const { flags } = useSiteConfig();
  const on = (key: FeatureKey) => isFeatureOn(flags, key);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<SearchType>("users");
  const signedIn = !!user && !!profile;

  const jobs = useQuery({
    queryKey: ["home", "jobs"],
    enabled: on("jobs"),
    queryFn: async () => ((await supabase.from("jobs").select(JOB_SELECT).eq("status", "open").order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as JobCardData[],
  });
  const devs = useQuery({
    queryKey: ["home", "devs"],
    queryFn: async () =>
      ((await supabase.from("profiles").select("username,display_name,avatar_url,headline,skills,available_for_hire").eq("account_type", "developer")
        .order("available_for_hire", { ascending: false }).order("created_at", { ascending: false }).limit(8)).data ?? []) as DevRow[],
  });
  const karya = useQuery({
    queryKey: ["home", "karya"],
    enabled: on("karya"),
    queryFn: async () => ((await supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as ProductCardData[],
  });
  const posts = useQuery({
    queryKey: ["home", "posts"],
    enabled: on("discuss"),
    queryFn: async () => ((await supabase.from("posts").select("id,title,created_at, author:profiles(username,avatar_url), comments(count)").order("created_at", { ascending: false }).limit(6)).data ?? []) as unknown as PostRow[],
  });

  function search(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: "/search", search: { q: q.trim(), type } });
  }

  const goals = GOALS.filter((g) => !g.feature || on(g.feature));

  return (
    // Beranda memakai tema terang sendiri (lihat .theme-terang di styles.css); halaman lain tidak berubah.
    <main className="theme-terang">
      <section className="bg-hero relative overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:py-16 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <Sparkles className="size-4" />Satu akun untuk semua kebutuhan
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Cari talenta, ambil proyek, dan pamerkan karya <span className="text-primary">di satu tempat</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
              Cocok untuk siapa saja: yang butuh jasa, yang menawarkan keahlian, atau yang ingin menyimpan dan membagikan karyanya.
            </p>

            <SearchBox q={q} setQ={setQ} type={type} setType={setType} onSubmit={search} />

            {!user && (
              <div className="mt-6 flex flex-wrap gap-3">
                {on("signup") && <Button asChild size="lg"><Link to="/auth">Buat akun gratis</Link></Button>}
                <Button asChild size="lg" variant="outline"><Link to="/explore">Jelajahi proyek</Link></Button>
              </div>
            )}
          </div>
          <img src={brandMarkUrl} alt="Maskot Pastodev berblangkon" className="mx-auto hidden size-56 rounded-full bg-card p-2 ring-4 ring-primary/20 lg:block" />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        {signedIn && <MyActivity userId={user.id} accountType={profile.account_type} on={on} />}

        <section aria-labelledby="goals">
          <h2 id="goals" className="text-2xl font-bold">Apa yang ingin kamu lakukan?</h2>
          <p className="mt-1 text-muted-foreground">Pilih sesuai kebutuhanmu, semuanya ada di sini.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {goals.map((g) => <li key={g.to + g.label}><GoalCard g={g} /></li>)}
          </ul>
        </section>

        {on("jobs") && (
          <HomeSection icon={Briefcase} title="Proyek dan lowongan terbaru" more={<Link to="/lowongan">Semua lowongan</Link>}>
            <Grid loading={jobs.isLoading} empty={jobs.data?.length === 0} emptyText="Belum ada lowongan dibuka." className="md:grid-cols-2">
              {jobs.data?.map((j) => <JobCard key={j.id} j={j} />)}
            </Grid>
          </HomeSection>
        )}

        <HomeSection icon={Users} title="Talenta pilihan" more={<Link to="/search" search={{ q: "", type: "users" }}>Semua talenta</Link>}>
          <Grid loading={devs.isLoading} empty={devs.data?.length === 0} emptyText="Belum ada talenta terdaftar." className="sm:grid-cols-2 lg:grid-cols-4">
            {devs.data?.map((d) => (
              <Link key={d.username} to="/$username" params={{ username: d.username }} className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <AvatarMini name={d.username} url={d.avatar_url} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{d.display_name || d.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{d.username}</p>
                  </div>
                </div>
                {d.headline && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{d.headline}</p>}
                {d.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{d.skills.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{s}</span>)}</div>}
                {d.available_for_hire && <span className="mt-3 w-fit rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">Siap menerima proyek</span>}
              </Link>
            ))}
          </Grid>
        </HomeSection>

        {on("karya") && (
          <HomeSection icon={Package} title="Karya terbaru" more={<Link to="/katalog">Lihat katalog</Link>}>
            <Grid loading={karya.isLoading} empty={karya.data?.length === 0} emptyText="Belum ada karya." className="sm:grid-cols-2 lg:grid-cols-4">
              {karya.data?.map((p) => <ProductCard key={p.id} p={p} />)}
            </Grid>
          </HomeSection>
        )}

        {on("discuss") && (
          <HomeSection icon={MessageSquare} title="Diskusi komunitas" more={<Link to="/discuss">Semua diskusi</Link>}>
            <Grid loading={posts.isLoading} empty={posts.data?.length === 0} emptyText="Belum ada diskusi. Mulai yang pertama!" className="md:grid-cols-2">
              {posts.data?.map((p) => (
                <Link key={p.id} to="/discuss/$id" params={{ id: p.id }} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md">
                  <AvatarMini name={p.author?.username ?? "?"} url={p.author?.avatar_url} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{p.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">@{p.author?.username} · {timeAgo(p.created_at)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{p.comments?.[0]?.count ?? 0}</span>
                </Link>
              ))}
            </Grid>
          </HomeSection>
        )}

        {!user && <HowItWorks canSignUp={on("signup")} />}
      </div>
    </main>
  );
}

/** Kotak pencarian beranda dengan pilihan jenis yang dicari. */
function SearchBox({ q, setQ, type, setType, onSubmit }: {
  q: string; setQ: (v: string) => void; type: SearchType; setType: (t: SearchType) => void; onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} role="search" className="mt-7 w-full max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari talenta, proyek, karya, lowongan…"
          aria-label="Kata kunci pencarian"
          className="h-14 rounded-2xl border-border bg-card pl-12 pr-28 text-base shadow-glow md:h-16 md:text-lg"
        />
        <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 md:h-11">Cari</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SEARCH_TYPES.map(([t, label, Icon]) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition", type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent")}
          >
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
    </form>
  );
}

function GoalCard({ g }: { g: Goal }) {
  const Icon = g.Icon;
  return (
    <Link to={g.to} search={g.search as never} className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-6" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{g.label}</span>
        <span className="block text-sm text-muted-foreground">{g.hint}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

/**
 * Aktivitas pengguna yang sudah masuk, sama untuk semua peran: pesanan berjalan (sebagai pembeli atau penjual),
 * lamaran dan pelamar yang menunggu, serta pesan belum dibaca. Hanya yang ada isinya yang ditampilkan.
 * Kalau sebuah hitungan gagal (misalnya fitur belum aktif di database), kartunya disembunyikan.
 */
function MyActivity({ userId, accountType, on }: { userId: string; accountType: "client" | "developer" | null; on: (k: FeatureKey) => boolean }) {
  const orders = useQuery({
    queryKey: ["home", "activity-orders", userId],
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true })
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).in("status", ACTIVE_ORDER_STATUSES);
      return error ? null : (count ?? 0);
    },
  });
  const myApps = useQuery({
    queryKey: ["home", "activity-my-apps", userId],
    enabled: on("jobs"),
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const { count, error } = await sb.from("job_applications").select("id", { count: "exact", head: true }).eq("developer_id", userId).eq("status", "pending");
      return error ? null : (count ?? 0);
    },
  });
  const received = useQuery({
    queryKey: ["home", "activity-received-apps", userId],
    enabled: on("jobs"),
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const { count, error } = await sb.from("job_applications")
        .select("id, job:jobs!job_applications_job_id_fkey!inner(client_id)", { count: "exact", head: true })
        .eq("job.client_id", userId).eq("status", "pending");
      return error ? null : (count ?? 0);
    },
  });
  const dm = useQuery({
    queryKey: ["home", "activity-dm", userId],
    enabled: on("discuss"),
    staleTime: 30_000,
    queryFn: () => fetchDmUnread(userId),
  });

  const all: ActivityTile[] = [
    { key: "orders", to: "/pesanan", label: "Pesanan berjalan", Icon: Receipt, count: orders.data },
    { key: "received", to: "/dashboard", label: "Pelamar menunggu jawabanmu", Icon: UserPlus, count: received.data },
    { key: "mine", to: "/studio/lamaran", label: "Lamaranmu menunggu jawaban", Icon: Briefcase, count: myApps.data },
    { key: "dm", to: "/discuss/pesan", label: "Percakapan belum dibaca", Icon: MessageSquare, count: dm.data },
  ];
  const tiles = all.filter((t) => typeof t.count === "number" && t.count > 0);
  const checking = [orders, myApps, received, dm].some((r) => r.isLoading);

  return (
    <section aria-label="Aktivitasmu" className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Aktivitasmu</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {checking ? "Memeriksa yang perlu perhatianmu…" : tiles.length > 0 ? "Ada yang menunggu perhatianmu." : "Belum ada yang menunggu. Semuanya beres."}
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to={workspacePath(accountType)}>Buka ruang kerja<ArrowRight /></Link></Button>
      </div>
      {tiles.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(({ key, to, label, Icon, count }) => (
            <li key={key}>
              <Link to={to} className="flex h-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 transition hover:bg-primary/10">
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-none">{count}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Untuk tamu: tiga langkah singkat dan ajakan mendaftar. */
function HowItWorks({ canSignUp }: { canSignUp: boolean }) {
  return (
    <section aria-labelledby="how" className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-10">
      <h2 id="how" className="text-center text-2xl font-bold">Mulai dalam tiga langkah</h2>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{i + 1}</span>
            <span>
              <span className="block font-semibold">{s.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {canSignUp && (
        <div className="mt-8 text-center">
          <Button asChild size="lg"><Link to="/auth">Buat akun gratis<ArrowRight /></Link></Button>
        </div>
      )}
    </section>
  );
}

function HomeSection({ icon: Icon, title, more, children }: { icon: LucideIcon; title: string; more: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="flex items-center gap-3 text-2xl font-bold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
          {title}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-link hover:underline">{more}<ArrowRight className="size-4" /></span>
      </div>
      {children}
    </section>
  );
}

function Grid({ loading, empty, emptyText, className, children }: { loading: boolean; empty: boolean; emptyText: string; className?: string; children: ReactNode }) {
  if (loading) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (empty) return <p className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-muted-foreground">{emptyText}</p>;
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
