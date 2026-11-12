import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, BookMarked, Bot, Briefcase, Download, FileCode2, FolderKanban, LibraryBig, MessageSquare, Package, Plus, Receipt, Search, Share2, Users, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { siteJsonLd } from "@/lib/seo";
import { useAuth, timeAgo } from "@/lib/auth";
import { fetchDmUnread } from "@/lib/dm";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { ROLE_INFO, ROLE_ORDER, workspacePath, writeStoredRole, type Role } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { brandMarkUrl } from "@/components/brand";
import { JobCard } from "@/components/job-card";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";
import { ROLE_ICON } from "@/components/role-ui";
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
type SectionKey = "jobs" | "devs" | "karya" | "posts";
type QuickAction = { to: string; label: string; hint: string; Icon: LucideIcon; feature?: FeatureKey; search?: Record<string, string> };
type TodayTile = { key: string; to: string; label: string; Icon: LucideIcon; count: number | null | undefined; loading: boolean };

// Ringkasan "Hari ini" memakai penghitungan langsung ke tabel; dibuat tanpa tipe supaya
// filter ke tabel terkait (job_applications → jobs) tidak tertahan oleh tipe hasil generate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Status pesanan yang masih berjalan (belum selesai, ditolak, atau dibatalkan). */
const ACTIVE_ORDER_STATUSES = ["requested", "awaiting_payment", "payment_review", "in_progress", "delivered"];

/** Pintasan di beranda untuk tiap peran. */
const QUICK_ACTIONS: Record<Role, QuickAction[]> = {
  developer: [
    { to: "/new", label: "Repositori baru", hint: "Mulai proyek kode", Icon: BookMarked, feature: "repos" },
    { to: "/studio/karya", label: "Karya saya", hint: "Unggah dan jual karya", Icon: Package, feature: "karya" },
    { to: "/studio/jasa", label: "Jasa saya", hint: "Atur layanan yang dijual", Icon: Wrench, feature: "jasa" },
    { to: "/studio/hosting", label: "Hosting HTML", hint: "Publikasikan halaman", Icon: FileCode2, feature: "hosting" },
    { to: "/pesanan", label: "Pesanan", hint: "Pantau pekerjaan masuk", Icon: Receipt },
  ],
  freelancer: [
    { to: "/lowongan", label: "Cari lowongan", hint: "Proyek yang sedang dibuka", Icon: Search, feature: "jobs" },
    { to: "/studio/lamaran", label: "Lamaran saya", hint: "Status lamaran terkirim", Icon: Briefcase, feature: "jobs" },
    { to: "/studio/jasa", label: "Jasa saya", hint: "Tawarkan layananmu", Icon: Wrench, feature: "jasa" },
    { to: "/studio/portofolio", label: "Portofolio", hint: "Tunjukkan hasil kerja", Icon: FolderKanban, feature: "jasa" },
    { to: "/pesanan", label: "Pesanan", hint: "Chat dan kirim hasil", Icon: Receipt },
  ],
  client: [
    { to: "/lowongan/baru", label: "Pasang lowongan", hint: "Terima lamaran developer", Icon: Plus, feature: "jobs" },
    { to: "/search", label: "Cari developer", hint: "Lihat profil dan keahlian", Icon: Users, search: { q: "", type: "users" } },
    { to: "/jasa", label: "Pesan jasa", hint: "Langsung pesan layanan", Icon: Wrench, feature: "jasa" },
    { to: "/katalog", label: "Beli karya", hint: "Template dan proyek siap pakai", Icon: LibraryBig, feature: "karya" },
    { to: "/pesanan", label: "Pesanan saya", hint: "Pantau pesanan berjalan", Icon: Receipt },
  ],
  personal: [
    { to: "/new", label: "Repositori baru", hint: "Simpan kode pribadi", Icon: BookMarked, feature: "repos" },
    { to: "/import", label: "Impor dari GitHub", hint: "Bawa repositori lama", Icon: Download, feature: "github" },
    { to: "/studio/hosting", label: "Hosting HTML", hint: "Buat halaman sendiri", Icon: FileCode2, feature: "hosting" },
    { to: "/studio/files", label: "Berbagi file", hint: "Dapat link untuk tiap file", Icon: Share2, feature: "hosting" },
    { to: "/studio/ai", label: "AI untuk repo", hint: "Pakai kunci AI milikmu", Icon: Bot, feature: "ai_editor" },
  ],
};

