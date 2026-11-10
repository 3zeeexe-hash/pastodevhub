import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Github, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { getAdminGithubSettings, prepareAdminLogin, saveAdminGithubSettings } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Pastodev" },
      { name: "description", content: "Pengaturan pembayaran, verifikasi pembayaran, dan pencairan dana developer." },
      { property: "og:title", content: "Admin — Pastodev" },
      { property: "og:description", content: "Panel admin Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Settings = { bank_name: string; account_number: string; account_name: string; qris_url: string; payment_instructions: string; fee_percent: string };

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState<Settings>({ bank_name: "", account_number: "", account_name: "", qris_url: "", payment_instructions: "", fee_percent: "10" });
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", user?.id],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const [settings, reviews, payouts] = await Promise.all([
        supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("orders").select("id,number,title,amount,updated_at").eq("status", "payment_review").order("updated_at"),
        supabase.from("payouts").select("*, developer:profiles!payouts_developer_id_fkey(username,display_name)").eq("status", "requested").order("created_at"),
      ]);
      return { settings: settings.data, reviews: reviews.data ?? [], payouts: (payouts.data ?? []) as any[] };
    },
  });
  useEffect(() => {
    const s = data?.settings;
    if (s) setF({ bank_name: s.bank_name ?? "", account_number: s.account_number ?? "", account_name: s.account_name ?? "", qris_url: s.qris_url ?? "", payment_instructions: s.payment_instructions ?? "", fee_percent: String(s.fee_percent ?? 10) });
  }, [data?.settings?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <main className="mx-auto max-w-5xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!isAdmin) return <AdminLogin signedInAs={user ? (user.email ?? "akun lain") : null} />;

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    const fee = Number(f.fee_percent);
    if (!(fee >= 0 && fee <= 50)) { toast.error("Biaya platform 0–50%."); return; }
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({
      id: 1, bank_name: f.bank_name || null, account_number: f.account_number || null, account_name: f.account_name || null,
      qris_url: f.qris_url || null, payment_instructions: f.payment_instructions, fee_percent: fee, updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Pengaturan pembayaran disimpan"); qc.invalidateQueries({ queryKey: ["admin"] }); }
  }
  async function payout(id: string, approve: boolean) {
    const note = approve ? "" : prompt("Alasan penolakan?") ?? "";
    const { error } = await supabase.rpc("process_payout", { _payout_id: id, _approve: approve, _note: note });
    if (error) toast.error(error.message); else { toast.success(approve ? "Ditandai sudah ditransfer" : "Pencairan ditolak"); qc.invalidateQueries({ queryKey: ["admin"] }); }
  }
  const field = (k: keyof Settings, label: string, ph = "") => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="size-6 text-primary" /> Admin</h1>
        <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}><LogOut /> Keluar</Button>
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Pembayaran perlu diverifikasi ({data?.reviews.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {data?.reviews.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>#{o.number} · {o.title} · <b>{formatRupiah(o.amount)}</b> · {timeAgo(o.updated_at)}</span>
              <Button asChild size="sm"><Link to="/pesanan/$id" params={{ id: o.id }}>Cek bukti</Link></Button>
            </li>
          ))}
          {data?.reviews.length === 0 && <li className="py-2 text-muted-foreground">Tidak ada.</li>}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Pengajuan pencairan ({data?.payouts.length ?? 0})</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {data?.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>@{p.developer?.username} · <b>{formatRupiah(p.amount)}</b> → {p.bank_name} {p.account_number} a.n. {p.account_name}</span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => payout(p.id, true)}>Sudah ditransfer</Button>
                <Button size="sm" variant="ghost" onClick={() => payout(p.id, false)}>Tolak</Button>
              </span>
            </li>
          ))}
          {data?.payouts.length === 0 && <li className="py-2 text-muted-foreground">Tidak ada.</li>}
        </ul>
      </section>
      <form onSubmit={saveSettings} className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Rekening & QRIS platform</h2>
        {field("bank_name", "Bank / e-wallet", "BCA")}
        {field("account_number", "Nomor rekening")}
        {field("account_name", "Atas nama")}
        {field("qris_url", "Link gambar QRIS", "https://…")}
        {field("fee_percent", "Biaya platform (%)")}
        <div className="sm:col-span-2"><Label htmlFor="pi">Instruksi pembayaran</Label><Textarea id="pi" value={f.payment_instructions} onChange={(e) => setF({ ...f, payment_instructions: e.target.value })} /></div>
        <Button className="sm:w-fit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Simpan</Button>
      </form>
      <GithubSettingsForm />
    </main>
  );
}

function AdminLogin({ signedInAs }: { signedInAs: string | null }) {
  const prepare = useServerFn(prepareAdminLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { email } = await prepare({ data: { username: username.trim(), password } });
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      toast.success("Masuk sebagai admin");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bg-hero flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-glow" aria-label="Login admin">
        <div className="text-center">
          <ShieldCheck className="mx-auto size-10 text-primary" />
          <h1 className="mt-3 text-2xl font-bold">Login admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Khusus pengelola Pastodev.</p>
        </div>
        {signedInAs && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Kamu sedang masuk sebagai {signedInAs}, yang bukan admin. Login di sini akan mengganti akun yang aktif.
          </p>
        )}
        <div><Label htmlFor="admin-username">Username</Label><Input id="admin-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={60} /></div>
        <div><Label htmlFor="admin-password">Kata sandi</Label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy || !username.trim() || !password}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Masuk
        </Button>
      </form>
    </main>
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
