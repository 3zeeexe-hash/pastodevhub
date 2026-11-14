import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, errMsg } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/studio/jasa/$id")({ component: JasaForm });

const EMPTY = { title: "", summary: "", description: "", category: "website", price_from: "", delivery_days: "7", cover_url: null as string | null, is_active: true };

function JasaForm() {
  const { id } = Route.useParams();
  const isNew = id === "baru";
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const { data: existing } = useQuery({
    queryKey: ["service-edit", id],
    enabled: !isNew,
    queryFn: async () => (await supabase.from("services").select("*").eq("id", id).maybeSingle()).data,
  });
  useEffect(() => {
    if (existing) setF({ title: existing.title, summary: existing.summary, description: existing.description, category: existing.category, price_from: String(existing.price_from || ""), delivery_days: String(existing.delivery_days), cover_url: existing.cover_url, is_active: existing.is_active });
  }, [existing]);
  if (!isNew && existing === null) return <p>Jasa tidak ditemukan.</p>;
  if (existing && existing.owner_id !== user?.id) return <p>Ini bukan jasa kamu.</p>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const days = Number(f.delivery_days);
    if (!f.title.trim()) { toast.error("Judul wajib diisi."); return; }
    if (!(days >= 1 && days <= 365)) { toast.error("Estimasi 1–365 hari."); return; }
    setBusy(true);
    try {
      const row = { title: f.title.trim().slice(0, 120), summary: f.summary.trim().slice(0, 300), description: f.description.slice(0, 20000), category: f.category, price_from: Number(f.price_from || 0), delivery_days: days, cover_url: f.cover_url, is_active: f.is_active };
      const sid = isNew ? crypto.randomUUID() : id;
      const { error } = isNew ? await supabase.from("services").insert({ id: sid, owner_id: user.id, ...row }) : await supabase.from("services").update(row).eq("id", id);
      if (error) throw error;
      toast.success("Jasa disimpan");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["service"] });
      navigate({ to: "/jasa/$id", params: { id: sid } });
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm("Hapus jasa ini?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["services"] }); navigate({ to: "/studio/jasa" }); }
  }
  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{isNew ? "Buka jasa baru" : "Edit jasa"}</h1>
      <div><Label>Gambar sampul</Label><ImageUpload value={f.cover_url} onChange={(u) => setF({ ...f, cover_url: u })} folder="covers" className="mt-2" /></div>
      <div><Label htmlFor="t">Judul jasa</Label><Input id="t" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Jasa pembuatan website company profile" required /></div>
      <div><Label htmlFor="s">Ringkasan singkat</Label><Input id="s" value={f.summary} maxLength={300} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
      <div><Label htmlFor="d">Deskripsi & paket (Markdown)</Label><Textarea id="d" rows={8} value={f.description} maxLength={20000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Apa yang didapat client, teknologi, revisi, dll." /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="c">Kategori</Label>
          <select id="c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></div>
        <div><Label htmlFor="p">Harga mulai</Label><RupiahInput id="p" value={f.price_from} onValueChange={(v) => setF({ ...f, price_from: v })} placeholder="Kosong = nego" /></div>
        <div><Label htmlFor="dd">Estimasi (hari)</Label><Input id="dd" inputMode="numeric" value={f.delivery_days} onChange={(e) => setF({ ...f, delivery_days: e.target.value.replace(/\D/g, "") })} /></div>
      </div>
      <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"><span><b>Terima pesanan</b><span className="block text-xs text-muted-foreground">Matikan untuk menyembunyikan jasa sementara.</span></span><Switch checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /></label>
      <div className="flex gap-2">
        <Button disabled={busy}><Save /> Simpan jasa</Button>
        {!isNew && <Button type="button" variant="ghost" onClick={remove}><Trash2 /> Hapus</Button>}
      </div>
    </form>
  );
}
