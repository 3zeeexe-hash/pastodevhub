import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { prepareAdminLogin } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GobiLoader } from "@/components/gobi-loader";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Pastodev" },
      { name: "description", content: "Dasbor admin Pastodev: pengguna, verifikasi, fitur, moderasi, dan pembayaran." },
      { property: "og:title", content: "Admin — Pastodev" },
      { property: "og:description", content: "Panel admin Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isAdmin, loading, adminLoading } = useAuth();
  if (loading || adminLoading) {
    return <GobiLoader page />;
  }
  if (!isAdmin) return <AdminLogin signedInAs={user ? (user.email ?? "akun lain") : null} />;
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
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
      const session = await prepare({ data: { username: username.trim(), password } });
      const { error: signInError } = await supabase.auth.setSession(session);
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
        <Link to="/" className="block text-center text-xs text-muted-foreground hover:underline">Kembali ke beranda</Link>
      </form>
    </main>
  );
}
