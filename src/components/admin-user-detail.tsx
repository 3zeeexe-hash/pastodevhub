/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Ban, Briefcase, Code2, Copy, ExternalLink, Flag, MessageCircle, Newspaper, ShieldCheck, Shield, UserCog, Wallet, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { timeAgo, useAuth } from "@/lib/auth";
import { formatRupiah } from "@/lib/market";
import { CONTRACT_STATUS_LABEL, type ContractStatus } from "@/lib/work";
import { cnt, num, rows, sb } from "@/lib/admin-db";
import { useUserActions } from "@/lib/admin-users";
import { cn } from "@/lib/utils";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { VerifiedTierButton } from "@/components/verified-tier-menu";
import { TIER_META, asTier, type VerifiedTier } from "@/lib/verification-tier";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ALink = Link as unknown as ComponentType<{ to: string; params?: Record<string, string>; className?: string; children?: ReactNode }>;
const rp = (n: number | null | undefined) => (n == null ? "—" : formatRupiah(n, "Rp0"));
const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—");
const clip = (s: unknown, n = 100) => String(s ?? "").replace(/\s+/g, " ").slice(0, n) || "(tanpa teks)";

type Item = { id: string; title: string; sub?: string; right?: string; to?: string; params?: Record<string, string> };
type Group = "konten" | "kode" | "transaksi" | "kerja" | "pesan" | "moderasi";
type Ev = Item & { at: string; group: Group };

const GROUP_ICON: Record<Group, LucideIcon> = { konten: Newspaper, kode: Code2, transaksi: Wallet, kerja: Briefcase, pesan: MessageCircle, moderasi: Flag };
const GROUP_TONE: Record<Group, string> = {
  konten: "bg-secondary text-muted-foreground",
  kode: "bg-sky-500/15 text-sky-600",
  transaksi: "bg-emerald-500/15 text-emerald-600",
  kerja: "bg-primary/15 text-primary",
  pesan: "bg-violet-500/15 text-violet-600",
  moderasi: "bg-amber-500/15 text-amber-600",
};
const GROUPS: { key: "all" | Group; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "konten", label: "Konten" }, { key: "kode", label: "Kode" }, { key: "transaksi", label: "Transaksi" },
  { key: "kerja", label: "GOBI Work" }, { key: "pesan", label: "Chat" }, { key: "moderasi", label: "Moderasi" },
];

