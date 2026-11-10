import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CATEGORIES } from "@/lib/market";
import { canPostJob, validBudget } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignInCta } from "@/components/sign-in-cta";

export const Route = createFileRoute("/lowongan/baru")({
  head: () => ({
    meta: [
      { title: "Pasang lowongan — Pastodev" },
      { name: "description", content: "Pasang kebutuhan proyek freelance dan terima lamaran dari developer Pastodev." },
      { property: "og:title", content: "Pasang lowongan — Pastodev" },
      { property: "og:description", content: "Cari developer freelance untuk proyek kamu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewJob,
});

function NewJob() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", description: "", category: "website", skills: "", min: "", max: "", deadline: "" });
  const [busy, setBusy] = useState(false);
  if (loading) return null;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk sebagai client untuk memasang lowongan." /></main>;
  if (!canPostJob({ id: user.id, accountType: profile?.account_type ?? null })) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <Briefcase className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Pasang lowongan khusus akun client</h1>
        <p className="mt-2 text-sm text-muted-foreground">Akun developer bisa melamar lowongan. Ganti jenis akun di Pengaturan jika kamu ingin mencari developer.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild><Link to="/lowongan">Lihat lowongan</Link></Button>
          <Button asChild variant="outline"><Link to="/settings">Pengaturan</Link></Button>
        </div>
      </main>
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const min = Number(f.min || 0), max = Number(f.max || 0);
    if (!validBudget(min, max)) { toast.error("Anggaran tidak valid: maksimal harus ≥ minimal."); return; }
    const skills = f.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12).map((s) => s.slice(0, 30));
    setBusy(true);
    const { data, error } = await supabase.from("jobs").insert({
      client_id: user!.id, title: f.title.trim(), description: f.description.trim(), category: f.category, skills,
      budget_min: min, budget_max: max, deadline: f.deadline || null,
    }).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message.includes("title") ? "Judul 5–120 karakter." : "Gagal memasang lowongan."); return; }
    toast.success("Lowongan dipasang. Developer sudah bisa melamar.");
    navigate({ to: "/lowongan/$id", params: { id: data.id } });
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Pasang lowongan</h1>
      <p className="text-sm text-muted-foreground">Jelaskan kebutuhanmu sejelas mungkin supaya developer bisa memberi penawaran yang pas.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5">
        <div><Label htmlFor="t">Judul proyek</Label><Input id="t" required minLength={5} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Contoh: Website toko online untuk UMKM batik" /></div>
        <div><Label htmlFor="d">Deskripsi</Label><Textarea id="d" rows={8} maxLength={8000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Fitur yang dibutuhkan, contoh referensi, teknologi yang diinginkan…" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="c">Kategori</Label>
            <select id="c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div><Label htmlFor="dl">Tenggat (opsional)</Label><Input id="dl" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
          <div><Label htmlFor="mn">Anggaran minimal (Rp)</Label><Input id="mn" type="number" min={0} step={1000} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} placeholder="500000" /></div>
          <div><Label htmlFor="mx">Anggaran maksimal (Rp)</Label><Input id="mx" type="number" min={0} step={1000} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} placeholder="2000000" /></div>
        </div>
        <div><Label htmlFor="s">Keahlian yang dicari</Label><Input id="s" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="React, Laravel, Figma" /><p className="mt-1 text-xs text-muted-foreground">Pisahkan dengan koma.</p></div>
        <Button disabled={busy} className="w-full sm:w-auto">{busy && <Loader2 className="animate-spin" />} Pasang lowongan</Button>
      </form>
    </main>
  );
}
