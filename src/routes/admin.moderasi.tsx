import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/moderasi")({
  head: () => ({ meta: [{ title: "Moderasi konten — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: ModerationPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Kind = {
  key: string;
  label: string;
  table: string;
  select: string;
  titleCol: string;
  title: (r: Row) => string;
  meta: (r: Row) => string;
  href: (r: Row) => string;
  /** Column that hides the item from the public when false (karya: is_published, jasa: is_active). */
  visible?: { col: string; on: string; off: string };
};

const KINDS: Kind[] = [
  {
    key: "repos", label: "Repositori", table: "repositories", titleCol: "name",
    select: "id,name,is_private,created_at, owner:profiles!repositories_owner_id_fkey(username)",
    title: (r) => `${r.owner?.username ?? "?"}/${r.name}`,
    meta: (r) => (r.is_private ? "Privat" : "Publik"),
    href: (r) => `/${r.owner?.username}/${r.name}`,
  },
  {
    key: "posts", label: "Diskusi", table: "posts", titleCol: "title",
    select: "id,title,created_at, author:profiles!posts_author_id_fkey(username)",
    title: (r) => r.title,
    meta: (r) => `oleh @${r.author?.username ?? "?"}`,
    href: (r) => `/discuss/${r.id}`,
  },
  {
    key: "jobs", label: "Lowongan", table: "jobs", titleCol: "title",
    select: "id,title,status,created_at, client:profiles!jobs_client_id_fkey(username)",
    title: (r) => r.title,
    meta: (r) => `oleh @${r.client?.username ?? "?"} · ${r.status}`,
    href: (r) => `/lowongan/${r.id}`,
  },
  {
    key: "products", label: "Karya", table: "products", titleCol: "title",
    select: "id,title,is_published,created_at, owner:profiles!products_owner_id_fkey(username)",
    title: (r) => r.title,
    meta: (r) => `oleh @${r.owner?.username ?? "?"} · ${r.is_published ? "Tayang" : "Disembunyikan / draf"}`,
    href: (r) => `/karya/${r.id}`,
    visible: { col: "is_published", on: "Tayangkan", off: "Sembunyikan" },
  },
  {
    key: "services", label: "Jasa", table: "services", titleCol: "title",
    select: "id,title,is_active,created_at, owner:profiles!services_owner_id_fkey(username)",
    title: (r) => r.title,
    meta: (r) => `oleh @${r.owner?.username ?? "?"} · ${r.is_active ? "Aktif" : "Nonaktif"}`,
    href: (r) => `/jasa/${r.id}`,
    visible: { col: "is_active", on: "Aktifkan", off: "Nonaktifkan" },
  },
];

function ModerationPage() {
  const qc = useQueryClient();
  const [kindKey, setKindKey] = useState(KINDS[0]!.key);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const kind = KINDS.find((k) => k.key === kindKey) ?? KINDS[0]!;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-moderation", kind.key, term],
    queryFn: async () => {
      let qb = sb.from(kind.table).select(kind.select).order("created_at", { ascending: false }).limit(50);
      if (term) qb = qb.ilike(kind.titleCol, `%${term}%`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-moderation"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  async function remove(r: Row) {
    if (!confirm(`Hapus “${kind.title(r)}”? Ini tidak bisa dibatalkan.`)) return;
    setBusy(r.id);
    const { data, error } = await sb.from(kind.table).delete().eq("id", r.id).select("id");
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    if (!data?.length) { toast.error("Tidak ada yang terhapus. Mungkin masih dipakai data lain."); return; }
    toast.success("Dihapus");
    refresh();
  }

  async function toggleVisible(r: Row) {
    const v = kind.visible;
    if (!v) return;
    setBusy(r.id);
    const { data, error } = await sb.from(kind.table).update({ [v.col]: !r[v.col] }).eq("id", r.id).select("id");
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    if (!data?.length) { toast.error("Perubahan tidak tersimpan."); return; }
    toast.success(r[v.col] ? "Disembunyikan dari publik" : "Ditayangkan");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => { setKindKey(k.key); setText(""); setTerm(""); }}
            className={cn("shrink-0 border-b-2 px-3 py-2 text-sm", kind.key === k.key ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{k.label}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setTerm(text.replace(/[%,()_*]/g, " ").trim()); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Cari ${kind.label.toLowerCase()}…`} className="pl-9" />
      </form>
      {isLoading && <p className="text-muted-foreground">Memuat…</p>}
      {error && <p className="text-sm text-destructive">{errMsg(error)}</p>}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{kind.title(r)}</p>
              <p className="truncate text-xs text-muted-foreground">{kind.meta(r)} · {timeAgo(r.created_at)}</p>
            </div>
            <a href={kind.href(r)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-link hover:underline"><ExternalLink className="size-3.5" /> Buka</a>
            {kind.visible && (
              <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => toggleVisible(r)}>{r[kind.visible.col] ? kind.visible.off : kind.visible.on}</Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === r.id} onClick={() => remove(r)}>Hapus</Button>
          </li>
        ))}
        {data && data.length === 0 && <li className="p-4 text-sm text-muted-foreground">Tidak ada data.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Menampilkan 50 terbaru. Untuk menghentikan satu jenis konten sekaligus, pakai menu Fitur & pengumuman. File hosting dihapus lewat penyimpanan, bukan dari sini.</p>
    </div>
  );
}
