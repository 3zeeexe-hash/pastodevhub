import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bot, BookMarked, Briefcase, Download, FileCode2, FileSignature, FolderKanban, Images, ListChecks, Package, Receipt, Search, Share2, Sparkles, Star, Store, Wallet, Wrench } from "lucide-react";
import { useAuth, timeAgo } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah, type OrderStatus } from "@/lib/market";
import { isFeatureOn, type FeatureKey } from "@/lib/features";
import { ROLE_INFO, roleCan, type Capability } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { useSiteConfig } from "@/lib/use-site-config";
import { workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/order-status";
import { ActionList, EmptyHint, SectionCard, ShortcutGrid, StatGrid, StatTile, StepsCard, SummaryHero, heroOutline, type ActionItem, type Shortcut, type Step } from "@/components/summary-ui";

export const Route = createFileRoute("/studio/")({ component: StudioHome });

const MIN_PAYOUT = 10000;

/** Saldo berbasis escrow (docs/sql/midtrans-escrow/001). */
type WalletRow = { on_hold: number; awaiting_admin: number; available: number; frozen: number; requested: number; paid_out: number };
/** Saldo lama, hanya dipakai selama SQL escrow belum dijalankan. */
type LegacyBalance = { earned: number; on_hold: number; paid_out: number; pending: number; available: number };
type WorkStats = { freelancer: Record<string, number | null> };
type OrderRow = { id: string; number: number | string; title: string; amount: number | null; status: string; updated_at: string };

const num = (v: unknown) => Number(v ?? 0) || 0;
const rupiah = (v: number | undefined) => formatRupiah(v ?? 0, "Rp0");

type Sc = Shortcut & { cap?: Capability; feature?: FeatureKey };

const SHORTCUTS: Sc[] = [
  { to: "/new", label: "Repositori baru", desc: "Mulai proyek kode", Icon: BookMarked, cap: "repos", feature: "repos" },
  { to: "/import", label: "Impor dari GitHub", desc: "Bawa repositori yang sudah ada", Icon: Download, cap: "github", feature: "github" },
  { to: "/studio/karya", label: "Kelola karya", desc: "Jual template, kode, dan aset", Icon: Package, cap: "karya", feature: "karya" },
  { to: "/studio/jasa", label: "Kelola jasa", desc: "Atur layanan yang kamu tawarkan", Icon: Wrench, cap: "jasa", feature: "jasa" },
  { to: "/studio/portofolio", label: "Portofolio", desc: "Tampilkan hasil kerjamu", Icon: FolderKanban, cap: "portfolio", feature: "jasa" },
  { to: "/lowongan", label: "Cari proyek", desc: "Jelajahi lowongan terbuka", Icon: Search, cap: "lamaran", feature: "jobs" },
  { to: "/kerja/lamaran", label: "Lamaran saya", desc: "Pantau status lamaran", Icon: Briefcase, cap: "lamaran", feature: "jobs" },
  { to: "/studio/hosting", label: "Hosting HTML", desc: "Terbitkan halaman statis", Icon: FileCode2, cap: "hosting", feature: "hosting" },
  { to: "/studio/files", label: "Berbagi file", desc: "Bagikan berkas lewat tautan", Icon: Share2, cap: "hosting", feature: "hosting" },
  { to: "/studio/images", label: "Cloud gambar", desc: "Simpan dan pakai gambar", Icon: Images, cap: "hosting", feature: "hosting" },
  { to: "/studio/toko", label: "Toko saya", desc: "Etalase publik karya dan jasa", Icon: Store, cap: "toko", feature: "toko" },
  { to: "/studio/ai", label: "AI untuk repo", desc: "Bantu edit kode dengan AI", Icon: Bot, cap: "ai", feature: "ai_editor" },
];

const HERO_TOS: Record<string, string[]> = {
  developer: ["/new", "/studio/karya"],
  freelancer: ["/lowongan", "/studio/jasa"],
  client: [],
  personal: ["/new", "/studio/hosting"],
};

function StudioHome() {
  const { user, profile } = useAuth();
  const { role } = useRole();
  const { flags } = useSiteConfig();
  const uid = user?.id;

  const { data } = useQuery({
    queryKey: ["studio-home", uid],
    enabled: !!uid,
    queryFn: async () => {
      const id = uid!;
      const [walletRes, products, services, repos, active, recent, apps, work] = await Promise.all([
        looseDb.rpc("developer_wallet", { _user_id: id }),
        looseDb.from("products").select("id", { count: "exact", head: true }).eq("owner_id", id),
        looseDb.from("services").select("id", { count: "exact", head: true }).eq("owner_id", id),
        looseDb.from("repositories").select("id", { count: "exact", head: true }).eq("owner_id", id),
        looseDb.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", id).in("status", ["requested", "in_progress"]),
        looseDb.from("orders").select("id,number,title,amount,status,updated_at").eq("seller_id", id).order("updated_at", { ascending: false }).limit(5),
        looseDb.from("job_applications").select("id", { count: "exact", head: true }).eq("developer_id", id).eq("status", "pending"),
        workRpc<WorkStats>("work_dashboard_stats").catch(() => null),
      ]);

      let wallet: WalletRow | null = null;
      let legacy: LegacyBalance | null = null;
      if (!walletRes.error) {
        const r = (walletRes.data as Record<string, unknown>[] | null)?.[0] ?? {};
        wallet = { on_hold: num(r["on_hold"]), awaiting_admin: num(r["awaiting_admin"]), available: num(r["available"]), frozen: num(r["frozen"]), requested: num(r["requested"]), paid_out: num(r["paid_out"]) };
      } else {
        // SQL escrow belum dijalankan owner: pakai saldo lama supaya halaman tetap berfungsi.
        const bal = await looseDb.rpc("developer_balance", { _user_id: id });
        legacy = ((bal.data as LegacyBalance[] | null)?.[0]) ?? null;
      }
      return {
        wallet, legacy,
        products: products.count ?? 0, services: services.count ?? 0, repos: repos.count ?? 0, active: active.count ?? 0, apps: apps.count ?? 0,
        recent: (recent.data ?? []) as OrderRow[],
        work: work?.freelancer ?? null,
      };
    },
  });

  const allowed = (s: Sc) => (!s.cap || roleCan(role, s.cap)) && (!s.feature || isFeatureOn(flags, s.feature));
  const shortcuts = SHORTCUTS.filter(allowed);
  const heroLinks = shortcuts.filter((s) => HERO_TOS[role]?.includes(s.to));
  const name = profile?.display_name || profile?.username || "";
  const info = ROLE_INFO[role];
  const canApply = roleCan(role, "lamaran") && isFeatureOn(flags, "jobs");
  const showWallet = role === "developer" || role === "freelancer";

  const wallet = data?.wallet ?? null;
  const legacy = data?.legacy ?? null;
  const available = wallet ? wallet.available : num(legacy?.available);
  const minis: [string, number][] = wallet
    ? [["Ditahan", wallet.on_hold], ["Menunggu admin", wallet.awaiting_admin], ["Sedang dicairkan", wallet.requested], ["Sudah dicairkan", wallet.paid_out]]
    : legacy ? [["Ditahan", num(legacy.on_hold)], ["Sedang dicairkan", num(legacy.pending)], ["Sudah dicairkan", num(legacy.paid_out)]] : [];

  const actions: ActionItem[] = [
    { key: "orders", to: "/pesanan", label: "Pesanan perlu kamu proses", Icon: Receipt, count: data?.active },
    ...(canApply ? [{ key: "apps", to: "/studio/lamaran", label: "Lamaranmu menunggu jawaban", Icon: Briefcase, count: data?.apps }] : []),
    ...(showWallet ? [{ key: "payout", to: "/studio/saldo", label: "Saldo siap ditarik", Icon: Wallet, count: available >= MIN_PAYOUT ? 1 : 0, valueLabel: rupiah(available) }] : []),
  ];

  const steps: Step[] = !data ? [] : role === "developer"
    ? [
        { key: "repo", label: "Buat repositori pertama", to: "/new", done: data.repos > 0 },
        { key: "karya", label: "Terbitkan karya untuk dijual", to: "/studio/karya", done: data.products > 0 },
        { key: "jasa", label: "Buka jasa pertamamu", to: "/studio/jasa", done: data.services > 0 },
      ]
    : role === "freelancer"
      ? [
          { key: "jasa", label: "Buka jasa pertamamu", to: "/studio/jasa", done: data.services > 0 },
          { key: "lamar", label: "Kirim lamaran pertama", to: "/lowongan", done: num(data.work?.["applications_sent"]) > 0 },
        ]
      : role === "personal"
        ? [{ key: "repo", label: "Buat repositori pertama", to: "/new", done: data.repos > 0 }]
        : [];

  const rating = data?.work?.["rating"];
  const tiles = role === "freelancer"
    ? [
        <StatTile key="jasa" label="Jasa" value={data?.services ?? "—"} Icon={Wrench} to="/studio/jasa" />,
        <StatTile key="apps" label="Lamaran menunggu" value={data?.apps ?? "—"} Icon={Briefcase} to="/studio/lamaran" />,
        <StatTile key="proj" label="Proyek aktif" value={data?.work ? num(data.work["projects_active"]) : "—"} Icon={FileSignature} to="/kerja/kontrak" />,
        <StatTile key="rate" label="Rating" value={rating ? `${rating}` : "Belum ada"} Icon={Star} to="/kerja/profil" />,
      ]
    : role === "personal"
      ? [
          <StatTile key="repo" label="Repositori" value={data?.repos ?? "—"} Icon={BookMarked} to="/$username" params={{ username: profile?.username ?? "" }} />,
          <StatTile key="ord" label="Pesanan perlu aksi" value={data?.active ?? "—"} Icon={Receipt} to="/pesanan" accent={(data?.active ?? 0) > 0} />,
        ]
      : [
          <StatTile key="repo" label="Repositori" value={data?.repos ?? "—"} Icon={BookMarked} to="/$username" params={{ username: profile?.username ?? "" }} />,
          <StatTile key="karya" label="Karya" value={data?.products ?? "—"} Icon={Package} to="/studio/karya" />,
          <StatTile key="jasa" label="Jasa" value={data?.services ?? "—"} Icon={Wrench} to="/studio/jasa" />,
          <StatTile key="ord" label="Pesanan perlu aksi" value={data?.active ?? "—"} Icon={Receipt} to="/pesanan" accent={(data?.active ?? 0) > 0} />,
        ];

  return (
    <div className="space-y-5">
      <SummaryHero
        eyebrow={info.workspaceLabel.toLowerCase()}
        title={`Halo, ${name}`}
        subtitle={info.tagline}
        avatar={profile ? { name: profile.username, url: profile.avatar_url ?? null } : undefined}
      >
        {heroLinks.map((s, i) => (
          <Button key={s.to} asChild variant={i === 0 ? "default" : "outline"} className={i === 0 ? "shadow-glow" : heroOutline}>
            <Link to={s.to}><s.Icon /> {s.label}</Link>
          </Button>
        ))}
      </SummaryHero>

      <StatGrid cols={tiles.length === 2 ? 2 : 4}>{tiles}</StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Perlu tindakan" Icon={Sparkles}>
            <ActionList items={actions} />
          </SectionCard>

          <SectionCard title="Pesanan terbaru" Icon={Receipt} more={<Link to="/pesanan">Semua</Link>}>
            {(data?.recent.length ?? 0) === 0 ? <EmptyHint>Belum ada pesanan masuk.</EmptyHint> : (
              <ul className="mt-1 pb-1">
                {data!.recent.map((o) => (
                  <li key={o.id}>
                    <Link to="/pesanan/$id" params={{ id: o.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{o.title}</span>
                        <span className="block text-xs text-muted-foreground">#{o.number} · {o.amount ? formatRupiah(o.amount) : "—"} · {timeAgo(o.updated_at)}</span>
                      </span>
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Pintasan" Icon={ListChecks}>
            <ShortcutGrid items={shortcuts.slice(0, 8)} />
          </SectionCard>
        </div>

        <div className="order-first min-w-0 space-y-5 xl:order-none">
          {showWallet && (
            <SectionCard title="Saldo" Icon={Wallet} more={<Link to="/studio/saldo">Kelola</Link>}>
              <div className="px-4 pb-4 pt-3">
                <p className="text-xs text-muted-foreground">Tersedia</p>
                <p className="text-3xl font-bold tracking-tight text-primary">{rupiah(available)}</p>
                {minis.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {minis.map(([label, v]) => (
                      <div key={label} className="rounded-xl bg-muted/60 p-2.5">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="text-sm font-semibold">{rupiah(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Button asChild className="mt-4 w-full"><Link to="/studio/saldo"><ArrowUpRight /> Saldo &amp; penarikan</Link></Button>
              </div>
            </SectionCard>
          )}
          <StepsCard steps={steps} Icon={ListChecks} />
        </div>
      </div>
    </div>
  );
}
