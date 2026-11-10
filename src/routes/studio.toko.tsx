import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchStore } from "@/lib/store-data";
import { buildStoreDoc, DEFAULT_STORE_TEMPLATE, STORE_IFRAME_SANDBOX } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/studio/toko")({ component: StoreEditor });

function StoreEditor() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState(DEFAULT_STORE_TEMPLATE);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["store", profile?.username], enabled: !!profile, queryFn: () => fetchStore(profile!.username) });
  useEffect(() => {
    if (!data) return;
    setTitle(data.store?.title ?? "");
    setHtml(data.store?.html?.trim() ? data.store.html : DEFAULT_STORE_TEMPLATE);
    setCustom(!!data.store?.use_custom);
  }, [data?.store?.updated_at, data?.profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || !user) return null;
  const link = typeof window === "undefined" ? `/toko/${profile.username}` : `${window.location.origin}/toko/${profile.username}`;

  async function save() {
    if (html.length > 200000) { toast.error("HTML maksimal 200.000 karakter."); return; }
    setBusy(true);
    const { error } = await supabase.from("stores").upsert({ owner_id: user!.id, title: title.trim().slice(0, 120), html, use_custom: custom, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Toko disimpan"); qc.invalidateQueries({ queryKey: ["store"] }); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Toko saya</h1>
        <p className="text-sm text-muted-foreground">Bagikan link tokomu. Pakai tampilan bawaan, atau desain sendiri sepenuhnya dengan HTML, CSS, dan JavaScript.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-link">{link}</span>
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link toko disalin"))}><Copy /> Salin link</Button>
        <Button asChild size="sm" variant="outline"><Link to="/toko/$username" params={{ username: profile.username }} target="_blank"><ExternalLink /> Buka</Link></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="st">Nama toko</Label><Input id="st" value={title} maxLength={120} placeholder={`Toko ${profile.display_name || profile.username}`} onChange={(e) => setTitle(e.target.value)} /></div>
        <label className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Switch checked={custom} onCheckedChange={setCustom} />
          <span className="text-sm"><b>Pakai desain HTML sendiri</b><br /><span className="text-muted-foreground">Kalau mati, toko memakai tampilan bawaan Pastodev.</span></span>
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="sh">HTML toko</Label>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Ganti kode dengan template awal?")) setHtml(DEFAULT_STORE_TEMPLATE); }}><RotateCcw /> Template awal</Button>
          </div>
          <Textarea id="sh" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} className="min-h-[520px] font-mono text-xs" />
          <p className="text-xs text-muted-foreground">Data tokomu tersedia di <code>window.PASTODEV</code>: developer, products, services, links. Tautan otomatis membuka halaman Pastodev.</p>
        </div>
        <div className="space-y-2">
          <Label>Pratinjau</Label>
          {data ? <iframe title="Pratinjau toko" sandbox={STORE_IFRAME_SANDBOX} srcDoc={buildStoreDoc(html, data.data)} className="h-[520px] w-full rounded-md border border-border bg-background" /> : <div className="h-[520px] rounded-md border border-border" />}
        </div>
      </div>
      <Button onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan toko</Button>
    </div>
  );
}
