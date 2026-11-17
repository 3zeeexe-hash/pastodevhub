import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ChevronRight, Cog, CreditCard, Globe, Loader2, Plug, ShieldCheck, SlidersHorizontal, Store, Tags, ToggleRight, UserCog, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import { FEATURES, isFeatureOn, type FeatureFlags } from "@/lib/features";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/pengaturan")({
  head: () => ({ meta: [{ title: "Pusat pengaturan — Admin GoBi" }, { name: "robots", content: "noindex" }] }),
  component: SettingsHub,
});

// Judul dan keterangan halaman datang dari AdminShell (lihat admin-nav.tsx).
type Entry = { to: string; search?: Record<string, string>; label: string; desc: string; Icon: LucideIcon };
type Section = { title: string; Icon: LucideIcon; items: Entry[] };

const SECTIONS: Section[] = [
  { title: "Situs", Icon: Globe, items: [
    { to: "/admin/fitur", label: "Fitur, pengumuman & mode perawatan", desc: "Nyalakan atau matikan fitur, tutup situs saat perawatan, dan atur banner pengumuman untuk semua pengunjung.", Icon: ToggleRight },
  ] },
  { title: "Pembayaran", Icon: CreditCard, items: [
    { to: "/admin/midtrans", label: "Midtrans", desc: "Kunci API dan status gerbang pembayaran.", Icon: CreditCard },
  ] },
  { title: "GOBI WORK", Icon: Briefcase, items: [
    { to: "/admin/kerja", search: { tab: "pengaturan" }, label: "Pengaturan lowongan & kontrak", desc: "Aturan GOBI WORK yang berlaku untuk lowongan dan kontrak.", Icon: SlidersHorizontal },
    { to: "/admin/kerja", search: { tab: "kategori" }, label: "Kategori lowongan", desc: "Tambah, ubah urutan, atau nonaktifkan kategori lowongan.", Icon: Tags },
  ] },
  { title: "GOBI SERVICE", Icon: Store, items: [
    { to: "/admin/jasa", search: { tab: "pengaturan" }, label: "Moderasi jasa", desc: "Wajibkan tinjauan admin sebelum jasa terbit, atau biarkan terbit otomatis.", Icon: ShieldCheck },
  ] },
  { title: "Sistem & akun", Icon: Cog, items: [
    { to: "/admin/integrasi", label: "Integrasi", desc: "Layanan pihak ketiga yang terhubung ke platform.", Icon: Plug },
    { to: "/settings", label: "Akun admin", desc: "Profil dan preferensi akunmu sendiri.", Icon: UserCog },
  ] },
];

// Kunci dan bentuk data kuerinya sama persis dengan halaman Fitur dan tab Pengaturan jasa, jadi cache-nya dipakai bersama.
function useStatus() {
  const flags = useQuery({
    queryKey: ["admin-flags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feature_flags").select("key,enabled");
      if (error) throw error;
      const out: FeatureFlags = {};
      for (const r of data ?? []) out[r.key] = r.enabled;
      return out;
    },
  });
  const ann = useQuery({
    queryKey: ["admin-announcement"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("announcement,announcement_level,updated_at").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const moderation = useQuery({
    queryKey: ["svc-admin", "setting-moderation"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("service_settings").select("value").eq("key", "require_moderation").maybeSingle();
      if (error) throw new Error(errMsg(error));
      return data?.value === true;
    },
  });
  return { flags, ann, moderation };
}

type Tone = "ok" | "warn" | "muted";
function Tile({ label, value, tone, loading }: { label: string; value: string; tone: Tone; loading: boolean }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
        {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Memuat" /> : (
          <>
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone === "ok" && "bg-emerald-500", tone === "warn" && "bg-amber-500", tone === "muted" && "bg-muted-foreground/40")} />
            <span className="min-w-0 truncate">{value}</span>
          </>
        )}
      </p>
    </li>
  );
}

function SettingsHub() {
  const { flags, ann, moderation } = useStatus();

  const siteOpen = isFeatureOn(flags.data, "situs");
  const offCount = FEATURES.filter((f) => !isFeatureOn(flags.data, f.key)).length;
  const hasAnnouncement = !!(ann.data?.announcement ?? "").trim();

  return (
    <div className="space-y-8">
      <section aria-label="Status saat ini">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Situs" loading={flags.isLoading} value={flags.isError ? "Tidak terbaca" : siteOpen ? "Terbuka" : "Mode perawatan"} tone={flags.isError ? "muted" : siteOpen ? "ok" : "warn"} />
          <Tile label="Fitur" loading={flags.isLoading} value={flags.isError ? "Tidak terbaca" : offCount === 0 ? "Semua menyala" : `${offCount} fitur mati`} tone={flags.isError ? "muted" : offCount === 0 ? "ok" : "warn"} />
          <Tile label="Pengumuman" loading={ann.isLoading} value={ann.isError ? "Tidak terbaca" : hasAnnouncement ? "Sedang tampil" : "Tidak ada"} tone={ann.isError ? "muted" : hasAnnouncement ? "warn" : "muted"} />
          <Tile label="Moderasi jasa" loading={moderation.isLoading} value={moderation.isError ? "Tidak terbaca" : moderation.data ? "Wajib sebelum terbit" : "Otomatis"} tone={moderation.isError ? "muted" : moderation.data ? "ok" : "muted"} />
        </ul>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title} aria-labelledby={`set-${s.title}`}>
          <h2 id={`set-${s.title}`} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <s.Icon className="size-4" /> {s.title}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {s.items.map((it) => (
              <li key={it.to + it.label}>
                <Link to={it.to} search={it.search as never} className="group flex h-full items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><it.Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.label}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{it.desc}</span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
