import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, MoreHorizontal, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/admin/pengguna")({
  head: () => ({ meta: [{ title: "Pengguna — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: UsersPage,
});

type UserRow = { id: string; username: string; display_name: string | null; avatar_url: string | null; account_type: string | null; created_at: string; is_verified?: boolean | null };
const COLS = "id,username,display_name,avatar_url,account_type,created_at";

// Verification columns and functions are not in the generated types until the database change is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function UsersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", term],
    queryFn: async () => {
      const find = (cols: string) => {
        let qb = sb.from("profiles").select(cols).order("created_at", { ascending: false }).limit(50);
        if (term) qb = qb.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
        return qb;
      };
      let res = await find(`${COLS},is_verified`);
      if (res.error) res = await find(COLS); // verification column not applied yet
      const rows = (res.data ?? []) as UserRow[];
      const ids = rows.map((r) => r.id);
      const admins = new Set<string>();
      const bans = new Map<string, string>();
      if (ids.length) {
        const [roles, banned] = await Promise.all([
          sb.from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids),
          sb.from("user_bans").select("user_id,reason").in("user_id", ids),
        ]);
        for (const r of (roles.data ?? []) as { user_id: string }[]) admins.add(r.user_id);
        for (const b of (banned.data ?? []) as { user_id: string; reason: string }[]) bans.set(b.user_id, b.reason);
      }
      return { rows, admins, bans };
    },
  });

  async function act(id: string, ok: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(id);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["verified-usernames"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  function toggleVerified(u: UserRow) {
    return act(u.id, u.is_verified ? "Centang biru dicabut" : "Developer diverifikasi", () => sb.rpc("admin_set_verified", { _user: u.id, _verified: !u.is_verified }));
  }
  function toggleBan(u: UserRow, banned: boolean) {
    if (banned) return act(u.id, "Blokir dibuka", () => supabase.rpc("admin_set_ban", { _user: u.id, _banned: false, _reason: "" }));
    const reason = prompt(`Alasan memblokir @${u.username}? (boleh kosong)`);
    if (reason === null) return;
    return act(u.id, "Akun diblokir", () => supabase.rpc("admin_set_ban", { _user: u.id, _banned: true, _reason: reason }));
  }
  function toggleAdmin(u: UserRow, isAdmin: boolean) {
    const msg = isAdmin ? `Cabut role admin dari @${u.username}?` : `Jadikan @${u.username} admin? Admin bisa mengatur seluruh situs.`;
    if (!confirm(msg)) return;
    return act(u.id, isAdmin ? "Role admin dicabut" : "Dijadikan admin", () => supabase.rpc("admin_set_admin", { _user: u.id, _admin: !isAdmin }));
  }
  function setType(u: UserRow, type: "developer" | "client") {
    return act(u.id, `Jenis akun diubah ke ${type === "developer" ? "Developer" : "Client"}`, () => supabase.from("profiles").update({ account_type: type }).eq("id", u.id));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setTerm(text.replace(/[%,()_*]/g, " ").trim()); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari username atau nama…" className="pl-9" />
      </form>
      {isLoading && <p className="text-muted-foreground">Memuat…</p>}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {data?.rows.map((u) => {
          const isAdmin = data.admins.has(u.id);
          const banned = data.bans.has(u.id);
          const me = u.id === user?.id;
          return (
            <li key={u.id} className="flex items-center gap-3 p-3">
              <AvatarMini name={u.username} url={u.avatar_url} size={40} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold">
                  <Link to="/$username" params={{ username: u.username }} className="truncate hover:underline">{u.display_name || u.username}</Link>
                  <VerifiedBadge verified={!!u.is_verified} size={15} />
                  {isAdmin && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>}
                  {banned && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Diblokir</span>}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  @{u.username} · {u.account_type === "developer" ? "Developer" : u.account_type === "client" ? "Client" : "Belum memilih"} · {timeAgo(u.created_at)}
                </p>
                {banned && data.bans.get(u.id) && <p className="mt-0.5 text-xs text-muted-foreground">Alasan: {data.bans.get(u.id)}</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" disabled={busy === u.id} aria-label={`Aksi untuk @${u.username}`}><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {u.account_type === "developer" && (
                    <DropdownMenuItem onClick={() => toggleVerified(u)}><BadgeCheck /> {u.is_verified ? "Cabut centang biru" : "Beri centang biru"}</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setType(u, u.account_type === "developer" ? "client" : "developer")}>
                    Jadikan {u.account_type === "developer" ? "Client" : "Developer"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={me} onClick={() => toggleAdmin(u, isAdmin)}>{isAdmin ? "Cabut role admin" : "Jadikan admin"}</DropdownMenuItem>
                  <DropdownMenuItem disabled={me} className={banned ? "" : "text-destructive"} onClick={() => toggleBan(u, banned)}>{banned ? "Buka blokir" : "Blokir akun"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
        {data && data.rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">Tidak ada pengguna{term ? ` untuk “${term}”` : ""}.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Menampilkan 50 akun terbaru. Akun yang diblokir tidak bisa menambah atau mengubah konten apa pun. Admin tidak bisa memblokir atau mencabut role dirinya sendiri.</p>
    </div>
  );
}
