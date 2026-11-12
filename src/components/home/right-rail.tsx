import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Receipt, Search, Sparkles, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureKey } from "@/lib/features";
import { budgetLabel } from "@/lib/jobs";
import { SEARCH_TYPES } from "@/lib/search-types";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { TrendingTags } from "@/components/feed/trending";
import type { HomeData } from "@/components/home/use-home-data";
import { cn } from "@/lib/utils";

type On = (key: FeatureKey) => boolean;
type SearchType = (typeof SEARCH_TYPES)[number][0];

// Hitungan aktivitas langsung ke tabel; tanpa tipe supaya filter ke tabel terkait tidak tertahan tipe hasil generate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const ACTIVE_ORDER_STATUSES = ["requested", "awaiting_payment", "payment_review", "in_progress", "delivered"];

function Card({ title, icon: Icon, more, children }: { title: string; icon: LucideIcon; more?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><Icon className="size-4 text-primary" />{title}</h2>
        {more && <span className="text-xs font-medium text-link hover:underline">{more}</span>}
      </div>
      {children}
    </section>
  );
}

const muted = "px-4 py-4 text-sm text-muted-foreground";

/** Pencarian dengan pilihan jenis. Di beranda layar sangat lebar, kolom pencarian header disembunyikan dan diganti kartu ini. */
function SearchCard() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<SearchType>("users");
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); navigate({ to: "/search", search: { q: q.trim(), type } }); }}
      className="rounded-2xl border border-border bg-card p-3"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di Pastodev" aria-label="Kata kunci pencarian" className="h-10 rounded-full bg-background pl-9" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SEARCH_TYPES.map(([t, label, Icon]) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition", type === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent")}
          >
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>
    </form>
  );
}

type ActivityTile = { key: string; to: string; label: string; Icon: LucideIcon; count: number | null | undefined };

/**
 * Hal yang menunggu perhatian pengguna. Hanya tampil kalau ada isinya, supaya beranda tetap bersih.
 * Pesan belum dibaca tidak diulang di sini karena sudah punya lencana di menu kiri.
 */
function ActivityCard({ userId, on }: { userId: string; on: On }) {
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

  const all: ActivityTile[] = [
    { key: "orders", to: "/pesanan", label: "Pesanan berjalan", Icon: Receipt, count: orders.data },
    { key: "received", to: "/dashboard", label: "Pelamar menunggu jawabanmu", Icon: UserPlus, count: received.data },
    { key: "mine", to: "/studio/lamaran", label: "Lamaranmu menunggu jawaban", Icon: Briefcase, count: myApps.data },
  ];
  const tiles = all.filter((t) => typeof t.count === "number" && t.count > 0);
  if (!tiles.length) return null;

  return (
    <Card title="Menunggu kamu" icon={Sparkles}>
      <ul className="mt-1 pb-1">
        {tiles.map(({ key, to, label, Icon, count }) => (
          <li key={key}>
            <Link to={to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              <span className="font-mono text-sm font-bold">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function JobsCard({ data }: { data: HomeData }) {
  const jobs = data.jobs.data ?? [];
  return (
    <Card title="Lowongan terbaru" icon={Briefcase} more={<Link to="/lowongan">Semua</Link>}>
      {data.jobs.isLoading ? <p className={muted}>Memuat…</p> : jobs.length === 0 ? <p className={muted}>Belum ada lowongan dibuka.</p> : (
        <ul className="mt-1 pb-1">
          {jobs.slice(0, 3).map((j) => (
            <li key={j.id}>
              <Link to="/lowongan/$id" params={{ id: j.id }} className="block px-4 py-2.5 hover:bg-accent/40">
                <p className="line-clamp-1 text-sm font-semibold">{j.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{budgetLabel(j.budget_min, j.budget_max)} · {j.client?.display_name || j.client?.username || "Client"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Kolom kanan beranda (layar sangat lebar): pencarian, aktivitas, tren, dan lowongan.
 * Talenta tidak diulang di sini karena sudah tampil sebagai baris avatar di atas linimasa.
 */
export function RightRail({ data, on, userId }: { data: HomeData; on: On; userId: string | null }) {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] space-y-4 overflow-y-auto py-4 xl:block">
      <SearchCard />
      {userId && <ActivityCard userId={userId} on={on} />}
      {on("discuss") && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card [&_section]:border-b-0">
          <TrendingTags limit={5} />
        </div>
      )}
      {on("jobs") && <JobsCard data={data} />}
    </aside>
  );
}

/** Baris avatar talenta di atas linimasa (ala Story Instagram). Cincin warna = siap menerima proyek. */
export function TalentStories({ data }: { data: HomeData }) {
  const devs = data.devs.data ?? [];
  if (!devs.length) return null;
  return (
    <section aria-label="Talenta" className="border-b border-border">
      <ul className="flex gap-4 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {devs.map((d) => (
          <li key={d.username} className="shrink-0">
            <Link to="/$username" params={{ username: d.username }} className="flex w-16 flex-col items-center gap-1.5">
              <span className={cn("rounded-full p-0.5", d.available_for_hire ? "bg-gradient-to-tr from-primary to-amber-400" : "bg-border")}>
                <span className="block rounded-full bg-background p-0.5"><AvatarMini name={d.username} url={d.avatar_url} size={52} /></span>
              </span>
              <span className="w-full truncate text-center text-xs">{d.display_name || d.username}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lowongan terbaru sebagai kartu geser, untuk layar yang belum punya kolom kanan. */
export function DiscoverStrip({ data, on }: { data: HomeData; on: On }) {
  const jobs = on("jobs") ? (data.jobs.data ?? []) : [];
  if (!jobs.length) return null;
  const label = "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary";
  const card = "flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-3 hover:border-primary/50";
  return (
    <section aria-label="Lowongan terbaru" className="border-b border-border xl:hidden">
      <ul className="flex gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        {jobs.map((j) => (
          <li key={`j-${j.id}`} className="w-60 shrink-0">
            <Link to="/lowongan/$id" params={{ id: j.id }} className={card}>
              <span className={label}><Briefcase className="size-3" />Lowongan</span>
              <span className="line-clamp-2 text-sm font-semibold">{j.title}</span>
              <span className="mt-auto text-xs text-muted-foreground">{budgetLabel(j.budget_min, j.budget_max)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
