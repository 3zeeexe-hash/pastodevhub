import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { BadgeCheck, Ban, ChevronLeft, ChevronRight, Eye, ExternalLink, MoreHorizontal, Search, ShieldCheck, UserCog } from "lucide-react";
import { useAuth, timeAgo } from "@/lib/auth";
import { ago, cnt, DAY, num, rows, sb } from "@/lib/admin-db";
import { useUserActions, type UserRow } from "@/lib/admin-users";
import { cn } from "@/lib/utils";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { UserDetailSheet } from "@/components/admin-user-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/admin/pengguna")({
  head: () => ({ meta: [{ title: "Pengguna — Admin GoBi" }, { name: "robots", content: "noindex" }] }),
  component: UsersPage,
});

const ALink = Link as unknown as ComponentType<{ to: string; params?: Record<string, string>; className?: string; children?: ReactNode }>;

const PAGE = 20;
const COLS = "id,username,display_name,avatar_url,account_type,created_at,is_verified,available_for_hire,headline,location";
const COLS_BASIC = "id,username,display_name,avatar_url,account_type,created_at";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Filter = "all" | "developer" | "client" | "none" | "verified" | "admin" | "banned" | "new";
type Sort = "new" | "old" | "name";
type Ban = { reason: string; created_at: string };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" }, { key: "developer", label: "Developer" }, { key: "client", label: "Client" }, { key: "none", label: "Belum pilih jenis" },
  { key: "verified", label: "Centang biru" }, { key: "admin", label: "Admin" }, { key: "banned", label: "Diblokir" }, { key: "new", label: "Baru 7 hari" },
];

function typeLabel(t: string | null) {
  return t === "developer" ? "Developer" : t === "client" ? "Client" : "Belum memilih";
}

