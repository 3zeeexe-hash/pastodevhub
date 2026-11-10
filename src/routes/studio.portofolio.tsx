import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { safeUrl } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/image-upload";

export const Route = createFileRoute("/studio/portofolio")({ component: Portfolio });

function Portfolio() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", description: "", link_url: "", image_url: null as string | null });
  const { data = [] } = useQuery({
    queryKey: ["portfolio", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("portfolio_items").select("*").eq("owner_id", user!.id).order("position").order("created_at", { ascending: false })).data ?? [],
  });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) { toast.error("Judul wajib diisi."); return; }
    if (f.link_url && !safeUrl(f.link_url)) { toast.error("Link harus diawali https://"); return; }
    const { error } = await supabase.from("portfolio_items").insert({ owner_id: user!.id, title: f.title.trim(), description: f.description.trim(), link_url: f.link_url || null, image_url: f.image_url });
    if (error) toast.error(error.message);
    else { toast.success("Ditambahkan ke portofolio"); setF({ title: "", description: "", link_url: "", image_url: null }); qc.invalidateQueries({ queryKey: ["portfolio"] }); qc.invalidateQueries({ queryKey: ["profile"] }); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("portfolio_items").delete().eq("id", id);
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["portfolio"] }); qc.invalidateQueries({ queryKey: ["profile"] }); }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portofolio</h1>
      <form onSubmit={add} className="max-w-2xl space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Tambah proyek</h2>
        <ImageUpload value={f.image_url} onChange={(u) => setF({ ...f, image_url: u })} folder="portfolio" />
        <div><Label htmlFor="pt">Judul proyek</Label><Input id="pt" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><Label htmlFor="pd">Deskripsi</Label><Textarea id="pd" value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Peranmu, teknologi, hasil." /></div>
        <div><Label htmlFor="pl">Link (opsional)</Label><Input id="pl" type="url" value={f.link_url} maxLength={300} onChange={(e) => setF({ ...f, link_url: e.target.value })} placeholder="https://" /></div>
        <Button><Plus /> Tambah</Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
            {p.image_url && <img src={p.image_url} alt="" className="aspect-video w-full object-cover" />}
            <div className="p-3">
              <p className="font-semibold">{p.title}</p>
              {p.description && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-2 flex gap-2">
                {safeUrl(p.link_url) && <Button asChild size="sm" variant="outline"><a href={safeUrl(p.link_url)!} target="_blank" rel="noreferrer noopener"><ExternalLink /> Buka</a></Button>}
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 /> Hapus</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
