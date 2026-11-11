import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileJson, Flame, Github, Loader2, Upload } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { getAdminFirebaseSettings, getAdminGithubSettings, saveAdminFirebaseSettings, saveAdminGithubSettings } from "@/lib/admin.functions";
import { parseFirebaseConfig, parseServiceAccount } from "@/lib/firebase-config";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/integrasi")({
  head: () => ({ meta: [{ title: "Integrasi — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <FirebaseSettingsForm />
      <GithubSettingsForm />
    </div>
  );
}

function GithubSettingsForm() {
  const load = useServerFn(getAdminGithubSettings);
  const save = useServerFn(saveAdminGithubSettings);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-github"], queryFn: () => load() });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setClientId(data.clientId); }, [data?.clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (clientId.trim() && !data?.hasSecret && !clientSecret.trim()) { toast.error("Isi Client secret juga."); return; }
    setBusy(true);
    try {
      await save({ data: { clientId: clientId.trim(), clientSecret: clientSecret.trim() } });
      setClientSecret("");
      toast.success(clientId.trim() ? "Pengaturan GitHub disimpan" : "Pengaturan GitHub dihapus");
      qc.invalidateQueries({ queryKey: ["admin-github"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const connected = !!data?.clientId && data.hasSecret;
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2" aria-label="Pengaturan GitHub">
      <div className="sm:col-span-2">
        <h2 className="flex items-center gap-2 font-semibold"><Github className="size-5 text-primary" /> Aplikasi GitHub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dipakai developer untuk menghubungkan akun GitHub, impor, dan ekspor repo. Buat di GitHub → Settings → Developer settings → OAuth Apps.
        </p>
        <p className="mt-2 text-sm">
          Status: {isLoading ? "memuat…" : connected ? <b className="text-success">Aktif</b> : data?.envFallback ? <b>Memakai pengaturan server</b> : <b className="text-destructive">Belum diatur</b>}
          {data?.updatedAt && <span className="text-muted-foreground"> · diperbarui {timeAgo(data.updatedAt)}</span>}
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{errMsg(error)}</p>}
      </div>
      {data?.callbackUrl && (
        <div className="sm:col-span-2">
          <Label htmlFor="gh-callback">Authorization callback URL (tempel di GitHub)</Label>
          <div className="flex gap-2">
            <Input id="gh-callback" readOnly value={data.callbackUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" aria-label="Salin callback URL" onClick={() => { navigator.clipboard.writeText(data.callbackUrl); toast.success("Disalin"); }}><Copy /></Button>
          </div>
        </div>
      )}
      <div><Label htmlFor="gh-client-id">Client ID</Label><Input id="gh-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Ov23li…" maxLength={100} autoComplete="off" /></div>
      <div>
        <Label htmlFor="gh-client-secret">Client secret</Label>
        <Input id="gh-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={data?.hasSecret ? "Tersimpan — kosongkan jika tidak diganti" : "Tempel client secret"} maxLength={200} autoComplete="new-password" />
      </div>
      <Button className="sm:w-fit" disabled={busy || isLoading}>{busy && <Loader2 className="animate-spin" />} Simpan GitHub</Button>
    </form>
  );
}

function FirebaseSettingsForm() {
  const load = useServerFn(getAdminFirebaseSettings);
  const save = useServerFn(saveAdminFirebaseSettings);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-firebase"], queryFn: () => load() });
  const [enabled, setEnabled] = useState(false);
  const [configText, setConfigText] = useState("");
  const [saJson, setSaJson] = useState("");
  const [saName, setSaName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setConfigText(data.config ? JSON.stringify(data.config, null, 2) : "");
  }, [data?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFile(file: File | undefined, target: "config" | "sa") {
    if (!file) return;
    if (file.size > 20000) { toast.error("File terlalu besar."); return; }
    const text = await file.text();
    try {
      if (target === "sa") { parseServiceAccount(text); setSaJson(text); setSaName(file.name); }
      else { setConfigText(JSON.stringify(parseFirebaseConfig(text), null, 2)); }
    } catch (err) { toast.error(errMsg(err)); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { if (configText.trim()) parseFirebaseConfig(configText); } catch (err) { toast.error(errMsg(err)); return; }
    setBusy(true);
    try {
      await save({ data: { enabled, configText, serviceAccountJson: saJson } });
      setSaJson(""); setSaName("");
      toast.success(enabled ? "Login Google lewat Firebase aktif" : "Pengaturan Firebase disimpan");
      qc.invalidateQueries({ queryKey: ["admin-firebase"] });
      qc.invalidateQueries({ queryKey: ["firebase-public"] });
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  async function clearAll() {
    if (!confirm("Hapus semua pengaturan Firebase? Login Google kembali ke bawaan.")) return;
    setBusy(true);
    try {
      await save({ data: { enabled: false, configText: "", serviceAccountJson: "", clear: true } });
      setConfigText(""); setSaJson(""); setSaName(""); setEnabled(false);
      toast.success("Pengaturan Firebase dihapus");
      qc.invalidateQueries({ queryKey: ["admin-firebase"] });
      qc.invalidateQueries({ queryKey: ["firebase-public"] });
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5" aria-label="Pengaturan login Google (Firebase)">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><Flame className="size-5 shrink-0 text-primary" /> Login Google (Firebase)</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pakai project Firebase kamu sendiri untuk tombol “Continue with Google”. Kalau dimatikan, login Google memakai bawaan Pastodev.</p>
          <p className="mt-2 text-sm">
            Status: {isLoading ? "memuat…" : data?.enabled ? <b className="text-success">Aktif — project {data.projectId}</b> : data?.config ? <b>Tersimpan, belum aktif</b> : <b className="text-muted-foreground">Belum diatur</b>}
            {data?.updatedAt && <span className="text-muted-foreground"> · diperbarui {timeAgo(data.updatedAt)}</span>}
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{errMsg(error)}</p>}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Aktifkan login Google lewat Firebase" /> Aktif
        </label>
      </div>

      <ol className="list-decimal space-y-1 rounded-md bg-muted p-3 pl-7 text-xs text-muted-foreground">
        <li>Firebase console → Project settings → General → Your apps → tambah <b>Web app</b>, salin <code>firebaseConfig</code>.</li>
        <li>Authentication → Sign-in method → aktifkan <b>Google</b>.</li>
        <li>Authentication → Settings → Authorized domains → tambahkan <code className="font-mono">{data?.siteDomain || "domain situs"}</code> dan domain publikasi kamu.</li>
        <li>Project settings → Service accounts → <b>Generate new private key</b>, lalu unggah file JSON-nya di bawah.</li>
      </ol>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="fb-config">Config web app (firebaseConfig / JSON)</Label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-link hover:underline">
            <Upload className="size-3.5" /> Unggah file config
            <input type="file" accept=".json,.js,.txt,application/json" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0], "config"); e.target.value = ""; }} />
          </label>
        </div>
        <Textarea id="fb-config" rows={7} className="font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)}
          placeholder={'const firebaseConfig = {\n  apiKey: "AIza…",\n  authDomain: "project.firebaseapp.com",\n  projectId: "project",\n  appId: "1:…:web:…"\n};'} />
      </div>

      <div>
        <Label>Service account JSON</Label>
        <div className="mt-1 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-3">
          <FileJson className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            {saName ? <span className="font-medium">{saName} <span className="text-muted-foreground">(siap disimpan)</span></span>
              : data?.hasServiceAccount ? <span>Tersimpan: <span className="break-all font-mono text-xs">{data.clientEmail}</span></span>
              : <span className="text-muted-foreground">Belum diunggah</span>}
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <label className="cursor-pointer"><Upload /> {data?.hasServiceAccount ? "Ganti file" : "Unggah file"}
              <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0], "sa"); e.target.value = ""; }} />
            </label>
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Disimpan terenkripsi di server dan tidak pernah dikirim ke browser.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || isLoading}>{busy && <Loader2 className="animate-spin" />} Simpan Firebase</Button>
        {(data?.config || data?.hasServiceAccount) && <Button type="button" variant="ghost" disabled={busy} onClick={clearAll}>Hapus pengaturan</Button>}
      </div>
    </form>
  );
}
