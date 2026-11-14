import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { validAmount } from "@/lib/work";
import {
  PACKAGE_TIERS, SERVICE_STATUS_LABEL, calcServiceOrderPricing, validatePackages, type PackageInput, type PackageTier,
} from "@/lib/services";
import { digitsOnly, parseSkills, serviceReadiness, splitLines } from "@/lib/services-owner";
import { loadServiceForEdit, serviceRpc, useSellerProfile, useServiceConfig, useServiceTaxonomy } from "@/lib/services-db";
import { SellerActivationCard } from "@/components/service-seller";
import { ImageUpload } from "@/components/image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/studio/jasa/$id")({ component: JasaEditor });

const TIER_LABEL: Record<PackageTier, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };
const SELECT_CLS = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

type Info = {
  title: string; summary: string; description: string; category_slug: string; subcategory_slug: string; skills: string;
  buyer_requirements: string; revision_terms: string; scope_limits: string; cover_url: string | null;
};
type PkgForm = { name: string; description: string; price: string; delivery_days: string; revisions: string; features: string; work_limit: string };
type AddonForm = { id?: string; name: string; description: string; price: string; extra_days: string; extra_revisions: string; is_active: boolean };
type FaqForm = { question: string; answer: string };
type GalForm = { url: string; caption: string };
type PackagePayload = PackageInput & { description: string; features: string[]; work_limit: string };

const EMPTY_INFO: Info = { title: "", summary: "", description: "", category_slug: "", subcategory_slug: "", skills: "", buyer_requirements: "", revision_terms: "", scope_limits: "", cover_url: null };
const emptyPkg = (): PkgForm => ({ name: "", description: "", price: "", delivery_days: "", revisions: "1", features: "", work_limit: "" });
const emptyAddon = (): AddonForm => ({ name: "", description: "", price: "", extra_days: "0", extra_revisions: "0", is_active: true });
const tiersFor = (mode: "one" | "three"): PackageTier[] => (mode === "one" ? ["basic"] : PACKAGE_TIERS);

function pkgPayload(tier: PackageTier, p: PkgForm): PackagePayload {
  return {
    tier, name: p.name.trim(), description: p.description.trim(), price: Number(p.price || 0),
    delivery_days: Number(p.delivery_days || 0), revisions: Number(p.revisions || 0),
    features: splitLines(p.features), work_limit: p.work_limit.trim(), is_active: true,
  };
}