function Mini({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-lg font-extrabold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-extrabold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ItemList({ items, empty }: { items: Item[]; empty: string }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
      {items.map((it) => {
        const body = (
          <div className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{it.title}</p>
              {it.sub && <p className="truncate text-xs text-muted-foreground">{it.sub}</p>}
            </div>
            {it.right && <span className="shrink-0 text-xs text-muted-foreground">{it.right}</span>}
          </div>
        );
        return <li key={it.id}>{it.to ? <ALink to={it.to} params={it.params} className="block hover:bg-secondary/50">{body}</ALink> : body}</li>;
      })}
    </ul>
  );
}

const Loading = () => <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>;

export function UserDetailSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { user: me } = useAuth();
  const actions = useUserActions();
  const [tab, setTab] = useState("profil");
  const [group, setGroup] = useState<"all" | Group>("all");
  const [limit, setLimit] = useState(30);
  useEffect(() => { setTab("profil"); setGroup("all"); setLimit(30); }, [userId]);

  const profileQ = useQuery({
    queryKey: ["admin-user", userId, "profile"],
    enabled: !!userId,
    queryFn: async () => {
      const p = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (p.error) throw new Error(p.error.message);
      if (!p.data) throw new Error("Akun tidak ditemukan.");
      const [roles, ban, wp] = await Promise.all([
        sb.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
        sb.from("user_bans").select("reason,created_at,banned_by").eq("user_id", userId).maybeSingle(),
        sb.from("work_profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      let bannedBy: string | null = null;
      if (ban.data?.banned_by) {
        const b = await sb.from("profiles").select("username").eq("id", ban.data.banned_by).maybeSingle();
        bannedBy = b.data?.username ?? null;
      }
      return { p: p.data as any, isAdmin: (roles.data ?? []).length > 0, ban: (ban.data ?? null) as { reason: string; created_at: string } | null, bannedBy, wp: (wp.data ?? null) as any };
    },
  });

  const countsQ = useQuery({
    queryKey: ["admin-user", userId, "counts"],
    enabled: !!userId,
    queryFn: async () => {
      const id = userId!;
      const or2 = (a: string, b: string) => (q: any) => q.or(`${a}.eq.${id},${b}.eq.${id}`);
      const [followers, following, repos, commits, stars, posts, issues, prs, products, services, jobs, apps, buy, sell, contracts, dm, ratings, filed, againstFeed, againstWork, filedWork] = await Promise.all([
        cnt("follows", (q) => q.eq("following_id", id)),
        cnt("follows", (q) => q.eq("follower_id", id)),
        cnt("repositories", (q) => q.eq("owner_id", id)),
        cnt("commits", (q) => q.eq("author_id", id)),
        cnt("stars", (q) => q.eq("user_id", id)),
        cnt("feed_posts", (q) => q.eq("author_id", id)),
        cnt("issues", (q) => q.eq("author_id", id)),
        cnt("pull_requests", (q) => q.eq("author_id", id)),
        cnt("products", (q) => q.eq("owner_id", id)),
        cnt("services", (q) => q.eq("owner_id", id)),
        cnt("jobs", (q) => q.eq("client_id", id)),
        cnt("job_applications", (q) => q.eq("developer_id", id)),
        cnt("orders", (q) => q.eq("buyer_id", id)),
        cnt("orders", (q) => q.eq("seller_id", id)),
        cnt("work_contracts", or2("client_id", "freelancer_id")),
        cnt("dm_messages", (q) => q.eq("sender_id", id)),
        rows<{ rating: number }>("work_reviews", "rating", (q) => q.eq("reviewee_id", id).limit(500)),
        cnt("feed_reports", (q) => q.eq("reporter_id", id)),
        cnt("feed_reports", (q) => q.eq("author_id", id)),
        cnt("work_reports", (q) => q.eq("target_id", id)),
        cnt("work_reports", (q) => q.eq("reporter_id", id)),
      ]);
      return {
        followers, following, repos, commits, stars, posts, issues, prs, products, services, jobs, apps, buy, sell, contracts, dm,
        reviews: ratings.length, avg: ratings.length ? ratings.reduce((a, r) => a + Number(r.rating), 0) / ratings.length : null,
        filed: (filed ?? 0) + (filedWork ?? 0), against: (againstFeed ?? 0) + (againstWork ?? 0),
      };
    },
  });

  const username: string | undefined = profileQ.data?.p?.username;

  const timelineQ = useQuery({
    queryKey: ["admin-user", userId, "timeline"],
    enabled: !!userId && !!username && tab === "aktivitas",
    queryFn: async () => {
      const id = userId!;
      const mine = (col: string, key = "created_at") => (q: any) => q.eq(col, id).order(key, { ascending: false }).limit(25);
      const both = (a: string, b: string, key = "created_at") => (q: any) => q.or(`${a}.eq.${id},${b}.eq.${id}`).order(key, { ascending: false }).limit(25);
      const [posts, repos, commits, issues, prs, products, services, orders, payouts, jobs, apps, contracts, reviews, orderMsgs, jobMsgs, verifs, filed, against, audit] = await Promise.all([
        rows<any>("feed_posts", "id,body,created_at,parent_id,like_count,reply_count", mine("author_id")),
        rows<any>("repositories", "id,name,created_at,is_private,language", mine("owner_id")),
        rows<any>("commits", "id,message,created_at,repo:repositories(name)", mine("author_id")),
        rows<any>("issues", "id,number,title,state,created_at,repo:repositories(name)", mine("author_id")),
        rows<any>("pull_requests", "id,number,title,state,created_at,repo:repositories!pull_requests_repo_id_fkey(name)", mine("author_id")),
        rows<any>("products", "id,title,price,is_published,created_at", mine("owner_id")),
        rows<any>("services", "id,title,price_from,is_active,created_at", mine("owner_id")),
        rows<any>("orders", "id,number,title,status,amount,created_at,buyer_id", both("buyer_id", "seller_id")),
        rows<any>("payouts", "id,amount,status,created_at", mine("developer_id")),
        rows<any>("jobs", "id,title,status,category,created_at", mine("client_id")),
        rows<any>("job_applications", "id,job_id,status,bid_amount,created_at,job:jobs(title)", mine("developer_id")),
        rows<any>("work_contracts", "id,title,status,total_amount,updated_at,client_id", both("client_id", "freelancer_id", "updated_at")),
        rows<any>("work_reviews", "id,rating,comment,created_at", mine("reviewer_id")),
        rows<any>("order_messages", "id,body,created_at,order_id,order:orders(number,title)", (q) => q.eq("sender_id", id).eq("is_system", false).order("created_at", { ascending: false }).limit(25)),
        rows<any>("job_messages", "id,body,created_at,application:job_applications(job:jobs(title))", mine("sender_id")),
        rows<any>("verification_requests", "id,status,created_at", mine("user_id")),
        rows<any>("feed_reports", "id,reason,created_at", mine("reporter_id")),
        rows<any>("feed_reports", "id,reason,created_at", mine("author_id")),
        rows<any>("admin_audit_log", "id,admin_label,action,note,created_at", mine("target_id")),
      ]);
      const out: Ev[] = [
        ...posts.map((r): Ev => ({ id: `p${r.id}`, at: r.created_at, group: "konten", title: r.parent_id ? "Membalas di feed" : "Memposting di feed", sub: `${clip(r.body)} · ${r.like_count} suka · ${r.reply_count} balasan`, to: "/gobifeed/status/$id", params: { id: r.id } })),
        ...products.map((r): Ev => ({ id: `k${r.id}`, at: r.created_at, group: "konten", title: `Menambah karya · ${r.title}`, sub: `${r.is_published ? "Terbit" : "Draf"} · ${rp(r.price)}`, to: "/karya/$id", params: { id: r.id } })),
        ...services.map((r): Ev => ({ id: `s${r.id}`, at: r.created_at, group: "konten", title: `Menambah jasa · ${r.title}`, sub: `${r.is_active ? "Aktif" : "Nonaktif"} · mulai ${rp(r.price_from)}`, to: "/jasa/$id", params: { id: r.id } })),
        ...repos.map((r): Ev => ({ id: `r${r.id}`, at: r.created_at, group: "kode", title: `Membuat repositori ${r.name}`, sub: `${r.is_private ? "Privat" : "Publik"}${r.language ? ` · ${r.language}` : ""}`, to: "/$username/$repo", params: { username: username!, repo: r.name } })),
        ...commits.map((r): Ev => ({ id: `m${r.id}`, at: r.created_at, group: "kode", title: `Commit di ${r.repo?.name ?? "repositori"}`, sub: clip(r.message) })),
        ...issues.map((r): Ev => ({ id: `i${r.id}`, at: r.created_at, group: "kode", title: `Membuka issue #${r.number} di ${r.repo?.name ?? "repositori"}`, sub: `${r.title} · ${r.state}` })),
        ...prs.map((r): Ev => ({ id: `q${r.id}`, at: r.created_at, group: "kode", title: `Membuka pull request #${r.number} di ${r.repo?.name ?? "repositori"}`, sub: `${r.title} · ${r.state}` })),
        ...orders.map((r): Ev => ({ id: `o${r.id}`, at: r.created_at, group: "transaksi", title: `${r.buyer_id === id ? "Memesan" : "Menerima pesanan"} #${r.number} · ${r.title}`, sub: `${r.status} · ${rp(r.amount)}`, to: "/pesanan/$id", params: { id: r.id } })),
        ...payouts.map((r): Ev => ({ id: `w${r.id}`, at: r.created_at, group: "transaksi", title: `Mengajukan pencairan ${rp(r.amount)}`, sub: `Status: ${r.status}`, to: "/admin/pembayaran" })),
        ...jobs.map((r): Ev => ({ id: `j${r.id}`, at: r.created_at, group: "kerja", title: `Memasang lowongan · ${r.title}`, sub: `${r.category} · ${r.status}`, to: "/lowongan/$id", params: { id: r.id } })),
        ...apps.map((r): Ev => ({ id: `a${r.id}`, at: r.created_at, group: "kerja", title: `Melamar · ${r.job?.title ?? "lowongan"}`, sub: `Tawaran ${rp(r.bid_amount)} · ${r.status}`, to: "/lowongan/$id", params: { id: r.job_id } })),
        ...contracts.map((r): Ev => ({ id: `c${r.id}`, at: r.updated_at, group: "kerja", title: `Kontrak · ${r.title}`, sub: `${r.client_id === id ? "Sebagai client" : "Sebagai freelancer"} · ${CONTRACT_STATUS_LABEL[r.status as ContractStatus] ?? r.status} · ${rp(r.total_amount)}`, to: "/kerja/kontrak/$id", params: { id: r.id } })),
        ...reviews.map((r): Ev => ({ id: `v${r.id}`, at: r.created_at, group: "kerja", title: `Memberi ulasan ★ ${r.rating}`, sub: clip(r.comment) })),
        ...orderMsgs.map((r): Ev => ({ id: `om${r.id}`, at: r.created_at, group: "pesan", title: `Chat pesanan #${r.order?.number ?? ""} · ${r.order?.title ?? ""}`, sub: clip(r.body), to: "/pesanan/$id", params: { id: r.order_id } })),
        ...jobMsgs.map((r): Ev => ({ id: `jm${r.id}`, at: r.created_at, group: "pesan", title: `Chat lamaran · ${r.application?.job?.title ?? "lowongan"}`, sub: clip(r.body) })),
        ...verifs.map((r): Ev => ({ id: `vr${r.id}`, at: r.created_at, group: "moderasi", title: "Mengajukan verifikasi developer", sub: `Status: ${r.status}`, to: "/admin/verifikasi" })),
        ...filed.map((r): Ev => ({ id: `rf${r.id}`, at: r.created_at, group: "moderasi", title: "Melaporkan sebuah konten", sub: String(r.reason ?? ""), to: "/admin/laporan" })),
        ...against.map((r): Ev => ({ id: `ra${r.id}`, at: r.created_at, group: "moderasi", title: "Kontennya dilaporkan", sub: String(r.reason ?? ""), to: "/admin/laporan" })),
        ...audit.map((r): Ev => ({ id: `ad${r.id}`, at: r.created_at, group: "moderasi", title: `Admin ${r.admin_label ?? ""}: ${r.action}`, sub: r.note ?? "Tindakan admin atas akun ini", to: "/admin/pantau" })),
      ];
      return out.filter((e) => e.at).sort((a, b) => +new Date(b.at) - +new Date(a.at));
    },
  });

  const moneyQ = useQuery({
    queryKey: ["admin-user", userId, "keuangan"],
    enabled: !!userId && tab === "keuangan",
    queryFn: async () => {
      const id = userId!;
      const [wallet, orders, payouts] = await Promise.all([
        sb.rpc("developer_wallet", { _user_id: id }),
        rows<any>("orders", "id,number,title,status,amount,created_at,buyer_id", (q) => q.or(`buyer_id.eq.${id},seller_id.eq.${id}`).order("created_at", { ascending: false }).limit(100)),
        rows<any>("payouts", "id,amount,status,bank_name,account_number,account_name,created_at,processed_at,admin_note", (q) => q.eq("developer_id", id).order("created_at", { ascending: false }).limit(50)),
      ]);
      const w = wallet.error ? null : ((wallet.data ?? [])[0] ?? null);
      return {
        wallet: w as Record<string, number> | null,
        spent: orders.filter((o) => o.buyer_id === id).reduce((a, o) => a + Number(o.amount), 0),
        earned: orders.filter((o) => o.buyer_id !== id).reduce((a, o) => a + Number(o.amount), 0),
        orders, payouts,
      };
    },
  });

  const modQ = useQuery({
    queryKey: ["admin-user", userId, "moderasi"],
    enabled: !!userId && tab === "moderasi",
    queryFn: async () => {
      const id = userId!;
      const [verifs, filedFeed, filedWork, againstFeed, againstWork, audit] = await Promise.all([
        rows<any>("verification_requests", "id,status,message,admin_note,created_at,reviewed_at", (q) => q.eq("user_id", id).order("created_at", { ascending: false }).limit(20)),
        rows<any>("feed_reports", "id,reason,note,status,created_at", (q) => q.eq("reporter_id", id).order("created_at", { ascending: false }).limit(20)),
        rows<any>("work_reports", "id,reason,detail,status,target_type,created_at", (q) => q.eq("reporter_id", id).order("created_at", { ascending: false }).limit(20)),
        rows<any>("feed_reports", "id,reason,note,status,snapshot,created_at", (q) => q.eq("author_id", id).order("created_at", { ascending: false }).limit(20)),
        rows<any>("work_reports", "id,reason,detail,status,target_type,created_at", (q) => q.eq("target_id", id).order("created_at", { ascending: false }).limit(20)),
        rows<any>("admin_audit_log", "id,admin_label,action,note,created_at", (q) => q.eq("target_id", id).order("created_at", { ascending: false }).limit(50)),
      ]);
      return { verifs, filedFeed, filedWork, againstFeed, againstWork, audit };
    },
  });

  const d = profileQ.data;
  const p = d?.p;
  /** Tingkat centang akun ini; centang lama tanpa tingkat dianggap biru. */
  const tier: VerifiedTier | null = p ? asTier(p.verified_tier) ?? (p.is_verified ? "verified" : null) : null;
  const c = countsQ.data;
  const isMe = !!userId && userId === me?.id;
  const banned = !!d?.ban;
  const busy = actions.busy === userId;
  const shown = (timelineQ.data ?? []).filter((e) => group === "all" || e.group === group);

  return (
    <Sheet open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="space-y-3 border-b border-border p-5 text-left">
          {profileQ.isLoading && <Skeleton className="h-16" />}
          {profileQ.error && <p role="alert" className="text-sm text-destructive">{(profileQ.error as Error).message}</p>}
          {p && (
            <>
              <div className="flex items-start gap-3">
                <AvatarMini name={p.username} url={p.avatar_url} size={56} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-lg">
                    <span className="truncate">{p.display_name || p.username}</span>
                    <VerifiedBadge tier={tier} verified={!!tier} size={16} />
                    {d.isAdmin && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>}
                    {banned && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Diblokir</span>}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-xs">
                    @{p.username} · {p.account_type === "developer" ? "Developer" : p.account_type === "client" ? "Client" : "Belum memilih jenis akun"} · bergabung {timeAgo(p.created_at)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><ALink to="/$username" params={{ username: p.username }}><ExternalLink /> Profil publik</ALink></Button>
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(p.id); toast.success("ID akun disalin"); }}><Copy /> Salin ID</Button>
                <VerifiedTierButton current={tier} disabled={busy} onPick={(t) => actions.setTier({ id: p.id }, t)} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.setType({ id: p.id }, p.account_type === "developer" ? "client" : "developer")}><UserCog /> Jadikan {p.account_type === "developer" ? "Client" : "Developer"}</Button>
                <Button size="sm" variant="outline" disabled={busy || isMe} onClick={() => actions.toggleAdmin({ id: p.id, username: p.username }, d.isAdmin)}>{d.isAdmin ? <Shield /> : <ShieldCheck />} {d.isAdmin ? "Cabut admin" : "Jadikan admin"}</Button>
                <Button size="sm" variant={banned ? "outline" : "destructive"} disabled={busy || isMe} onClick={() => actions.toggleBan({ id: p.id, username: p.username }, banned)}><Ban /> {banned ? "Buka blokir" : "Blokir akun"}</Button>
              </div>
              {isMe && <p className="text-xs text-muted-foreground">Ini akunmu sendiri, jadi blokir dan role admin tidak bisa diubah dari sini.</p>}
            </>
          )}
        </SheetHeader>

        {p && (
          <div className="p-5">
            {banned && d.ban && (
              <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm ring-1 ring-destructive/30">
                <p className="font-semibold text-destructive">Akun ini sedang diblokir dan tidak bisa membuka halaman GoBi.</p>
                <p className="mt-1">Alasan: {d.ban.reason || "(tidak dicantumkan)"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sejak {when(d.ban.created_at)}{d.bannedBy ? ` oleh @${d.bannedBy}` : ""}</p>
              </div>
            )}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="profil">Profil</TabsTrigger>
                <TabsTrigger value="aktivitas">Semua aktivitas</TabsTrigger>
                <TabsTrigger value="keuangan">Keuangan</TabsTrigger>
                <TabsTrigger value="moderasi">Moderasi</TabsTrigger>
              </TabsList>

              <TabsContent value="profil" className="mt-4 space-y-6">
                <Block title="Identitas">
                  <dl className="grid gap-x-4 gap-y-2 rounded-xl bg-card p-4 text-sm ring-1 ring-border sm:grid-cols-2">
                    {([
                      ["Nama tampilan", p.display_name], ["Username", `@${p.username}`], ["Headline", p.headline], ["Perusahaan", p.company],
                      ["Lokasi", p.location], ["Bergabung", when(p.created_at)], ["Tersedia untuk kerja", p.available_for_hire ? "Ya" : "Tidak"],
                      ["Centang verifikasi", tier ? `${TIER_META[tier].label} (centang ${TIER_META[tier].colorName})${p.verified_at ? `, sejak ${new Date(p.verified_at).toLocaleDateString("id-ID")}` : ""}` : "Belum"],
                    ] as [string, string | null][]).map(([k, v]) => (
                      <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{v || "—"}</dd></div>
                    ))}
                    <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Bio</dt><dd className="whitespace-pre-wrap break-words">{p.bio || "—"}</dd></div>
                    {p.website && <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Website</dt><dd className="break-all"><a href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer noopener" className="text-link hover:underline">{p.website}</a></dd></div>}
                    {!!p.skills?.length && (
                      <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Keahlian</dt><dd className="mt-1 flex flex-wrap gap-1.5">{p.skills.map((s: string) => <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{s}</span>)}</dd></div>
                    )}
                    {d.wp && (
                      <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Profil GOBI Work</dt><dd>{[d.wp.experience_level, d.wp.availability, d.wp.hourly_rate ? `${rp(Number(d.wp.hourly_rate))}/jam` : null].filter(Boolean).join(" · ") || "—"}</dd></div>
                    )}
                  </dl>
                </Block>

                <Block title="Ringkasan aktivitas" hint="Jumlah total sepanjang akun ini ada.">
                  {countsQ.isLoading ? <Loading /> : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Mini label="Pengikut" value={num(c?.followers)} />
                      <Mini label="Mengikuti" value={num(c?.following)} />
                      <Mini label="Postingan feed" value={num(c?.posts)} />
                      <Mini label="Repositori" value={num(c?.repos)} />
                      <Mini label="Commit" value={num(c?.commits)} />
                      <Mini label="Issue / PR" value={`${num(c?.issues)} / ${num(c?.prs)}`} />
                      <Mini label="Bintang diberikan" value={num(c?.stars)} />
                      <Mini label="Karya" value={num(c?.products)} />
                      <Mini label="Jasa" value={num(c?.services)} />
                      <Mini label="Lowongan dipasang" value={num(c?.jobs)} />
                      <Mini label="Lamaran dikirim" value={num(c?.apps)} />
                      <Mini label="Kontrak" value={num(c?.contracts)} />
                      <Mini label="Pesanan sebagai pembeli" value={num(c?.buy)} />
                      <Mini label="Pesanan sebagai penjual" value={num(c?.sell)} />
                      <Mini label="Ulasan diterima" value={num(c?.reviews)} hint={c?.avg != null ? `Rata-rata ★ ${c.avg.toFixed(1)}` : undefined} />
                      <Mini label="Pesan pribadi terkirim" value={num(c?.dm)} hint="Isi pesan bersifat pribadi" />
                      <Mini label="Laporan yang dibuat" value={num(c?.filed)} />
                      <Mini label="Laporan terhadapnya" value={num(c?.against)} />
                    </div>
                  )}
                </Block>
              </TabsContent>

              <TabsContent value="aktivitas" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">Gabungan kejadian terbaru dari akun ini (maksimal 25 terbaru per jenis). Isi pesan pribadi antar pengguna tidak ditampilkan.</p>
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Saring aktivitas">
                  {GROUPS.map((g) => (
                    <button key={g.key} type="button" role="tab" aria-selected={group === g.key} onClick={() => { setGroup(g.key); setLimit(30); }}
                      className={cn("rounded-full px-3 py-1 text-xs font-medium transition", group === g.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{g.label}</button>
                  ))}
                </div>
                {timelineQ.isLoading && <Loading />}
                {!timelineQ.isLoading && shown.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Belum ada aktivitas untuk filter ini.</p>}
                <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border">
                  {shown.slice(0, limit).map((e) => {
                    const Icon = GROUP_ICON[e.group];
                    const row = (
                      <div className="flex items-start gap-3 px-3 py-2.5">
                        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", GROUP_TONE[e.group])}><Icon className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          {e.sub && <p className="truncate text-xs text-muted-foreground">{e.sub}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground" title={when(e.at)}>{timeAgo(e.at)}</span>
                      </div>
                    );
                    return <li key={e.id}>{e.to ? <ALink to={e.to} params={e.params} className="block hover:bg-secondary/50">{row}</ALink> : row}</li>;
                  })}
                </ul>
                {shown.length > limit && <Button variant="outline" size="sm" className="w-full" onClick={() => setLimit((n) => n + 30)}>Tampilkan lebih banyak ({shown.length - limit} lagi)</Button>}
              </TabsContent>

              <TabsContent value="keuangan" className="mt-4 space-y-6">
                {moneyQ.isLoading ? <Loading /> : moneyQ.data && (
                  <>
                    <Block title="Saldo developer" hint="Dihitung dari penjualan dan pencairan akun ini.">
                      {moneyQ.data.wallet ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Mini label="Tersedia" value={rp(Number(moneyQ.data.wallet.available))} />
                          <Mini label="Ditahan" value={rp(Number(moneyQ.data.wallet.on_hold))} />
                          <Mini label="Menunggu admin" value={rp(Number(moneyQ.data.wallet.awaiting_admin))} />
                          <Mini label="Dibekukan" value={rp(Number(moneyQ.data.wallet.frozen))} />
                          <Mini label="Pencairan diajukan" value={rp(Number(moneyQ.data.wallet.requested))} />
                          <Mini label="Sudah dicairkan" value={rp(Number(moneyQ.data.wallet.paid_out))} />
                        </div>
                      ) : <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Data saldo tidak tersedia untuk akun ini.</p>}
                    </Block>
                    <div className="grid grid-cols-2 gap-2">
                      <Mini label="Total belanja (100 pesanan terakhir)" value={rp(moneyQ.data.spent)} />
                      <Mini label="Total penjualan (100 pesanan terakhir)" value={rp(moneyQ.data.earned)} />
                    </div>
                    <Block title="Pesanan" hint="Sebagai pembeli maupun penjual">
                      <ItemList empty="Belum ada pesanan." items={moneyQ.data.orders.map((o: any) => ({ id: o.id, title: `#${o.number} · ${o.title}`, sub: `${o.buyer_id === userId ? "Pembeli" : "Penjual"} · ${o.status}`, right: `${rp(o.amount)} · ${timeAgo(o.created_at)}`, to: "/pesanan/$id", params: { id: o.id } }))} />
                    </Block>
                    <Block title="Pencairan dana">
                      <ItemList empty="Belum pernah mengajukan pencairan." items={moneyQ.data.payouts.map((o: any) => ({ id: o.id, title: `${rp(o.amount)} · ${o.status}`, sub: `${o.bank_name} ${o.account_number} a.n. ${o.account_name}${o.admin_note ? ` · Catatan: ${o.admin_note}` : ""}`, right: timeAgo(o.created_at), to: "/admin/pembayaran" }))} />
                    </Block>
                  </>
                )}
              </TabsContent>

              <TabsContent value="moderasi" className="mt-4 space-y-6">
                {modQ.isLoading ? <Loading /> : modQ.data && (
                  <>
                    <Block title="Tindakan admin atas akun ini" hint="Blokir, verifikasi, perubahan role, dan lainnya">
                      <ItemList empty="Belum ada tindakan admin." items={modQ.data.audit.map((r: any) => ({ id: String(r.id), title: `${r.admin_label ?? "admin"} · ${r.action}`, sub: r.note ?? undefined, right: timeAgo(r.created_at) }))} />
                    </Block>
                    <Block title="Laporan terhadap akun ini">
                      <ItemList empty="Tidak ada laporan terhadap akun ini." items={[
                        ...modQ.data.againstFeed.map((r: any) => ({ id: `f${r.id}`, title: `Konten dilaporkan · ${r.reason}`, sub: `${r.status}${r.snapshot ? ` · ${clip(r.snapshot, 80)}` : ""}`, right: timeAgo(r.created_at), to: "/admin/laporan" })),
                        ...modQ.data.againstWork.map((r: any) => ({ id: `w${r.id}`, title: `Laporan GOBI Work · ${r.reason}`, sub: `${r.status}${r.detail ? ` · ${clip(r.detail, 80)}` : ""}`, right: timeAgo(r.created_at), to: "/admin/kerja" })),
                      ]} />
                    </Block>
                    <Block title="Laporan yang dibuat akun ini">
                      <ItemList empty="Belum pernah membuat laporan." items={[
                        ...modQ.data.filedFeed.map((r: any) => ({ id: `f${r.id}`, title: `Laporan konten · ${r.reason}`, sub: `${r.status}${r.note ? ` · ${clip(r.note, 80)}` : ""}`, right: timeAgo(r.created_at), to: "/admin/laporan" })),
                        ...modQ.data.filedWork.map((r: any) => ({ id: `w${r.id}`, title: `Laporan ${r.target_type} · ${r.reason}`, sub: `${r.status}${r.detail ? ` · ${clip(r.detail, 80)}` : ""}`, right: timeAgo(r.created_at), to: "/admin/kerja" })),
                      ]} />
                    </Block>
                    <Block title="Pengajuan verifikasi developer">
                      <ItemList empty="Belum pernah mengajukan verifikasi." items={modQ.data.verifs.map((r: any) => ({ id: r.id, title: `Status: ${r.status}`, sub: `${clip(r.message, 90)}${r.admin_note ? ` · Catatan admin: ${r.admin_note}` : ""}`, right: timeAgo(r.created_at), to: "/admin/verifikasi" }))} />
                    </Block>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
