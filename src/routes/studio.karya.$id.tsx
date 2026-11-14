import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, errMsg, safeFileName, safeUrl } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/studio/karya/$id")({ component: KaryaForm });

const EMPTY = { title: "", summary: "", description: "", category: "website", tags: "", demo_url: "", price: "0", cover_url: null as string | null, is_published: true };

function KaryaForm() {
  const { id } = Route.useParams();
  const isNew = id === "baru";
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [paid, setPaid] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: existing } = useQuery({
    queryKey: ["product-edit", id],
    enabled: !isNew,
    queryFn: async () => (await supabase.from("products").select("*").eq("id", id).maybeSingle()).data,
  });
  useEffect(() => {
    if (!existing) return;
    setF({ title: existing.title, summary: existing.summary, description: existing.description, category: existing.category, tags: existing.tags.join(", "), demo_url: existing.demo_url ?? "", price: String(existing.price), cover_url: existing.cover_url, is_published: existing.is_published });
    setPaid(existing.price > 0);
  }, [existing]);
  if (!isNew && existing === null) return <p>Karya tidak ditemukan.</p>;
  if (existing && existing.owner_id !== user?.id) return <p>Ini bukan karya kamu.</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const price = paid ? Number(f.price) : 0;
    if (!f.title.trim()) { toast.error("Judul wajib diisi."); return; }
    if (paid && price < 1000) { toast.error("Harga minimal Rp1.000."); return; }
    if (f.demo_url && !safeUrl(f.demo_url)) { toast.error("Link demo harus diawali https://"); return; }
    if (file && file.size > 50 * 1024 * 1024) { toast.error("File maksimal 50 MB."); return; }
    setBusy(true);
    try {
      const pid = isNew ? crypto.randomUUID() : id;
      let fileFields = {};
      if (file) {
        const path = `${user.id}/${pid}/${Date.now()}-${safeFileName(file.name)}`;
        const up = await supabase.storage.from("product-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) throw up.error;
        if (existing?.file_path) await supabase.storage.from("product-files").remove([existing.file_path]);
        fileFields = { file_path: path, file_name: file.name.slice(0, 200), file_size: file.size };
      }
      const row = {
        title: f.title.trim().slice(0, 120), summary: f.summary.trim().slice(0, 300), description: f.description.slice(0, 20000),
        category: f.category, tags: [...new Set(f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 30)),
        demo_url: f.demo_url || null, price, cover_url: f.cover_url, is_published: f.is_published, ...fileFields,
      };
      const { error } = isNew
        ? await supabase.from("products").insert({ id: pid, owner_id: user.id, ...row })
        : await supabase.from("products").update(row).eq("id", id);
      if (error) throw error;
      toast.success("Karya disimpan");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
      navigate({ to: "/karya/$id", params: { id: pid } });
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!existing || !confirm("Hapus karya ini? Pembeli lama tidak bisa mengunduh lagi.")) return;
    if (existing.file_path) await supabase.storage.from("product-files").remove([existing.file_path]);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["products"] }); navigate({ to: "/studio/karya" }); }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{isNew ? "Unggah karya" : "Edit karya"}</h1>
      <div><Label>Gambar sampul</Label><ImageUpload value={f.cover_url} onChange={(u) => setF({ ...f, cover_url: u })} folder="covers" className="mt-2" /></div>
      <div><Label htmlFor="t">Judul</Label><Input id="t" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
      <div><Label htmlFor="s">Ringkasan singkat</Label><Input id="s" value={f.summary} maxLength={300} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
      <div><Label htmlFor="d">Deskripsi (Markdown)</Label><Textarea id="d" rows={8} value={f.description} maxLength={20000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Fitur, teknologi, cara instal…" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="c">Kategori</Label>
          <select id="c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div><Label htmlFor="tg">Tag (koma)</Label><Input id="tg" value={f.tags} maxLength={300} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="react, tailwind" /></div>
      </div>
      <div><Label htmlFor="demo">Link demo (opsional)</Label><Input id="demo" type="url" value={f.demo_url} maxLength={300} onChange={(e) => setF({ ...f, demo_url: e.target.value })} placeholder="https://" /></div>
      <div className="rounded-lg border border-border p-4">
        <Label>Harga</Label>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant={!paid ? "default" : "outline"} onClick={() => setPaid(false)}>Gratis</Button>
          <Button type="button" size="sm" variant={paid ? "default" : "outline"} onClick={() => setPaid(true)}>Berbayar</Button>
        </div>
        {paid && <div className="mt-3"><Label htmlFor="pr">Harga</Label><RupiahInput id="pr" value={f.price === "0" ? "" : f.price} onValueChange={(v) => setF({ ...f, price: v })} className="w-48" placeholder="Rp 50.000" /></div>}
      </div>
      <div className="rounded-lg border border-border p-4">
        <Label htmlFor="file">File karya (ZIP, maks 50 MB)</Label>
        {existing?.file_name && !file && <p className="mt-1 font-mono text-sm text-muted-foreground">Sekarang: {existing.file_name}</p>}
        <Input id="file" type="file" className="mt-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"><span><b>Tampilkan ke publik</b><span className="block text-xs text-muted-foreground">Matikan untuk menyimpan sebagai draf.</span></span><Switch checked={f.is_published} onCheckedChange={(v) => setF({ ...f, is_published: v })} /></label>
      <div className="flex gap-2">
        <Button disabled={busy}><Upload /> {busy ? "Menyimpan…" : "Simpan karya"}</Button>
        {!isNew && <Button type="button" variant="ghost" onClick={remove}><Trash2 /> Hapus</Button>}
      </div>
    </form>
  );
}