/** Urutan bagian beranda: yang paling berguna untuk peran itu tampil lebih dulu. */
const SECTION_ORDER: Record<Role | "guest", SectionKey[]> = {
  guest: ["jobs", "devs", "karya", "posts"],
  client: ["devs", "karya", "jobs", "posts"],
  freelancer: ["jobs", "karya", "posts", "devs"],
  developer: ["karya", "posts", "jobs", "devs"],
  personal: ["posts", "karya", "devs", "jobs"],
};

const ROLE_POINTS: Record<Role, string[]> = {
  developer: ["Repositori Git dan impor GitHub", "Jual karya dan buka toko", "Hosting HTML, file, dan gambar"],
  freelancer: ["Cari dan lamar lowongan", "Buka jasa dan pajang portofolio", "Terima pesanan, chat, kirim hasil"],
  client: ["Pasang lowongan, terima lamaran", "Pesan jasa developer", "Beli karya siap pakai"],
  personal: ["Simpan kode di repositori pribadi", "Hosting halaman dan berbagi file", "AI editor dengan kunci sendiri"],
};

function Index() {
  const { user, profile } = useAuth();
  const { role } = useRole();
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

  const sections: Record<SectionKey, ReactNode> = {
    jobs: on("jobs") && (
      <HomeSection icon={<Briefcase className="size-5 text-primary" />} title="Proyek dan lowongan terbaru" more={<Link to="/lowongan">Semua lowongan</Link>}>
        <Grid loading={jobs.isLoading} empty={jobs.data?.length === 0} emptyText="Belum ada lowongan dibuka." className="md:grid-cols-2">
          {jobs.data?.map((j) => <JobCard key={j.id} j={j} />)}
        </Grid>
      </HomeSection>
    ),
    devs: (
      <HomeSection icon={<Users className="size-5 text-primary" />} title="Talenta pilihan" more={<Link to="/search" search={{ q: "", type: "users" }}>Semua talenta</Link>}>
        <Grid loading={devs.isLoading} empty={devs.data?.length === 0} emptyText="Belum ada talenta terdaftar." className="sm:grid-cols-2 lg:grid-cols-4">
          {devs.data?.map((d) => (
            <Link key={d.username} to="/$username" params={{ username: d.username }} className="flex flex-col rounded-xl border border-border bg-card p-4 transition hover:border-primary/60">
              <div className="flex items-center gap-3">
                <AvatarMini name={d.username} url={d.avatar_url} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{d.display_name || d.username}</p>
                  <p className="truncate text-xs text-muted-foreground">@{d.username}</p>
                </div>
              </div>
              {d.headline && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{d.headline}</p>}
              {d.skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{d.skills.slice(0, 4).map((s) => <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">{s}</span>)}</div>}
              {d.available_for_hire && <span className="mt-3 w-fit rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">Siap menerima proyek</span>}
            </Link>
          ))}
        </Grid>
      </HomeSection>
    ),
    karya: on("karya") && (
      <HomeSection icon={<Package className="size-5 text-primary" />} title="Karya terbaru" more={<Link to="/katalog">Lihat katalog</Link>}>
        <Grid loading={karya.isLoading} empty={karya.data?.length === 0} emptyText="Belum ada karya." className="sm:grid-cols-2 lg:grid-cols-4">
          {karya.data?.map((p) => <ProductCard key={p.id} p={p} />)}
        </Grid>
      </HomeSection>
    ),
    posts: on("discuss") && (
      <HomeSection icon={<MessageSquare className="size-5 text-primary" />} title="Diskusi" more={<Link to="/discuss">Semua diskusi</Link>}>
        <Grid loading={posts.isLoading} empty={posts.data?.length === 0} emptyText="Belum ada diskusi. Mulai yang pertama!" className="md:grid-cols-2">
          {posts.data?.map((p) => (
            <Link key={p.id} to="/discuss/$id" params={{ id: p.id }} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/60">
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
    ),
  };

  return (
    <main>
      <section className="bg-hero relative overflow-hidden border-b border-border">
        <div className="batik-line pointer-events-none absolute inset-x-0 bottom-0 h-1 opacity-60" />
        {signedIn ? (
          // Pengguna yang sudah masuk tidak perlu iklan: cukup kotak pencarian, ruang kerjanya ada tepat di bawah.
          <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
            <SearchBox q={q} setQ={setQ} type={type} setType={setType} onSubmit={search} compact />
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-12 text-center md:py-18">
            <img src={brandMarkUrl} alt="Maskot Pastodev berblangkon" className="size-20 rounded-full ring-2 ring-primary/50 md:size-24" />
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Satu tempat untuk <span className="text-primary">kerja, proyek, dan karya</span>
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground md:text-lg">Cari talenta, ambil proyek, jual karya, atau simpan kode pribadi. Semua ada di satu akun, siapa pun kamu.</p>

            <SearchBox q={q} setQ={setQ} type={type} setType={setType} onSubmit={search} />

            {!user && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {on("signup") && <Button asChild size="lg"><Link to="/auth">Buat akun gratis</Link></Button>}
                <Button asChild size="lg" variant="outline"><Link to="/explore">Jelajahi proyek</Link></Button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-12">
        {signedIn ? (
          <WorkspacePanel userId={user.id} name={profile.display_name || profile.username} role={role} accountType={profile.account_type} on={on} />
        ) : (
          on("signup") && <RoleIntro />
        )}

        {SECTION_ORDER[signedIn ? role : "guest"].map((k) => <Fragment key={k}>{sections[k]}</Fragment>)}
      </div>
    </main>
  );
}

/** Kotak pencarian beranda: besar untuk tamu, ringkas untuk pengguna yang sudah masuk. */
function SearchBox({ q, setQ, type, setType, onSubmit, compact }: {
  q: string; setQ: (v: string) => void; type: SearchType; setType: (t: SearchType) => void; onSubmit: (e: React.FormEvent) => void; compact?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} role="search" className={cn("w-full max-w-2xl", compact ? "mx-auto" : "mt-8")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari developer, proyek, karya, lowongan…"
          aria-label="Kata kunci pencarian"
          className={cn("rounded-xl border-primary/40 bg-card pl-12 pr-28 text-base shadow-glow", compact ? "h-12" : "h-14 md:h-16 md:text-lg")}
        />
        <Button type="submit" className={cn("absolute right-2 top-1/2 -translate-y-1/2", !compact && "md:h-11")}>Cari</Button>
      </div>
      <div className={cn("mt-3 flex flex-wrap gap-2", compact ? "justify-start" : "justify-center")}>
        {SEARCH_TYPES.map(([t, label, Icon]) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={cn("flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition", type === t ? "border-primary bg-primary text-primary-foreground" : "bg-card/60 hover:bg-accent")}
          >
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>
    </form>
  );
}

/** Sapaan, pintasan, dan ringkasan "Hari ini" sesuai peran aktif. */
function WorkspacePanel({ userId, name, role, accountType, on }: { userId: string; name: string; role: Role; accountType: "client" | "developer" | null; on: (k: FeatureKey) => boolean }) {
  const info = ROLE_INFO[role];
  const Icon = ROLE_ICON[role];
  const actions = QUICK_ACTIONS[role].filter((a) => !a.feature || on(a.feature));
  return (
    <section aria-label="Ruang kerja kamu" className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-primary"><Icon className="size-4" />Mode {info.title}</p>
          <h2 className="mt-1 truncate text-xl font-bold md:text-2xl">Halo, {name} 👋</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{info.tagline} Ganti peran kapan saja lewat tombol di pojok atas.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to={workspacePath(accountType)}>{info.workspaceLabel}<ArrowRight /></Link></Button>
      </div>

      <TodayStrip userId={userId} role={role} on={on} />

      <h3 className="mt-6 text-sm font-semibold text-muted-foreground">Mulai dari sini</h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map(({ to, label, hint, Icon: AIcon, search }) => (
          <li key={to + label}>
            <Link to={to} search={search as never} className="flex h-full items-start gap-3 rounded-xl border border-border bg-background/40 p-3 transition hover:border-primary/60 hover:bg-accent/40">
              <AIcon className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Ringkasan lintas peran: pesanan berjalan, lamaran, dan pesan belum dibaca.
 * Pesanan dihitung dari sisi penjual untuk developer/freelancer, dari sisi pembeli untuk client dan pemakai pribadi.
 * Kalau sebuah hitungan gagal (misalnya fitur belum aktif di database), tampil "—" dan tidak mengganggu beranda.
 */
function TodayStrip({ userId, role, on }: { userId: string; role: Role; on: (k: FeatureKey) => boolean }) {
  const sellerSide = role === "developer" || role === "freelancer";
  const showApps = on("jobs") && (role === "freelancer" || role === "client");

  const orders = useQuery({
    queryKey: ["home", "today-orders", userId, sellerSide],
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true })
        .eq(sellerSide ? "seller_id" : "buyer_id", userId).in("status", ACTIVE_ORDER_STATUSES);
      return error ? null : (count ?? 0);
    },
  });
  const apps = useQuery({
    queryKey: ["home", "today-apps", userId, role],
    enabled: showApps,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const base = sb.from("job_applications");
      const { count, error } = role === "client"
        ? await base.select("id, job:jobs!job_applications_job_id_fkey!inner(client_id)", { count: "exact", head: true }).eq("job.client_id", userId).eq("status", "pending")
        : await base.select("id", { count: "exact", head: true }).eq("developer_id", userId).eq("status", "pending");
      return error ? null : (count ?? 0);
    },
  });
  const dm = useQuery({
    queryKey: ["home", "today-dm", userId],
    enabled: on("discuss"),
    staleTime: 30_000,
    queryFn: () => fetchDmUnread(userId),
  });

  const tiles: TodayTile[] = [
    { key: "orders", to: "/pesanan", label: sellerSide ? "Pesanan masuk yang berjalan" : "Pesanan yang berjalan", Icon: Receipt, count: orders.data, loading: orders.isLoading },
  ];
  if (showApps) {
    tiles.push({
      key: "apps",
      to: role === "client" ? "/dashboard" : "/studio/lamaran",
      label: role === "client" ? "Pelamar menunggu jawabanmu" : "Lamaran menunggu jawaban",
      Icon: Briefcase,
      count: apps.data,
      loading: apps.isLoading,
    });
  }
  if (on("discuss")) {
    tiles.push({ key: "dm", to: "/discuss/pesan", label: "Percakapan belum dibaca", Icon: MessageSquare, count: dm.data, loading: dm.isLoading });
  }

  return (
    <>
      <h3 className="mt-6 text-sm font-semibold text-muted-foreground">Hari ini</h3>
      <ul className="mt-2 grid gap-3 sm:grid-cols-3">
        {tiles.map(({ key, to, label, Icon: TIcon, count, loading }) => {
          const hasWork = typeof count === "number" && count > 0;
          return (
            <li key={key}>
              <Link to={to} className={cn("flex h-full items-center gap-3 rounded-xl border p-3 transition hover:bg-accent/40", hasWork ? "border-primary/60 bg-primary/5" : "border-border bg-background/40")}>
                <TIcon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-none">{loading ? "…" : (count ?? "—")}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Untuk tamu: empat peran dan apa yang bisa dilakukan di tiap peran. */
function RoleIntro() {
  return (
    <section aria-labelledby="role-intro">
      <div className="mb-5 text-center">
        <h2 id="role-intro" className="text-xl font-bold md:text-2xl">Kamu mau pakai Pastodev sebagai apa?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pilih satu untuk mulai. Bisa diganti kapan saja, tanpa buat akun baru.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_ORDER.map((r) => {
          const Icon = ROLE_ICON[r];
          return (
            <li key={r}>
              <Link to="/auth" onClick={() => writeStoredRole(r)} className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition hover:border-primary/60">
                <Icon className="size-6 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{ROLE_INFO[r].title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{ROLE_INFO[r].tagline}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {ROLE_POINTS[r].map((t) => <li key={t} className="flex gap-2"><span className="text-primary">•</span>{t}</li>)}
                </ul>
                <span className="mt-4 flex items-center gap-1 pt-1 text-sm font-medium text-link group-hover:underline">Mulai sebagai {ROLE_INFO[r].title}<ArrowRight className="size-4" /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HomeSection({ icon, title, more, children }: { icon: ReactNode; title: string; more: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">{icon}{title}</h2>
        <span className="flex items-center gap-1 text-sm text-link hover:underline">{more}<ArrowRight className="size-4" /></span>
      </div>
      {children}
    </section>
  );
}

function Grid({ loading, empty, emptyText, className, children }: { loading: boolean; empty: boolean; emptyText: string; className?: string; children: ReactNode }) {
  if (loading) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  if (empty) return <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">{emptyText}</p>;
  return <div className={cn("grid gap-4", className)}>{children}</div>;
}
