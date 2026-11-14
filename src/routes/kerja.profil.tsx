import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/rupiah-input";
import { parseRupiah } from "@/lib/rupiah";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/profil")({ component: WorkProfile });

type WP = { hourly_rate: number | null; availability: string; experience_level: string | null; languages: string[]; about: string | null };
type Rev = { id: string; rating: number; comment: string; created_at: string };

function WorkProfile() {
  const { user } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["work-profile", uid],
    queryFn: async () => {
      const p = await looseDb.from("work_profiles").select("hourly_rate,availability,experience_level,languages,about").eq("user_id", uid).maybeSingle();
      if (p.error) throw new Error(errMsg(p.error));
      const r = await looseDb.from("work_reviews").select("id,rating,comment,created_at").eq("reviewee_id", uid).order("created_at", { ascending: false }).limit(20);
      return { profile: (p.data as WP | null) ?? null, reviews: (r.data ?? []) as Rev[] };
    },
  });
  const [f, setF] = useState({ rate: "", availability: "available", level: "none", languages: "", about: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = q.data?.profile;
    if (p) setF({ rate: p.hourly_rate ? String(p.hourly_rate) : "", availability: p.availability, level: p.experience_level ?? "none", languages: (p.languages ?? []).join(", "), about: p.about ?? "" });
  }, [q.data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rate = f.rate.trim() === "" ? null : parseRupiah(f.rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) { toast.error("Tarif per jam tidak valid."); return; }
    setBusy(true);
    const { error } = await looseDb.from("work_profiles").upsert({
      user_id: uid, hourly_rate: rate, availability: f.availability, experience_level: f.level === "none" ? null : f.level,
      languages: f.languages.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 10), about: f.about.trim().slice(0, 2000) || null, updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Profil kerja disimpan");
    qc.invalidateQueries({ queryKey: ["work-profile", uid] });
  }

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const avg = q.data && q.data.reviews.length ? (q.data.reviews.reduce((s, r) => s + r.rating, 0) / q.data.reviews.length).toFixed(1) : null;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Profil kerja</h1>
        <p className="mt-1 text-sm text-muted-foreground">Informasi ini membantu client menilai kamu saat membuka lamaran.</p>
      </header>
      <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="rate">Tarif per jam</Label><RupiahInput id="rate" value={f.rate} onValueChange={(v) => setF({ ...f, rate: v })} placeholder="Rp 75.000" /></div>
          <div className="space-y-1.5">
            <Label>Ketersediaan</Label>
            <Select value={f.availability} onValueChange={(v) => setF({ ...f, availability: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="available">Tersedia</SelectItem><SelectItem value="busy">Sibuk</SelectItem><SelectItem value="unavailable">Tidak tersedia</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tingkat pengalaman</Label>
            <Select value={f.level} onValueChange={(v) => setF({ ...f, level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Belum diisi</SelectItem><SelectItem value="entry">Pemula</SelectItem><SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Menengah</SelectItem><SelectItem value="senior">Senior</SelectItem><SelectItem value="expert">Ahli</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="lang">Bahasa (pisahkan dengan koma)</Label><Input id="lang" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} placeholder="Indonesia, Inggris" /></div>
        <div className="space-y-1.5"><Label htmlFor="about">Tentang pekerjaanmu</Label><Textarea id="about" rows={5} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} maxLength={2000} /></div>
        <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan profil kerja</Button>
      </form>

      <section aria-labelledby="rev">
        <h2 id="rev" className="mb-2 flex items-center gap-2 font-semibold">Ulasan untukmu {avg && <span className="inline-flex items-center gap-0.5 text-amber-500">{avg}<Star className="size-4 fill-current" /></span>}</h2>
        {q.data?.reviews.length === 0 && <EmptyState>Belum ada ulasan. Ulasan muncul setelah kontrak selesai.</EmptyState>}
        <ul className="space-y-2">
          {q.data?.reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <span className="mr-2 inline-flex items-center gap-0.5 text-amber-500">{r.rating}<Star className="size-3.5 fill-current" /></span>{r.comment || "(tanpa komentar)"}
              <span className="ml-2 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
