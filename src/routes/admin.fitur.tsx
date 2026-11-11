import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { FEATURES, isFeatureOn, type FeatureFlags, type FeatureKey } from "@/lib/features";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/fitur")({
  head: () => ({ meta: [{ title: "Fitur & pengumuman — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: FeaturesPage,
});

const GROUPS = [...new Set(FEATURES.map((f) => f.group))];

function FeaturesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: flags, isLoading } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feature_flags").select("key,enabled");
      if (error) throw error;
      const out: FeatureFlags = {};
      for (const r of data ?? []) out[r.key] = r.enabled;
      return out;
    },
  });

  async function toggle(key: FeatureKey, enabled: boolean) {
    setBusyKey(key);
    const { error } = await supabase.from("feature_flags").upsert(
      { key, enabled, updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    setBusyKey(null);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(enabled ? "Fitur dinyalakan" : "Fitur dimatikan");
    qc.invalidateQueries({ queryKey: ["admin-flags"] });
    qc.invalidateQueries({ queryKey: ["site-config"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-semibold">Fitur & halaman</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fitur yang dimatikan hilang dari menu, halamannya menampilkan “dinonaktifkan”, dan penambahan konten baru ditolak oleh database. Konten yang sudah ada tidak dihapus. Admin tetap bisa mengaksesnya. Pengunjung lain melihat perubahan dalam sekitar satu menit.
        </p>
      </section>
      {isLoading && <p className="text-muted-foreground">Memuat…</p>}
      {GROUPS.map((g) => (
        <section key={g} className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{g}</h3>
          <ul className="mt-3 divide-y divide-border">
            {FEATURES.filter((f) => f.group === g).map((f) => {
              const on = isFeatureOn(flags, f.key);
              return (
                <li key={f.key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {f.label}
                      {!on && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Mati</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
                    {f.paths.length > 0 && <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{f.paths.join("  ")}</p>}
                  </div>
                  <Switch checked={on} disabled={busyKey === f.key || isLoading} onCheckedChange={(v) => toggle(f.key, v)} aria-label={`${on ? "Matikan" : "Nyalakan"} ${f.label}`} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <AnnouncementForm />
    </div>
  );
}

function AnnouncementForm() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"info" | "warning">("info");
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin-announcement"],
    queryFn: async () => (await supabase.from("app_settings").select("announcement,announcement_level,updated_at").eq("id", 1).maybeSingle()).data,
  });
  useEffect(() => {
    if (!data) return;
    setText(data.announcement ?? "");
    setLevel(data.announcement_level === "warning" ? "warning" : "info");
  }, [data?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ announcement: text.trim() || null, announcement_level: level, updated_at: new Date().toISOString() }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(text.trim() ? "Pengumuman tampil di seluruh situs" : "Pengumuman dihapus");
    qc.invalidateQueries({ queryKey: ["admin-announcement"] });
    qc.invalidateQueries({ queryKey: ["site-config"] });
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">Pengumuman situs</h2>
      <p className="text-sm text-muted-foreground">Banner di bagian atas semua halaman. Kosongkan lalu simpan untuk menghapusnya.</p>
      <div>
        <Label htmlFor="ann-text">Isi pengumuman</Label>
        <Textarea id="ann-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Contoh: Pembayaran sedang dalam perawatan sampai pukul 22.00." />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="ann-level" className="mr-1">Jenis</Label>
        <select id="ann-level" value={level} onChange={(e) => setLevel(e.target.value === "warning" ? "warning" : "info")} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="info">Info</option>
          <option value="warning">Peringatan</option>
        </select>
        <Button disabled={busy} className="ml-auto">{busy && <Loader2 className="animate-spin" />} Simpan pengumuman</Button>
      </div>
    </form>
  );
}
