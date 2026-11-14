import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { errMsg } from "@/lib/market";
import { SELLER_TERMS } from "@/lib/services-owner";
import { serviceRpc, type SellerProfileRow } from "@/lib/services-db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Aktivasi (atau ubah) profil penyedia jasa. Hanya akun developer; profil yang dibatasi admin tidak bisa diaktifkan sendiri. */
export function SellerActivationCard({ seller, accountType, onDone }: {
  seller: SellerProfileRow | null; accountType: string | null | undefined; onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [tagline, setTagline] = useState(seller?.tagline ?? "");
  const [hours, setHours] = useState(seller?.response_time_hours ? String(seller.response_time_hours) : "");
  const [agree, setAgree] = useState(!!seller?.terms_accepted_at);
  const [busy, setBusy] = useState(false);

  if (accountType !== "developer") {
    return <Alert><AlertDescription>Hanya akun developer yang bisa membuka jasa. Akun client dapat memesan jasa dari developer.</AlertDescription></Alert>;
  }
  if (seller?.suspended_at) {
    return <Alert variant="destructive"><AlertDescription>Profil penyedia jasa kamu sedang dibatasi admin{seller.suspended_reason ? `: ${seller.suspended_reason}` : "."}</AlertDescription></Alert>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = hours.trim() === "" ? null : Number(hours);
    if (h !== null && !(Number.isInteger(h) && h >= 1 && h <= 720)) { toast.error("Waktu respons 1–720 jam."); return; }
    if (!agree) { toast.error("Setujui ketentuan penyedia jasa dulu."); return; }
    setBusy(true);
    try {
      await serviceRpc("service_activate_seller", { _tagline: tagline.trim(), _response_hours: h, _accept_terms: true });
      toast.success(seller?.is_active ? "Profil penyedia diperbarui" : "Profil penyedia aktif");
      await qc.invalidateQueries({ queryKey: ["service-seller"] });
      onDone?.();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2"><Store className="size-5 text-primary" /><h2 className="text-lg font-semibold">{seller?.is_active ? "Profil penyedia jasa" : "Aktifkan profil penyedia jasa"}</h2></div>
      <div><Label htmlFor="tag">Tagline</Label><Input id="tag" value={tagline} maxLength={120} onChange={(e) => setTagline(e.target.value)} placeholder="Full-stack developer, spesialis landing page" /></div>
      <div><Label htmlFor="rh">Perkiraan waktu respons (jam)</Label><Input id="rh" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} placeholder="Kosong = tidak ditampilkan" /></div>
      <div className="space-y-2 text-sm">
        <p className="font-medium">Ketentuan penyedia jasa</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{SELLER_TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
        <label className="flex items-start gap-2 pt-1"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" /><span>Saya setuju dengan ketentuan di atas.</span></label>
      </div>
      <Button disabled={busy}>{seller?.is_active ? "Simpan profil" : "Aktifkan"}</Button>
    </form>
  );
}
