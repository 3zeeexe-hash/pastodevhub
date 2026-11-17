import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Copy, CreditCard, Loader2, PlugZap } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import {
  MAX_FEE_FLAT, MAX_FEE_PERCENT, MIDTRANS_METHODS, computeFee,
  type MidtransFees, type MidtransMethodId, type MidtransMode,
} from "@/lib/midtrans-shared";
import { getAdminMidtransSettings, saveAdminMidtransSettings, testAdminMidtrans } from "@/lib/midtrans.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAskAdmin } from "@/lib/admin-ask";

export const Route = createFileRoute("/admin/midtrans")({
  head: () => ({ meta: [{ title: "Midtrans — Admin GoBi" }, { name: "robots", content: "noindex" }] }),
  component: MidtransAdminPage,
});

/** Nilai kolom biaya disimpan sebagai teks supaya admin bebas mengetik "0,7" atau "0.7". */
type FeeDraft = Record<MidtransMethodId, { flat: string; percent: string }>;
const SAMPLE_AMOUNT = 100_000;

function feesToDraft(f: MidtransFees): FeeDraft {
  return Object.fromEntries(
    MIDTRANS_METHODS.map((m) => [m.id, {
      flat: f[m.id].flat ? String(f[m.id].flat) : "",
      percent: f[m.id].percent ? String(f[m.id].percent).replace(".", ",") : "",
    }]),
  ) as FeeDraft;
}

/** Kosong = 0. Mengembalikan null kalau teks bukan angka (dipakai untuk menandai kolom yang salah). */
function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

