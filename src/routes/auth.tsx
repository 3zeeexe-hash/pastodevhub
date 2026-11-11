import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand";
import { AccountTypePicker } from "@/components/account-type-picker";
import type { AccountType } from "@/lib/market";
import { PENDING_TYPE_KEY } from "@/components/account-type-prompt";
import { firebaseSignIn, getFirebasePublicConfig } from "@/lib/firebase-auth.functions";
import { firebaseGoogleIdToken, preloadFirebase } from "@/lib/firebase-client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — Pastodev" },
      { name: "description", content: "Masuk atau daftar ke Pastodev, komunitas developer Nusantara." },
      { property: "og:title", content: "Masuk — Pastodev" },
      { property: "og:description", content: "Masuk atau daftar ke Pastodev." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const loadFirebase = useServerFn(getFirebasePublicConfig);
  const exchange = useServerFn(firebaseSignIn);
  const { data: firebase } = useQuery({ queryKey: ["firebase-public"], queryFn: () => loadFirebase(), staleTime: 60_000 });
  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);
  // Load Firebase before the tap so the Google popup opens right away (browsers block slow popups).
  useEffect(() => { if (firebase?.enabled && firebase.config) preloadFirebase(firebase.config); }, [firebase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      if (!accountType) { toast.error("Pilih daftar sebagai Developer atau Client."); setBusy(false); return; }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { username, account_type: accountType } } });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Cek email kamu untuk konfirmasi akun.");
    } else if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message.includes("confirm") ? "Email belum dikonfirmasi. Cek kotak masuk kamu." : "Email atau kata sandi salah.");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) toast.error(error.message); else toast.success("Link reset kata sandi sudah dikirim ke email kamu.");
    }
    setBusy(false);
  }
  async function oauth(provider: "google" | "lovable") {
    if (mode === "up" && accountType) window.localStorage.setItem(PENDING_TYPE_KEY, accountType);
    else window.localStorage.removeItem(PENDING_TYPE_KEY);
    let fb = firebase;
    if (provider === "google" && !fb) {
      try { fb = await loadFirebase(); } catch { fb = undefined; }
    }
    if (provider === "google" && fb?.enabled && fb.config) {
      setBusy(true);
      try {
        const idToken = await firebaseGoogleIdToken(fb.config);
        const session = await exchange({ data: { idToken, accountType: mode === "up" && accountType ? accountType : undefined } });
        const { error } = await supabase.auth.setSession(session);
        if (error) throw error;
      } catch (e) {
        toast.error((e as Error).message || "Gagal masuk dengan Google.");
      } finally { setBusy(false); }
      return;
    }
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (r.error) {
      console.error("Lovable sign-in failed", r.error);
      toast.error(provider === "google"
        ? "Gagal masuk dengan Google. Login Google bawaan hanya jalan di domain Lovable; di hosting sendiri admin perlu mengaktifkan Firebase di /admin (atau mengisi FIREBASE_WEB_CONFIG di server)."
        : "Gagal masuk dengan Lovable.");
    }
  }

  return (
    <main className="bg-hero flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-glow">
        <div className="flex flex-col items-center text-center">
          <BrandMark size={64} />
          <h1 className="mt-3 text-2xl font-bold">{mode === "in" ? "Masuk ke Pastodev" : mode === "up" ? "Buat akun Pastodev" : "Lupa kata sandi"}</h1>
        </div>
        {mode === "up" && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">Daftar sebagai</p>
            <AccountTypePicker value={accountType} onChange={setAccountType} />
          </div>
        )}
        {mode !== "forgot" && (
          <>
            <div className="mt-6 space-y-2">
              <Button type="button" variant="google" className="w-full" disabled={busy} onClick={() => oauth("google")}>
                <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
                Continue with Google
              </Button>
              <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>Continue with Lovable</button>
            </div>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />atau dengan email<span className="h-px flex-1 bg-border" /></div>
          </>
        )}
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <div><Label htmlFor="u">Username</Label><Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9_\-]{3,30}" title="3–30 huruf, angka, - atau _" /></div>
          )}
          <div><Label htmlFor="e">Email</Label><Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between"><Label htmlFor="p">Kata sandi</Label>
                {mode === "in" && <button type="button" onClick={() => setMode("forgot")} className="text-xs text-link hover:underline">Lupa?</button>}</div>
              <Input id="p" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          )}
          <Button className="w-full" disabled={busy}>{mode === "in" ? "Masuk" : mode === "up" ? "Daftar" : "Kirim link reset"}</Button>
        </form>
        <button className="mt-4 w-full text-sm text-muted-foreground hover:text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
        </button>
        <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Setelah masuk, hubungkan akun GitHub kamu di Pengaturan untuk impor & ekspor repositori.
        </p>
      </div>
    </main>
  );
}