function UsersPage() {
  const { user: me } = useAuth();
  const actions = useUserActions();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setPage(0), [term, filter, sort]);

  const stats = useQuery({
    queryKey: ["admin-users", "stats"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [all, developer, client, none, verified, admin, banned, fresh] = await Promise.all([
        cnt("profiles"),
        cnt("profiles", (q) => q.eq("account_type", "developer")),
        cnt("profiles", (q) => q.eq("account_type", "client")),
        cnt("profiles", (q) => q.is("account_type", null)),
        cnt("profiles", (q) => q.eq("is_verified", true)),
        cnt("user_roles", (q) => q.eq("role", "admin")),
        cnt("user_bans"),
        cnt("profiles", (q) => q.gte("created_at", ago(7 * DAY))),
      ]);
      return { all, developer, client, none, verified, admin, banned, new: fresh } as Record<Filter, number | null>;
    },
  });

  const list = useQuery({
    queryKey: ["admin-users", "list", term, filter, sort, page],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (filter === "admin") ids = (await rows<{ user_id: string }>("user_roles", "user_id", (q) => q.eq("role", "admin"))).map((r) => r.user_id);
      if (filter === "banned") ids = (await rows<{ user_id: string }>("user_bans", "user_id")).map((r) => r.user_id);
      if (ids && ids.length === 0) return { rows: [] as UserRow[], total: 0, admins: new Set<string>(), bans: new Map<string, Ban>() };

      const build = (cols: string) => {
        let qb = sb.from("profiles").select(cols, { count: "exact" });
        if (filter === "developer") qb = qb.eq("account_type", "developer");
        if (filter === "client") qb = qb.eq("account_type", "client");
        if (filter === "none") qb = qb.is("account_type", null);
        if (filter === "verified") qb = qb.eq("is_verified", true);
        if (filter === "new") qb = qb.gte("created_at", ago(7 * DAY));
        if (ids) qb = qb.in("id", ids);
        if (term) qb = UUID_RE.test(term) ? qb.eq("id", term) : qb.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
        qb = sort === "name" ? qb.order("username", { ascending: true }) : qb.order("created_at", { ascending: sort === "old" });
        return qb.range(page * PAGE, page * PAGE + PAGE - 1);
      };
      let res = await build(COLS);
      if (res.error) res = await build(COLS_BASIC); // kolom verifikasi belum diterapkan
      if (res.error) throw new Error(res.error.message);

      const list = (res.data ?? []) as UserRow[];
      const pageIds = list.map((r) => r.id);
      const admins = new Set<string>();
      const bans = new Map<string, Ban>();
      if (pageIds.length) {
        const [roles, banned] = await Promise.all([
          rows<{ user_id: string }>("user_roles", "user_id", (q) => q.eq("role", "admin").in("user_id", pageIds)),
          rows<{ user_id: string; reason: string; created_at: string }>("user_bans", "user_id,reason,created_at", (q) => q.in("user_id", pageIds)),
        ]);
        for (const r of roles) admins.add(r.user_id);
        for (const b of banned) bans.set(b.user_id, { reason: b.reason, created_at: b.created_at });
      }
      return { rows: list, total: (res.count as number | null) ?? list.length, admins, bans };
    },
  });

  const data = list.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold">Pengguna</h2>
        <p className="text-sm text-muted-foreground">Cari, saring, dan kelola semua akun. Klik pengguna untuk melihat profil lengkap dan seluruh aktivitasnya.</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Saring pengguna">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              f.key === "banned" && filter !== f.key && (stats.data?.banned ?? 0) > 0 && "text-destructive",
            )}
          >
            {f.label}
            <span className={cn("rounded-full px-1.5 tabular-nums", filter === f.key ? "bg-white/20" : "bg-background")}>{num(stats.data?.[f.key])}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <form onSubmit={(e) => { e.preventDefault(); setTerm(text.replace(/[%,()_*]/g, " ").trim()); }} className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Cari pengguna"
            value={text}
            onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setTerm(""); }}
            placeholder="Cari username, nama, atau ID akun, lalu tekan Enter…"
            className="pl-9"
          />
        </form>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-[180px]" aria-label="Urutkan"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Terbaru bergabung</SelectItem>
            <SelectItem value="old">Terlama bergabung</SelectItem>
            <SelectItem value="name">Username A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.error && <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm">Gagal memuat pengguna: {(list.error as Error).message}</p>}
      {list.isLoading && <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>}

      {data && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {data.rows.map((u) => {
            const isAdmin = data.admins.has(u.id);
            const ban = data.bans.get(u.id);
            const banned = !!ban;
            const isMe = u.id === me?.id;
            const busy = actions.busy === u.id;
            return (
              <li key={u.id} className={cn("flex items-center gap-2 p-3 transition hover:bg-secondary/40", banned && "bg-destructive/5")}>
                <button type="button" onClick={() => setSelected(u.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Lihat detail @${u.username}`}>
                  <AvatarMini name={u.username} url={u.avatar_url} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold">
                      <span className="truncate">{u.display_name || u.username}</span>
                      <VerifiedBadge verified={!!u.is_verified} size={15} />
                      {isAdmin && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>}
                      {banned && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Diblokir</span>}
                      {isMe && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">Kamu</span>}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      @{u.username} · {typeLabel(u.account_type)}{u.location ? ` · ${u.location}` : ""} · bergabung {timeAgo(u.created_at)}
                    </span>
                    {u.headline && <span className="block truncate text-xs text-muted-foreground">{u.headline}</span>}
                    {banned && <span className="block truncate text-xs text-destructive">Alasan blokir: {ban.reason || "(tidak dicantumkan)"}</span>}
                  </span>
                </button>
                <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => setSelected(u.id)}><Eye /> Detail</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" disabled={busy} aria-label={`Aksi untuk @${u.username}`}><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuItem onClick={() => setSelected(u.id)}><Eye /> Lihat detail dan aktivitas</DropdownMenuItem>
                    <DropdownMenuItem asChild><ALink to="/$username" params={{ username: u.username }}><ExternalLink /> Buka profil publik</ALink></DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {u.account_type === "developer" && (
                      <DropdownMenuItem onClick={() => actions.toggleVerified(u)}><BadgeCheck /> {u.is_verified ? "Cabut centang biru" : "Beri centang biru"}</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => actions.setType(u, u.account_type === "developer" ? "client" : "developer")}><UserCog /> Jadikan {u.account_type === "developer" ? "Client" : "Developer"}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={isMe} onClick={() => actions.toggleAdmin(u, isAdmin)}><ShieldCheck /> {isAdmin ? "Cabut role admin" : "Jadikan admin"}</DropdownMenuItem>
                    <DropdownMenuItem disabled={isMe} className={banned ? "" : "text-destructive focus:text-destructive"} onClick={() => actions.toggleBan(u, banned)}><Ban /> {banned ? "Buka blokir" : "Blokir akun"}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
          {data.rows.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">
              Tidak ada pengguna{term ? ` untuk “${term}”` : ""}{filter !== "all" ? ` pada filter “${FILTERS.find((f) => f.key === filter)?.label}”` : ""}.
            </li>
          )}
        </ul>
      )}

      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Menampilkan {page * PAGE + 1}–{Math.min((page + 1) * PAGE, data.total)} dari {num(data.total)} akun · halaman {page + 1} dari {pages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || list.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft /> Sebelumnya</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages || list.isFetching} onClick={() => setPage((p) => p + 1)}>Berikutnya <ChevronRight /></Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Akun yang diblokir langsung tidak bisa membuka halaman GoBi apa pun dan melihat alasan blokirnya. Admin tidak bisa memblokir atau mencabut role dirinya sendiri.
      </p>

      <UserDetailSheet userId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
