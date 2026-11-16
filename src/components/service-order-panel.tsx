import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Minus, Plus, Send, ShieldCheck, X } from "lucide-react";
import { errMsg, formatRupiah } from "@/lib/market";
import {
  BRIEF_MAX, BRIEF_MIN, MAX_ADDON_QTY, MAX_REFERENCES, checkoutErrors, checkoutPreview, clampQty, customRequestErrors, newRequestKey,
  normalizeReferences, selectionToPayload, todayISO, validReferenceUrl,
  type AddonSelection, type CheckoutAddon, type CheckoutPackage, type CheckoutQuote, type Reference,
} from "@/lib/services-checkout";
import { serviceRpc } from "@/lib/services-db";
import { ImageUpload } from "@/components/image-upload";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<string, string> = { basic: "Basic", standard: "Standard", premium: "Premium" };

export type PanelPackage = CheckoutPackage & { tier: string };

type Props = {
  service: { id: string; title: string };
  packages: PanelPackage[];
  addons: CheckoutAddon[];
  selectedPkgId: string | null;
  onSelectPackage: (id: string | null) => void;
  fromPrice: number;
};

/** Lampiran referensi: gambar yang diunggah atau tautan https. Maksimal 5. */
function ReferenceField({ refs, onChange, disabled }: { refs: Reference[]; onChange: (r: Reference[]) => void; disabled?: boolean }) {
  const [link, setLink] = useState("");
  const full = refs.length >= MAX_REFERENCES;
  function addLink() {
    if (!validReferenceUrl(link)) { toast.error("Tautan harus diawali https:// dan tanpa spasi."); return; }
    onChange(normalizeReferences([...refs, { url: link.trim(), name: "" }]));
    setLink("");
  }
  return (
    <div className="space-y-2">
      <Label>Referensi (opsional, maks {MAX_REFERENCES})</Label>
      {refs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {refs.map((r) => (
            <li key={r.url} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1">
              <Link2 className="size-3.5 shrink-0" />
              <a href={r.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate hover:underline">{r.name || r.url}</a>
              <button type="button" aria-label="Hapus lampiran" onClick={() => onChange(refs.filter((x) => x.url !== r.url))}><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (Figma, Drive, situs contoh)" disabled={disabled} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
            <Button type="button" variant="secondary" onClick={addLink} disabled={disabled || !link.trim()}>Tambah</Button>
          </div>
          <ImageUpload value={null} onChange={(u) => { if (u) onChange(normalizeReferences([...refs, { url: u, name: "Gambar referensi" }])); }} folder="references" label="Unggah gambar referensi" />
        </>
      )}
    </div>
  );
}

function PackageCheckout({ service, packages, addons, selectedPkgId, onSelectPackage }: Props) {
  const navigate = useNavigate();
  const [sel, setSel] = useState<AddonSelection>({});
  const [brief, setBrief] = useState("");
  const [refs, setRefs] = useState<Reference[]>([]);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  // Satu kunci per sesi checkout: klik ganda atau percobaan ulang mengembalikan pesanan yang sama, bukan pesanan baru.
  const [requestKey] = useState(() => newRequestKey());
  const pkg = packages.find((p) => p.id === selectedPkgId) ?? null;
  const payload = useMemo(() => selectionToPayload(sel), [sel]);
  const preview = useMemo(() => {
    if (!pkg) return null;
    try { return checkoutPreview(pkg, addons, sel); } catch { return null; }
  }, [pkg, addons, sel]);

  const quote = useQuery({
    queryKey: ["service-quote", service.id, pkg?.id, JSON.stringify(payload)],
    enabled: !!pkg,
    staleTime: 30_000,
    retry: false,
    queryFn: () => serviceRpc<CheckoutQuote>("service_checkout_quote", { _service_id: service.id, _package_id: pkg!.id, _addons: payload }),
  });

  const q = quote.data;
  const total = q?.total ?? preview?.total ?? 0;
  const days = q?.delivery_days ?? preview?.deliveryDays ?? 0;
  const revs = q?.revisions ?? preview?.revisions ?? 0;
  const lines = q
    ? q.items.map((i) => ({ key: i.id, name: i.name, qty: i.quantity, unit: i.unit_price, sum: i.unit_price * i.quantity }))
    : (preview?.lines ?? []).map((l, i) => ({ key: `${l.kind}${i}`, name: l.name, qty: l.quantity, unit: l.unitPrice, sum: l.lineTotal }));
  const briefLen = brief.trim().length;

  const setQty = (id: string, n: number) => setSel((s) => ({ ...s, [id]: clampQty(n) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg) { toast.error("Pilih paket dulu."); return; }
    const errs = checkoutErrors({ brief, acceptTerms: accept });
    if (errs.length) { toast.error(errs[0]); return; }
    setBusy(true);
    try {
      const oid = await serviceRpc<string>("service_create_order", {
        _service_id: service.id, _package_id: pkg.id, _addons: payload, _brief: brief.trim(),
        _references: normalizeReferences(refs), _accept_terms: accept, _request_key: requestKey,
      });
      toast.success("Pesanan dibuat. Lanjutkan ke pembayaran.");
      navigate({ to: "/pesanan/$id", params: { id: oid } });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Paket</legend>
        {packages.map((p) => (
          <label key={p.id} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm", p.id === selectedPkgId ? "border-primary bg-primary/5" : "border-border")}>
            <input type="radio" name="pkg" className="mt-1" checked={p.id === selectedPkgId} onChange={() => onSelectPackage(p.id)} />
            <span className="min-w-0 flex-1"><b>{TIER_LABEL[p.tier] ?? p.tier}</b> · {p.name}<span className="block text-xs text-muted-foreground">{p.delivery_days} hari · {p.revisions} revisi</span></span>
            <b className="shrink-0 text-primary">{formatRupiah(p.price)}</b>
          </label>
        ))}
      </fieldset>

      {pkg && addons.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Add-on (opsional)</legend>
          {addons.map((a) => {
            const qty = sel[a.id] ?? 0;
            return (
              <div key={a.id} className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm">
                <span className="min-w-0 flex-1"><b>{a.name}</b><span className="block text-xs text-muted-foreground">{formatRupiah(a.price)}{a.extra_days > 0 && ` · +${a.extra_days} hari`}{a.extra_revisions > 0 && ` · +${a.extra_revisions} revisi`}</span></span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="icon" variant="outline" className="size-7" aria-label={`Kurangi ${a.name}`} disabled={qty <= 0} onClick={() => setQty(a.id, qty - 1)}><Minus /></Button>
                  <span className="w-6 text-center tabular-nums" aria-live="polite">{qty}</span>
                  <Button type="button" size="icon" variant="outline" className="size-7" aria-label={`Tambah ${a.name}`} disabled={qty >= MAX_ADDON_QTY} onClick={() => setQty(a.id, qty + 1)}><Plus /></Button>
                </div>
              </div>
            );
          })}
        </fieldset>
      )}

      <div>
        <Label htmlFor="brief">Kebutuhan / brief pekerjaan</Label>
        <Textarea id="brief" rows={5} maxLength={BRIEF_MAX} value={brief} onChange={(e) => setBrief(e.target.value)} aria-describedby="brief-hint"
          placeholder="Ceritakan kebutuhanmu: tujuan, halaman/fitur, contoh yang kamu suka, deadline." />
        <p id="brief-hint" className={cn("mt-1 text-xs", briefLen > 0 && briefLen < BRIEF_MIN ? "text-destructive" : "text-muted-foreground")}>
          {briefLen >= BRIEF_MIN ? "Makin jelas kebutuhanmu, makin tepat hasilnya." : `Minimal ${BRIEF_MIN} karakter (${briefLen}/${BRIEF_MIN}).`}
        </p>
      </div>

      <ReferenceField refs={refs} onChange={setRefs} disabled={busy} />

      {pkg ? (
        <section className="space-y-2 rounded-lg bg-muted p-3 text-sm" aria-label="Ringkasan biaya">
          <h3 className="font-semibold">Ringkasan pesanan</h3>
          <ul className="space-y-1">
            {lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-2"><span className="min-w-0">{l.name}{l.qty > 1 && ` × ${l.qty}`}</span><span className="shrink-0">{formatRupiah(l.sum)}</span></li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><span className="text-primary">{formatRupiah(total)}</span></p>
          <p className="text-xs text-muted-foreground">Estimasi pengerjaan {days} hari · {revs} revisi termasuk.</p>
          <p className="text-xs text-muted-foreground">
            {q ? "Total dihitung server dan dihitung ulang lagi saat pesanan dibuat." : quote.error ? `Ringkasan sementara (server belum menghitung): ${errMsg(quote.error)}` : "Menghitung total di server…"}
          </p>
        </section>
      ) : <p className="text-sm text-muted-foreground">Pilih paket untuk melihat ringkasan biaya.</p>}

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" />
        <span>Saya sudah memeriksa paket, add-on, total, estimasi waktu, dan jumlah revisi, serta menyetujui ketentuan jasa di halaman ini.</span>
      </label>

      <Button className="w-full" disabled={busy || !pkg || briefLen < BRIEF_MIN || !accept}><Send /> {busy ? "Membuat pesanan…" : "Pesan sekarang"}</Button>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>Pesanan dibuat dengan status menunggu pembayaran. Dana disimpan di escrow dan baru diteruskan ke developer setelah kamu menerima hasil.</span>
      </p>
    </form>
  );
}

function CustomRequest({ service, fromPrice }: Props) {
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", description: "", budget: "", deadline: "", note: "" });
  const [refs, setRefs] = useState<Reference[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = customRequestErrors(f);
    if (errs.length) { toast.error(errs[0]); return; }
    setBusy(true);
    try {
      const oid = await serviceRpc<string>("service_request_custom", {
        _service_id: service.id, _title: f.title.trim(), _description: f.description.trim(),
        _budget: f.budget ? Number(f.budget) : null, _deadline: f.deadline || null, _note: f.note.trim(), _references: normalizeReferences(refs),
      });
      toast.success("Permintaan terkirim ke developer");
      navigate({ to: "/pesanan/$id", params: { id: oid } });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">Butuh pekerjaan di luar paket? Ceritakan kebutuhanmu. Developer akan menerima atau menolak, lalu menentukan harga final. Kamu baru membayar setelah itu.</p>
      <div><Label htmlFor="ct">Judul kebutuhan</Label><Input id="ct" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Integrasi pembayaran ke toko online" /></div>
      <div><Label htmlFor="cd">Deskripsi</Label><Textarea id="cd" rows={5} value={f.description} maxLength={4000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Jelaskan pekerjaan yang dibutuhkan sejelas mungkin." /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div><Label htmlFor="cb">Budget (opsional)</Label><RupiahInput id="cb" value={f.budget} onValueChange={(v) => setF({ ...f, budget: v })} placeholder={fromPrice ? formatRupiah(fromPrice) : "Rp 0"} /></div>
        <div><Label htmlFor="cdl">Deadline (opsional)</Label><Input id="cdl" type="date" min={todayISO()} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
      </div>
      <div><Label htmlFor="cn">Catatan (opsional)</Label><Textarea id="cn" rows={2} value={f.note} maxLength={1000} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <ReferenceField refs={refs} onChange={setRefs} disabled={busy} />
      <Button className="w-full" disabled={busy}><Send /> {busy ? "Mengirim…" : "Kirim permintaan khusus"}</Button>
    </form>
  );
}

/** Panel pemesanan di halaman detail jasa: pesan paket (jika ada paket) atau kirim permintaan khusus. */
export function ServiceOrderPanel(props: Props) {
  const hasPackages = props.packages.length > 0;
  const [mode, setMode] = useState<"package" | "custom">(hasPackages ? "package" : "custom");
  const active = hasPackages ? mode : "custom";
  // Memilih paket dari kartu paket di halaman otomatis membuka tab "Pesan paket".
  useEffect(() => {
    if (props.selectedPkgId && hasPackages) setMode("package");
  }, [props.selectedPkgId, hasPackages]);
  return (
    <div className="mt-4 space-y-4">
      {hasPackages && (
        <div role="tablist" aria-label="Jenis pesanan" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          {([["package", "Pesan paket"], ["custom", "Permintaan khusus"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={active === k} onClick={() => setMode(k)}
              className={cn("rounded-md px-2 py-1.5 font-medium transition", active === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
      )}
      {active === "package" ? <PackageCheckout {...props} /> : <CustomRequest {...props} />}
    </div>
  );
}