function JasaEditor() {
  const { id } = Route.useParams();
  const isNew = id === "baru";
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const seller = useSellerProfile(user?.id);
  const taxonomy = useServiceTaxonomy();
  const config = useServiceConfig();
  const existing = useQuery({ queryKey: ["service-edit", id], enabled: !isNew && !!user, queryFn: () => loadServiceForEdit(id) });

  const [tab, setTab] = useState("info");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<Info>(EMPTY_INFO);
  const [mode, setMode] = useState<"one" | "three">("one");
  const [pkgs, setPkgs] = useState<Record<PackageTier, PkgForm>>({ basic: emptyPkg(), standard: emptyPkg(), premium: emptyPkg() });
  const [addons, setAddons] = useState<AddonForm[]>([]);
  const [faqs, setFaqs] = useState<FaqForm[]>([]);
  const [gallery, setGallery] = useState<GalForm[]>([]);

  const loaded = existing.data;
  useEffect(() => {
    if (!loaded) return;
    const s = loaded.service;
    setInfo({
      title: s.title, summary: s.summary, description: s.description, category_slug: s.category_slug ?? "", subcategory_slug: s.subcategory_slug ?? "",
      skills: (s.skills ?? []).join(", "), buyer_requirements: s.buyer_requirements, revision_terms: s.revision_terms, scope_limits: s.scope_limits, cover_url: s.cover_url,
    });
    const next: Record<PackageTier, PkgForm> = { basic: emptyPkg(), standard: emptyPkg(), premium: emptyPkg() };
    for (const p of loaded.packages) {
      next[p.tier] = { name: p.name, description: p.description, price: String(p.price), delivery_days: String(p.delivery_days), revisions: String(p.revisions), features: (p.features ?? []).join("\n"), work_limit: p.work_limit };
    }
    setPkgs(next);
    setMode(loaded.packages.length === 3 ? "three" : "one");
    setAddons(loaded.addons.map((a) => ({ id: a.id, name: a.name, description: a.description, price: String(a.price), extra_days: String(a.extra_days), extra_revisions: String(a.extra_revisions), is_active: a.is_active })));
    setFaqs(loaded.faqs.map((f) => ({ question: f.question, answer: f.answer })));
    setGallery(loaded.gallery.filter((g) => g.url).map((g) => ({ url: g.url as string, caption: g.caption })));
  }, [loaded]);

  const pkgInputs = useMemo(() => tiersFor(mode).map((t) => pkgPayload(t, pkgs[t])), [mode, pkgs]);
  const readiness = useMemo(
    () => serviceReadiness({ title: info.title, description: info.description, category_slug: info.category_slug || null, cover_url: info.cover_url }, pkgInputs),
    [info.title, info.description, info.category_slug, info.cover_url, pkgInputs],
  );

  // ---- Penjaga akses (setelah semua hook) ----
  if (!user || !profile || seller.isLoading || (!isNew && existing.isLoading)) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (seller.error) return <Alert variant="destructive"><AlertDescription>Fitur GOBI SERVICES belum siap: {errMsg(seller.error)}. Pastikan SQL 001 dan 002 sudah diterapkan.</AlertDescription></Alert>;
  if (!seller.data?.is_active || seller.data.suspended_at) {
    return <div className="space-y-4"><h1 className="text-2xl font-bold">{isNew ? "Buat jasa" : "Edit jasa"}</h1><SellerActivationCard seller={seller.data ?? null} accountType={profile.account_type} /></div>;
  }
  if (!isNew && existing.error) return <Alert variant="destructive"><AlertDescription>{errMsg(existing.error)}</AlertDescription></Alert>;
  if (!isNew && !loaded) return <p>Jasa tidak ditemukan.</p>;
  if (loaded && loaded.service.owner_id !== user.id) return <p>Ini bukan jasa kamu.</p>;

  const status = loaded?.service.status ?? null;
  const locked = status === "pending_review" || status === "archived";
  const canSubmit = !status || status === "draft" || status === "rejected";
  const moderated = !!config.data?.require_moderation;
  const commission = config.data?.commission_percent ?? 0;
  const subcats = (taxonomy.data?.subcategories ?? []).filter((s) => s.category_slug === info.category_slug);
  const groups = [...new Set((taxonomy.data?.categories ?? []).map((c) => c.group_label))];

  async function persist(): Promise<string | null> {
    if (info.title.trim().length < 5) { toast.error("Judul minimal 5 karakter."); setTab("info"); return null; }
    let packages: PackagePayload[] | null = null;
    if (pkgs.basic.name.trim() && pkgs.basic.price) {
      const errs = validatePackages(pkgInputs);
      if (errs.length) { toast.error(errs[0]); setTab("paket"); return null; }
      packages = pkgInputs;
    }
    const addonRows = addons.filter((a) => a.name.trim() || a.price);
    for (const a of addonRows) {
      if (!a.name.trim() || !validAmount(Number(a.price))) { toast.error("Setiap add-on butuh nama dan harga."); setTab("addon"); return null; }
    }
    const faqRows = faqs.filter((q) => q.question.trim() || q.answer.trim());
    for (const q of faqRows) {
      if (!q.question.trim() || !q.answer.trim()) { toast.error("Setiap FAQ butuh pertanyaan dan jawaban."); setTab("faq"); return null; }
    }
    setBusy(true);
    try {
      const sid = await serviceRpc<string>("service_save", {
        _id: isNew ? null : id,
        _core: {
          title: info.title.trim(), summary: info.summary.trim(), description: info.description, category_slug: info.category_slug || null,
          subcategory_slug: info.subcategory_slug || null, skills: parseSkills(info.skills), buyer_requirements: info.buyer_requirements,
          revision_terms: info.revision_terms, scope_limits: info.scope_limits, cover_url: info.cover_url,
        },
        _packages: packages,
        _addons: addonRows.map((a) => ({ id: a.id ?? null, name: a.name.trim(), description: a.description.trim(), price: Number(a.price), extra_days: Number(a.extra_days || 0), extra_revisions: Number(a.extra_revisions || 0), is_active: a.is_active })),
        _faqs: faqRows.map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })),
        _gallery: gallery.map((g) => ({ url: g.url, caption: g.caption.trim() })),
      });
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["service-edit"] });
      return sid;
    } catch (e) { toast.error(errMsg(e)); return null; } finally { setBusy(false); }
  }

  async function saveDraft() {
    const sid = await persist();
    if (!sid) return;
    toast.success(canSubmit ? "Draf disimpan" : "Perubahan disimpan");
    if (isNew) navigate({ to: "/studio/jasa/$id", params: { id: sid }, replace: true });
  }

  async function submit() {
    const sid = await persist();
    if (!sid) return;
    setBusy(true);
    try {
      const st = await serviceRpc<string>("service_submit", { _id: sid });
      toast.success(st === "published" ? "Jasa terbit" : "Jasa diajukan, menunggu moderasi admin");
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["service-edit"] });
      navigate({ to: "/studio/jasa" });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  async function moveTo(to: "draft") {
    setBusy(true);
    try {
      await serviceRpc("service_set_status", { _id: id, _to: to });
      toast.success("Jasa dikembalikan ke draft");
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["service-edit"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  async function removeDraft() {
    if (!confirm("Hapus draft ini? Tindakan ini tidak bisa dibatalkan.")) return;
    setBusy(true);
    try {
      await serviceRpc("service_delete_draft", { _id: id });
      await qc.invalidateQueries({ queryKey: ["services"] });
      navigate({ to: "/studio/jasa" });
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  }

  const setPkg = (t: PackageTier, patch: Partial<PkgForm>) => setPkgs((p) => ({ ...p, [t]: { ...p[t], ...patch } }));
  const setAddon = (i: number, patch: Partial<AddonForm>) => setAddons((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setFaq = (i: number, patch: Partial<FaqForm>) => setFaqs((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function estimate(t: PackageTier) {
    const p = pkgs[t];
    try {
      const r = calcServiceOrderPricing({ packagePrice: Number(p.price || 0), packageDays: Number(p.delivery_days || 1) || 1, packageRevisions: Number(p.revisions || 0), commissionPercent: commission });
      return `Komisi GOBI ${commission}% = ${formatRupiah(r.commission, "Rp0")} · kamu menerima ${formatRupiah(r.sellerNet, "Rp0")}`;
    } catch { return null; }
  }

  return (
    <div className="max-w-3xl space-y-4 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{isNew ? "Buat jasa" : "Edit jasa"}</h1>
        {status && <Badge variant={status === "published" ? "default" : status === "rejected" ? "destructive" : "secondary"}>{loaded?.service.admin_hold ? "Ditahan admin" : SERVICE_STATUS_LABEL[status]}</Badge>}
        <Button asChild variant="ghost" size="sm" className="ml-auto"><Link to="/studio/jasa">Kembali</Link></Button>
      </div>

      {status === "rejected" && loaded?.service.moderation_note && <Alert variant="destructive"><AlertDescription>Alasan penolakan: {loaded.service.moderation_note}. Perbaiki lalu ajukan lagi.</AlertDescription></Alert>}
      {status === "pending_review" && <Alert><AlertDescription>Jasa sedang ditinjau admin. Tarik ke draft kalau ingin mengubahnya. <Button size="sm" variant="secondary" className="ml-2" disabled={busy} onClick={() => moveTo("draft")}><Undo2 /> Tarik ke draft</Button></AlertDescription></Alert>}
      {status === "archived" && <Alert><AlertDescription>Jasa diarsipkan. <Button size="sm" variant="secondary" className="ml-2" disabled={busy} onClick={() => moveTo("draft")}><Undo2 /> Kembalikan ke draft</Button></AlertDescription></Alert>}
      {status === "published" && moderated && <Alert><AlertDescription>Mengubah judul, deskripsi, atau kategori akan mengirim jasa kembali ke moderasi.</AlertDescription></Alert>}
      {loaded && loaded.packages.length === 0 && status !== "draft" && <Alert><AlertDescription>Jasa ini belum punya paket. Isi paket di tab Paket agar pembeli bisa memesan dengan harga tetap.</AlertDescription></Alert>}
      {taxonomy.error && <Alert variant="destructive"><AlertDescription>Kategori belum tersedia: {errMsg(taxonomy.error)}</AlertDescription></Alert>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="info">Informasi</TabsTrigger>
          <TabsTrigger value="paket">Paket</TabsTrigger>
          <TabsTrigger value="addon">Add-on</TabsTrigger>
          <TabsTrigger value="faq">FAQ &amp; Galeri</TabsTrigger>
          <TabsTrigger value="preview">Pratinjau</TabsTrigger>
        </TabsList>

        <TabsContent value="info"><fieldset disabled={locked} className="min-w-0 space-y-4">
          <div><Label>Gambar sampul (thumbnail)</Label><ImageUpload value={info.cover_url} onChange={(u) => setInfo({ ...info, cover_url: u })} folder="covers" className="mt-2" /></div>
          <div><Label htmlFor="t">Judul jasa</Label><Input id="t" value={info.title} maxLength={120} onChange={(e) => setInfo({ ...info, title: e.target.value })} placeholder="Pembuatan landing page responsif" /></div>
          <div><Label htmlFor="s">Ringkasan singkat</Label><Input id="s" value={info.summary} maxLength={300} onChange={(e) => setInfo({ ...info, summary: e.target.value })} /></div>
          <div><Label htmlFor="d">Deskripsi (Markdown)</Label><Textarea id="d" rows={8} value={info.description} maxLength={20000} onChange={(e) => setInfo({ ...info, description: e.target.value })} placeholder="Apa yang pembeli dapatkan, teknologi, proses kerja." /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="c">Kategori</Label>
              <select id="c" className={SELECT_CLS} value={info.category_slug} onChange={(e) => setInfo({ ...info, category_slug: e.target.value, subcategory_slug: "" })}>
                <option value="">Pilih kategori</option>
                {groups.map((g) => <optgroup key={g} label={g}>{(taxonomy.data?.categories ?? []).filter((c) => c.group_label === g).map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</optgroup>)}
              </select></div>
            {subcats.length > 0 && <div><Label htmlFor="sc">Subkategori</Label>
              <select id="sc" className={SELECT_CLS} value={info.subcategory_slug} onChange={(e) => setInfo({ ...info, subcategory_slug: e.target.value })}>
                <option value="">Tanpa subkategori</option>
                {subcats.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
              </select></div>}
          </div>
          <div><Label htmlFor="sk">Skill (pisahkan dengan koma)</Label><Input id="sk" value={info.skills} onChange={(e) => setInfo({ ...info, skills: e.target.value })} placeholder="React, Tailwind, SEO dasar" /></div>
          <div><Label htmlFor="br">Syarat dan file dari pembeli</Label><Textarea id="br" rows={3} value={info.buyer_requirements} maxLength={4000} onChange={(e) => setInfo({ ...info, buyer_requirements: e.target.value })} placeholder="Logo, teks konten, referensi desain" /></div>
          <div><Label htmlFor="rt">Ketentuan revisi</Label><Textarea id="rt" rows={3} value={info.revision_terms} maxLength={4000} onChange={(e) => setInfo({ ...info, revision_terms: e.target.value })} /></div>
          <div><Label htmlFor="sl">Batas ruang lingkup pekerjaan</Label><Textarea id="sl" rows={3} value={info.scope_limits} maxLength={4000} onChange={(e) => setInfo({ ...info, scope_limits: e.target.value })} /></div>
        </fieldset></TabsContent>

        <TabsContent value="paket"><fieldset disabled={locked} className="min-w-0 space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "one" ? "default" : "secondary"} onClick={() => setMode("one")}>Satu paket</Button>
            <Button type="button" size="sm" variant={mode === "three" ? "default" : "secondary"} onClick={() => setMode("three")}>Tiga paket</Button>
          </div>
          {tiersFor(mode).map((t) => (
            <div key={t} className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="font-semibold">{TIER_LABEL[t]}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Nama paket</Label><Input value={pkgs[t].name} maxLength={80} onChange={(e) => setPkg(t, { name: e.target.value })} placeholder="Landing page sederhana" /></div>
                <div><Label>Harga (Rp)</Label><Input inputMode="numeric" value={pkgs[t].price} onChange={(e) => setPkg(t, { price: digitsOnly(e.target.value) })} /></div>
                <div><Label>Waktu pengerjaan (hari)</Label><Input inputMode="numeric" value={pkgs[t].delivery_days} onChange={(e) => setPkg(t, { delivery_days: digitsOnly(e.target.value) })} /></div>
                <div><Label>Jumlah revisi</Label><Input inputMode="numeric" value={pkgs[t].revisions} onChange={(e) => setPkg(t, { revisions: digitsOnly(e.target.value) })} /></div>
                <div><Label>Batas pekerjaan</Label><Input value={pkgs[t].work_limit} maxLength={500} onChange={(e) => setPkg(t, { work_limit: e.target.value })} placeholder="Hingga 5 section" /></div>
                <div className="sm:col-span-2"><Label>Deskripsi paket</Label><Textarea rows={2} value={pkgs[t].description} maxLength={1000} onChange={(e) => setPkg(t, { description: e.target.value })} /></div>
                <div className="sm:col-span-2"><Label>Fitur (satu per baris, maks 12)</Label><Textarea rows={4} value={pkgs[t].features} onChange={(e) => setPkg(t, { features: e.target.value })} /></div>
              </div>
              {estimate(t) && pkgs[t].price && <p className="text-xs text-muted-foreground">{estimate(t)}</p>}
            </div>
          ))}
        </fieldset></TabsContent>

        <TabsContent value="addon"><fieldset disabled={locked} className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">Tambahan berbayar yang bisa dipilih pembeli, misalnya halaman tambahan, revisi tambahan, atau source code.</p>
          {addons.length === 0 && <p className="text-sm text-muted-foreground">Belum ada add-on.</p>}
          {addons.map((a, i) => (
            <div key={a.id ?? `n${i}`} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Add-on {i + 1}</h3><Button type="button" size="sm" variant="ghost" onClick={() => setAddons((x) => x.filter((_, j) => j !== i))}><Trash2 /> Hapus</Button></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3"><Label>Nama</Label><Input value={a.name} maxLength={80} onChange={(e) => setAddon(i, { name: e.target.value })} /></div>
                <div><Label>Harga (Rp)</Label><Input inputMode="numeric" value={a.price} onChange={(e) => setAddon(i, { price: digitsOnly(e.target.value) })} /></div>
                <div><Label>Tambahan hari</Label><Input inputMode="numeric" value={a.extra_days} onChange={(e) => setAddon(i, { extra_days: digitsOnly(e.target.value) })} /></div>
                <div><Label>Tambahan revisi</Label><Input inputMode="numeric" value={a.extra_revisions} onChange={(e) => setAddon(i, { extra_revisions: digitsOnly(e.target.value) })} /></div>
                <div className="sm:col-span-3"><Label>Deskripsi</Label><Input value={a.description} maxLength={500} onChange={(e) => setAddon(i, { description: e.target.value })} /></div>
              </div>
            </div>
          ))}
          {addons.length < 10 && <Button type="button" variant="secondary" size="sm" onClick={() => setAddons((x) => [...x, emptyAddon()])}><Plus /> Tambah add-on</Button>}
        </fieldset></TabsContent>

        <TabsContent value="faq"><fieldset disabled={locked} className="min-w-0 space-y-6">
          <div className="space-y-3">
            <h3 className="font-semibold">FAQ</h3>
            {faqs.map((q, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <Input value={q.question} maxLength={200} placeholder="Pertanyaan" onChange={(e) => setFaq(i, { question: e.target.value })} />
                <Textarea rows={2} value={q.answer} maxLength={2000} placeholder="Jawaban" onChange={(e) => setFaq(i, { answer: e.target.value })} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setFaqs((x) => x.filter((_, j) => j !== i))}><Trash2 /> Hapus</Button>
              </div>
            ))}
            {faqs.length < 10 && <Button type="button" variant="secondary" size="sm" onClick={() => setFaqs((x) => [...x, { question: "", answer: "" }])}><Plus /> Tambah FAQ</Button>}
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Galeri (maks 8 gambar)</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {gallery.map((g, i) => (
                <div key={g.url} className="relative aspect-video overflow-hidden rounded-md border border-border bg-muted">
                  <img src={g.url} alt="" loading="lazy" className="size-full object-cover" />
                  <button type="button" aria-label="Hapus gambar" className="absolute right-1 top-1 rounded-full bg-background/90 p-1" onClick={() => setGallery((x) => x.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
                </div>
              ))}
            </div>
            {gallery.length < 8 && <ImageUpload value={null} onChange={(u) => { if (u) setGallery((x) => [...x, { url: u, caption: "" }]); }} folder="gallery" label="Tambah gambar" />}
          </div>
        </fieldset></TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <p className="text-sm text-muted-foreground">Pratinjau: begini jasa kamu terlihat oleh pembeli. Belum dipublikasikan.</p>
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            {info.cover_url && <img src={info.cover_url} alt="" className="aspect-video w-full rounded-md object-cover" />}
            <div>
              <h2 className="text-xl font-bold">{info.title || "Judul jasa"}</h2>
              <p className="text-sm text-muted-foreground">oleh {profile.display_name || profile.username}{seller.data.tagline && ` · ${seller.data.tagline}`}</p>
              {info.summary && <p className="mt-2 text-sm">{info.summary}</p>}
              {parseSkills(info.skills).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{parseSkills(info.skills).map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>}
            </div>
            {gallery.length > 0 && <div className="grid grid-cols-3 gap-2">{gallery.map((g) => <img key={g.url} src={g.url} alt="" className="aspect-video rounded object-cover" />)}</div>}
            {info.description && <p className="whitespace-pre-wrap text-sm">{info.description}</p>}
            <div className={`grid gap-3 ${mode === "three" ? "sm:grid-cols-3" : ""}`}>
              {tiersFor(mode).map((t) => (
                <div key={t} className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs uppercase text-muted-foreground">{TIER_LABEL[t]}</p>
                  <p className="font-semibold">{pkgs[t].name || "Nama paket"}</p>
                  <p className="text-lg font-bold text-primary">{formatRupiah(Number(pkgs[t].price || 0), "Rp—")}</p>
                  <p className="text-muted-foreground">{pkgs[t].delivery_days || "—"} hari · {pkgs[t].revisions || 0} revisi{pkgs[t].work_limit && ` · ${pkgs[t].work_limit}`}</p>
                  {pkgs[t].description && <p className="mt-1">{pkgs[t].description}</p>}
                  <ul className="mt-2 list-disc space-y-0.5 pl-4">{splitLines(pkgs[t].features).map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
              ))}
            </div>
            {addons.some((a) => a.name.trim()) && (
              <div className="space-y-1 text-sm"><h3 className="font-semibold">Add-on</h3>
                {addons.filter((a) => a.name.trim()).map((a, i) => <p key={a.id ?? i}>{a.name} — {formatRupiah(Number(a.price || 0), "Rp—")}{Number(a.extra_days) > 0 && ` · +${a.extra_days} hari`}{Number(a.extra_revisions) > 0 && ` · +${a.extra_revisions} revisi`}</p>)}
              </div>
            )}
            {faqs.some((q) => q.question.trim()) && (
              <div className="space-y-2 text-sm"><h3 className="font-semibold">FAQ</h3>
                {faqs.filter((q) => q.question.trim()).map((q, i) => <div key={i}><p className="font-medium">{q.question}</p><p className="text-muted-foreground">{q.answer}</p></div>)}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {canSubmit && readiness.length > 0 && (
        <Alert><AlertDescription><p className="font-medium">Lengkapi sebelum {moderated ? "diajukan" : "diterbitkan"}:</p><ul className="list-disc pl-5">{readiness.map((r) => <li key={r}>{r}</li>)}</ul></AlertDescription></Alert>
      )}

      {!locked && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-2 border-t border-border bg-background/95 p-3 backdrop-blur">
          <Button type="button" variant="secondary" disabled={busy} onClick={saveDraft}><Save /> {canSubmit ? "Simpan draf" : "Simpan perubahan"}</Button>
          {canSubmit && <Button type="button" disabled={busy || readiness.length > 0} onClick={submit}><Send /> {moderated ? "Ajukan untuk ditinjau" : "Terbitkan"}</Button>}
          {status === "draft" && <Button type="button" variant="ghost" disabled={busy} onClick={removeDraft}><Trash2 /> Hapus draft</Button>}
        </div>
      )}
    </div>
  );
}
