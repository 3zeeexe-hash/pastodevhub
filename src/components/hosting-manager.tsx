import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, FilePlus2, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg, safeFileName } from "@/lib/market";
import { HOST_KINDS, SLUG_RE, checkHostFile, formatBytes, hostedPath, makeSlug, type HostKind } from "@/lib/hosting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Row = { id: string; slug: string; name: string; kind: string; storage_path: string; content_type: string; size: number; views: number; created_at: string; updated_at: string };

const STARTER_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Halaman saya</title>
  <style>body{font-family:system-ui;max-width:640px;margin:4rem auto;padding:0 1rem}</style>
</head>
<body>
  <h1>Halo dunia 👋</h1>
  <p>Halaman ini di-hosting di Pastodev.</p>
</body>
</html>
`;

export function fullUrl(slug: string) {
  return typeof window === "undefined" ? hostedPath(slug) : `${window.location.origin}${hostedPath(slug)}`;
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success("Link disalin"); } catch { toast.error("Gagal menyalin, salin manual: " + text); }
}

export function HostingManager({ kind }: { kind: HostKind }) {
  const cfg = HOST_KINDS[kind];
  const { user } = useAuth();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ id: string | null; name: string; slug: string; html: string } | null>(null);
  const key = ["hosted", kind, user?.id];
  const { data = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("hosted_files").select("*").eq("owner_id", user!.id).eq("kind", kind).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Row[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["hosted", kind] });

  async function store(file: Blob, name: string, slug: string, existing?: Row) {
    const path = existing?.storage_path ?? `${user!.id}/${slug}/${safeFileName(name)}`;
    const type = kind === "html" ? "text/html" : file.type || "application/octet-stream";
    const up = await supabase.storage.from("hosting").upload(path, file, { contentType: type, upsert: true });
    if (up.error) throw new Error(up.error.message);
    if (existing) {
      const { error } = await supabase.from("hosted_files").update({ name, size: file.size, content_type: type, updated_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("hosted_files").insert({ owner_id: user!.id, kind, slug, name, storage_path: path, content_type: type, size: file.size });
      if (error) {
        await supabase.storage.from("hosting").remove([path]);
        throw new Error(error.code === "23505" ? "Alamat link sudah dipakai, pilih yang lain." : error.message);
      }
    }
  }

  async function uploadFiles(list: FileList | null) {
    if (!list?.length || !user) return;
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(list).slice(0, 20)) {
      const bad = checkHostFile(kind, f);
      if (bad) { toast.error(bad); continue; }
      try { await store(f, f.name, makeSlug(f.name)); ok++; } catch (e) { toast.error(`${f.name}: ${errMsg(e)}`); }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (ok) { toast.success(`${ok} file diunggah, link siap dibagikan`); refresh(); }
  }

  async function openEditor(row?: Row) {
    if (!row) { setEditor({ id: null, name: "index.html", slug: makeSlug("halaman"), html: STARTER_HTML }); return; }
    const { data: blob, error } = await supabase.storage.from("hosting").download(row.storage_path);
    if (error || !blob) { toast.error("Gagal membuka file."); return; }
    setEditor({ id: row.id, name: row.name, slug: row.slug, html: await blob.text() });
  }

  async function saveEditor() {
    if (!editor) return;
    const slug = editor.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) { toast.error("Alamat link: 3–63 huruf kecil, angka, atau tanda minus."); return; }
    const name = /\.html?$/i.test(editor.name) ? editor.name : `${editor.name || "index"}.html`;
    const blob = new Blob([editor.html], { type: "text/html" });
    if (blob.size > cfg.maxBytes) { toast.error("Halaman terlalu besar."); return; }
    setBusy(true);
    try {
      await store(blob, name, slug, data.find((r) => r.id === editor.id));
      toast.success("Halaman disimpan dan online");
      setEditor(null);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  async function remove(row: Row) {
    if (!confirm(`Hapus ${row.name}? Link-nya akan berhenti bekerja.`)) return;
    await supabase.storage.from("hosting").remove([row.storage_path]);
    const { error } = await supabase.from("hosted_files").delete().eq("id", row.id);
    if (error) toast.error(error.message); else { toast.success("Dihapus"); refresh(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.hint} Setiap file langsung dapat link publik.</p>
        </div>
        <div className="flex gap-2">
          {kind === "html" && <Button variant="secondary" onClick={() => openEditor()}><FilePlus2 /> Tulis HTML</Button>}
          <input ref={input} type="file" multiple={kind !== "html"} accept={cfg.accept || undefined} className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
          <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Unggah</Button>
        </div>
      </div>

      {editor && (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="hn">Nama file</Label><Input id="hn" value={editor.name} maxLength={120} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></div>
            <div>
              <Label htmlFor="hs">Alamat link</Label>
              <div className="flex items-center gap-1"><span className="text-sm text-muted-foreground">/f/</span>
                <Input id="hs" value={editor.slug} disabled={!!editor.id} maxLength={63} className="font-mono" onChange={(e) => setEditor({ ...editor, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Textarea aria-label="Kode HTML" value={editor.html} onChange={(e) => setEditor({ ...editor, html: e.target.value })} className="min-h-[420px] font-mono text-xs" spellCheck={false} />
            <iframe title="Pratinjau" sandbox="allow-scripts" srcDoc={editor.html} className="min-h-[420px] w-full rounded-md border border-border bg-white" />
          </div>
          <div className="flex gap-2">
            <Button onClick={saveEditor} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan & online-kan</Button>
            <Button variant="ghost" onClick={() => setEditor(null)}>Batal</Button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-muted-foreground">Memuat…</p> : data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Belum ada file. Unggah untuk mendapatkan link.</p>
      ) : kind === "image" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {data.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <img src={hostedPath(r.slug)} alt={r.name} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
              <div className="space-y-2 p-2">
                <p className="truncate text-xs font-medium" title={r.name}>{r.name}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => copy(fullUrl(r.slug))}><Copy /> Link</Button>
                  <Button size="sm" variant="ghost" aria-label="Hapus" onClick={() => remove(r)}><Trash2 /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate font-mono text-xs text-link">{fullUrl(r.slug)}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(r.size)} · {r.views} kali dibuka · {timeAgo(r.updated_at)}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => copy(fullUrl(r.slug))}><Copy /> Salin link</Button>
                <Button asChild size="sm" variant="outline"><a href={hostedPath(r.slug)} target="_blank" rel="noreferrer noopener"><ExternalLink /> Buka</a></Button>
                {kind === "html" && <Button size="sm" variant="ghost" onClick={() => openEditor(r)}><Pencil /> Edit</Button>}
                <Button size="sm" variant="ghost" aria-label="Hapus" onClick={() => remove(r)}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