function MidtransAdminPage() {
  const ask = useAskAdmin();
  const load = useServerFn(getAdminMidtransSettings);
  const save = useServerFn(saveAdminMidtransSettings);
  const test = useServerFn(testAdminMidtrans);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-midtrans"], queryFn: () => load() });
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<MidtransMode>("sandbox");
  const [methods, setMethods] = useState<string[]>([]);
  const [fees, setFees] = useState<FeeDraft>(() => feesToDraft({ bca: { flat: 0, percent: 0 }, bni: { flat: 0, percent: 0 }, bri: { flat: 0, percent: 0 }, permata: { flat: 0, percent: 0 }, qris: { flat: 0, percent: 0 } }));
  const [sbServer, setSbServer] = useState("");
  const [sbClient, setSbClient] = useState("");
  const [prodServer, setProdServer] = useState("");
  const [prodClient, setProdClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setMode(data.mode);
    setMethods(data.methods);
    setFees(feesToDraft(data.fees));
    setSbClient(data.sandboxClientKey);
    setProdClient(data.productionClientKey);
  }, [data?.updatedAt, data?.schemaReady]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Periksa kolom biaya dulu supaya pesan galatnya jelas menyebut metodenya.
    const parsedFees = {} as Record<MidtransMethodId, { flat: number; percent: number }>;
    for (const m of MIDTRANS_METHODS) {
      const flat = parseNum(fees[m.id].flat);
      const percent = parseNum(fees[m.id].percent);
      if (flat === null || !Number.isInteger(flat) || flat > MAX_FEE_FLAT) {
        toast.error(`Biaya tetap ${m.label} harus bilangan bulat 0–${MAX_FEE_FLAT.toLocaleString("id-ID")}.`);
        return;
      }
      if (percent === null || percent > MAX_FEE_PERCENT) {
        toast.error(`Persen ${m.label} harus angka 0–${MAX_FEE_PERCENT} (maksimal dua desimal, mis. 0,7).`);
        return;
      }
      parsedFees[m.id] = { flat, percent };
    }

    if (enabled && mode === "production" && !(await ask({ title: "Aktifkan mode produksi?", description: "Mode produksi memakai uang asli. Pastikan kunci produksi sudah benar.", confirmLabel: "Simpan mode produksi", destructive: true }))) return;
    setBusy(true);
    try {
      await save({ data: { enabled, mode, methods, sandboxServerKey: sbServer.trim(), sandboxClientKey: sbClient.trim(), productionServerKey: prodServer.trim(), productionClientKey: prodClient.trim(), fees: parsedFees } });
      setSbServer(""); setProdServer("");
      toast.success("Pengaturan Midtrans disimpan");
      qc.invalidateQueries({ queryKey: ["admin-midtrans"] });
      qc.invalidateQueries({ queryKey: ["midtrans-public"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTesting(true);
    try {
      await test({ data: { mode } });
      toast.success(`Koneksi Midtrans (${mode === "production" ? "produksi" : "sandbox"}) berhasil, server key valid.`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setTesting(false);
    }
  }

  const toggleMethod = (id: string, on: boolean) => setMethods((cur) => (on ? [...new Set([...cur, id])] : cur.filter((m) => m !== id)));
  const setFee = (id: MidtransMethodId, field: "flat" | "percent", value: string) =>
    setFees((cur) => ({ ...cur, [id]: { ...cur[id], [field]: value } }));
  const sampleFee = (id: MidtransMethodId) => {
    const flat = parseNum(fees[id].flat);
    const percent = parseNum(fees[id].percent);
    if (flat === null || percent === null) return null;
    return computeFee({ flat, percent }, SAMPLE_AMOUNT);
  };
  const modeBtn = (m: MidtransMode, label: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
      className={cn("rounded-md border px-4 py-2 text-sm", mode === m ? "border-primary bg-primary/10 font-semibold" : "border-border")}>{label}</button>
  );
  const savedKey = (has: boolean) => (has ? "Tersimpan — kosongkan jika tidak diganti" : "Tempel server key");

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-5" aria-label="Pengaturan Midtrans">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 shrink-0 text-primary" /> Pembayaran Midtrans (Core API)</h2>
          <p className="mt-1 text-sm text-muted-foreground">Client membayar lewat Virtual Account atau QRIS. Dana masuk escrow dan diteruskan ke developer oleh admin.</p>
          <p className="mt-2 text-sm">
            Status: {isLoading ? <Loader2 className="inline size-3.5 animate-spin" aria-label="Memuat" /> : enabled && data?.schemaReady ? <b className="text-success">Aktif — mode {mode === "production" ? "produksi" : "sandbox"}</b> : <b className="text-muted-foreground">Nonaktif</b>}
            {data?.updatedAt && <span className="text-muted-foreground"> · diperbarui {timeAgo(data.updatedAt)}</span>}
          </p>
          {data?.envFallback && <p className="mt-1 text-xs text-muted-foreground">Server juga punya MIDTRANS_SERVER_KEY di environment; dipakai jika pengaturan di sini kosong.</p>}
          {error && <p className="mt-2 text-sm text-destructive">{errMsg(error)}</p>}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Aktifkan pembayaran Midtrans" /> Aktif
        </label>
      </div>

      {data && !data.schemaReady && (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
          Database belum siap untuk Midtrans. Jalankan <code>docs/sql/midtrans-escrow/001_midtrans_escrow.sql</code> di SQL editor, lalu muat ulang halaman ini.
          {data.schemaError && <span className="mt-1 block text-xs text-muted-foreground">{data.schemaError}</span>}
        </p>
      )}

      <div>
        <Label>Mode</Label>
        <div className="mt-1 flex gap-2">{modeBtn("sandbox", "Sandbox (uji coba)")}{modeBtn("production", "Produksi (uang asli)")}</div>
        <p className="mt-1 text-xs text-muted-foreground">Server key tiap mode disimpan terpisah, jadi bisa berpindah mode tanpa menempel ulang.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 text-sm font-medium">Sandbox</div>
        <div><Label htmlFor="mt-sb-server">Server key sandbox</Label><Input id="mt-sb-server" type="password" autoComplete="new-password" value={sbServer} onChange={(e) => setSbServer(e.target.value)} placeholder={savedKey(!!data?.hasSandboxKey)} maxLength={200} /></div>
        <div><Label htmlFor="mt-sb-client">Client key sandbox</Label><Input id="mt-sb-client" value={sbClient} onChange={(e) => setSbClient(e.target.value)} placeholder="SB-Mid-client-…" maxLength={200} autoComplete="off" /></div>
        <div className="sm:col-span-2 pt-2 text-sm font-medium">Produksi</div>
        <div><Label htmlFor="mt-pr-server">Server key produksi</Label><Input id="mt-pr-server" type="password" autoComplete="new-password" value={prodServer} onChange={(e) => setProdServer(e.target.value)} placeholder={savedKey(!!data?.hasProductionKey)} maxLength={200} /></div>
        <div><Label htmlFor="mt-pr-client">Client key produksi</Label><Input id="mt-pr-client" value={prodClient} onChange={(e) => setProdClient(e.target.value)} placeholder="Mid-client-…" maxLength={200} autoComplete="off" /></div>
        <p className="sm:col-span-2 text-xs text-muted-foreground">Server key disimpan terenkripsi di server dan tidak pernah dikirim ke browser. Jangan tempel di chat atau repo.</p>
      </div>

      <div>
        <Label>Metode pembayaran yang ditawarkan</Label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {MIDTRANS_METHODS.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={methods.includes(m.id)} onCheckedChange={(v) => toggleMethod(m.id, v === true)} aria-label={m.label} /> {m.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Biaya admin per metode pembayaran</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Ditambahkan di atas harga pesanan dan dibayar pembeli; dana escrow developer tetap sebesar harga pesanan.
          Isi biaya tetap (Rp), persen dari harga pesanan, atau keduanya. Kosongkan untuk gratis.
          Contoh: VA Rp4.000 dan QRIS 0,7%.
        </p>
        {data && !data.feesReady && data.schemaReady && (
          <p role="alert" className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            Kolom biaya admin belum ada di database. Jalankan <code>docs/sql/midtrans-escrow/003_biaya_pembayaran.sql</code> di SQL editor, lalu muat ulang halaman ini.
          </p>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Metode</th>
                <th className="py-1 pr-3 font-medium">Biaya tetap (Rp)</th>
                <th className="py-1 pr-3 font-medium">Persen (%)</th>
                <th className="py-1 font-medium">Contoh pesanan {formatRupiah(SAMPLE_AMOUNT)}</th>
              </tr>
            </thead>
            <tbody>
              {MIDTRANS_METHODS.map((m) => {
                const sample = sampleFee(m.id);
                return (
                  <tr key={m.id} className="border-t border-border align-middle">
                    <td className="py-2 pr-3">{m.label}</td>
                    <td className="py-2 pr-3">
                      <Input inputMode="numeric" aria-label={`Biaya tetap ${m.label} (Rp)`} placeholder="0" className="w-32"
                        value={fees[m.id].flat} onChange={(e) => setFee(m.id, "flat", e.target.value)} disabled={!!data && !data.feesReady} maxLength={7} autoComplete="off" />
                    </td>
                    <td className="py-2 pr-3">
                      <Input inputMode="decimal" aria-label={`Persen ${m.label} (%)`} placeholder="0" className="w-24"
                        value={fees[m.id].percent} onChange={(e) => setFee(m.id, "percent", e.target.value)} disabled={!!data && !data.feesReady} maxLength={5} autoComplete="off" />
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {sample === null ? <span className="text-destructive">Angka tidak valid</span>
                        : sample > 0 ? <>Biaya {formatRupiah(sample)} · total <b className="text-foreground">{formatRupiah(SAMPLE_AMOUNT + sample)}</b></>
                        : "Gratis"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Persen dihitung dari harga pesanan dan dibulatkan ke atas ke rupiah penuh. Perubahan berlaku untuk pembayaran baru; pembayaran yang sudah dibuat tidak berubah.</p>
      </div>

      {data?.notificationUrl && (
        <div>
          <Label htmlFor="mt-notify">URL notifikasi (callback)</Label>
          <div className="flex gap-2">
            <Input id="mt-notify" readOnly value={data.notificationUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" aria-label="Salin URL notifikasi" onClick={() => { navigator.clipboard.writeText(data.notificationUrl); toast.success("Disalin"); }}><Copy /></Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Setiap permintaan pembayaran sudah mengirim URL ini lewat header <code>X-Override-Notification</code>. Sebagai cadangan, tempel juga di dashboard Midtrans → Settings → Configuration → Payment Notification URL.
            Kalau alamat situs berbeda dari domain asli, set <code>SITE_URL</code> di environment server.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || isLoading || !data?.schemaReady}>{busy && <Loader2 className="animate-spin" />} Simpan Midtrans</Button>
        <Button type="button" variant="outline" disabled={testing || !data?.schemaReady} onClick={runTest}>{testing ? <Loader2 className="animate-spin" /> : <PlugZap />} Tes koneksi ({mode === "production" ? "produksi" : "sandbox"})</Button>
      </div>
    </form>
  );
}
