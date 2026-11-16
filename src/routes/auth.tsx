import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Briefcase, Eye, EyeOff, Github, GitBranch, Loader2, Lock, Mail, MessagesSquare, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand";
import { RolePicker } from "@/components/role-ui";
import { accountTypeFor, isRole, readStoredRole, writeStoredRole, type Role } from "@/lib/roles";
import { PENDING_TYPE_KEY } from "@/components/account-type-prompt";
import { firebaseSignIn, getFirebasePublicConfig } from "@/lib/firebase-auth.functions";
import { firebaseGoogleIdToken, preloadFirebase } from "@/lib/firebase-client";
import { githubSignIn } from "@/lib/github-auth.functions";
import { errorText, githubLoginCode } from "@/lib/github-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — GoBi" },
      { name: "description", content: "Masuk atau daftar ke GoBi: tempat developer, freelancer, dan client bekerja bersama." },
      { property: "og:title", content: "Masuk — GoBi" },
      { property: "og:description", content: "Masuk atau daftar ke GoBi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const PERKS = [
  { icon: GitBranch, title: "Repositori kode", text: "Simpan, bagikan, dan kerjakan kode bersama seperti di GitHub." },
  { icon: Briefcase, title: "Freelance, karya, dan jasa", text: "Cari proyek, jual karya digital, dan tawarkan jasamu." },
  { icon: MessagesSquare, title: "GobiFeed", text: "Ngobrol dan berbagi dengan komunitas developer Indonesia." },
];

const SUBTITLE = {
  in: "Selamat datang kembali. Masuk untuk melanjutkan.",
  up: "Gabung komunitas developer, freelancer, dan client.",
  forgot: "Masukkan emailmu, kami kirim link untuk mengatur ulang kata sandi.",
} as const;

/** Kolom isian dengan ikon di kiri. */
function Field({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const accountType = role ? accountTypeFor(role) : null;
  const { user } = useAuth();
  const navigate = useNavigate();
  const loadFirebase = useServerFn(getFirebasePublicConfig);
  const exchange = useServerFn(firebaseSignIn);
  const exchangeGithub = useServerFn(githubSignIn);
  const { data: firebase } = useQuery({ queryKey: ["firebase-public"], queryFn: () => loadFirebase(), staleTime: 60_000 });
  // Di subdomain feed (feed.goobi.my.id) setelah masuk kembali ke linimasa, bukan ke beranda situs utama.
  useEffect(() => { if (user) navigate({ to: window.location.hostname.split(".")[0] === "feed" ? "/gobifeed" : "/" }); }, [user, navigate]);
  // Peran yang dipilih di beranda langsung terpilih di sini.
  useEffect(() => { const saved = readStoredRole(); if (isRole(saved)) setRole(saved); }, []);
  // Load Firebase before the tap so the Google popup opens right away (browsers block slow popups).
  useEffect(() => { if (firebase?.enabled && firebase.config) preloadFirebase(firebase.config); }, [firebase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      if (!role || !accountType) { toast.error("Pilih dulu kamu daftar sebagai apa."); setBusy(false); return; }
      writeStoredRole(role);
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
  async function googleLogin() {
    if (mode === "up" && role && accountType) { writeStoredRole(role); window.localStorage.setItem(PENDING_TYPE_KEY, accountType); }
    else window.localStorage.removeItem(PENDING_TYPE_KEY);
    let fb = firebase;
    if (!fb) {
      try { fb = await loadFirebase(); } catch { fb = undefined; }
    }
    if (fb?.enabled && fb.config) {
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
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) {
      console.error("Google sign-in failed", r.error);
      toast.error("Gagal masuk dengan Google. Login Google bawaan hanya jalan di domain Lovable; di hosting sendiri admin perlu mengaktifkan Firebase di /admin (atau mengisi FIREBASE_WEB_CONFIG di server).");
    }
  }

  // Must start straight from the tap (no await before the popup opens), or browsers block the popup.
  async function githubLogin() {
    if (mode === "up" && role && accountType) writeStoredRole(role);
    const pending = githubLoginCode();
    setBusy(true);
    try {
      const code = await pending;
      if (!code) throw new Error("GitHub tidak mengembalikan kode. Coba masuk lagi.");
      const session = await exchangeGithub({ data: { code, accountType: mode === "up" && accountType ? accountType : undefined } });
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
    } catch (e) {
      toast.error(errorText(e) || "Gagal masuk dengan GitHub.");
    } finally { setBusy(false); }
  }

  return (
    <main className="bg-hero flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8 sm:py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-glow lg:grid-cols-[1fr_26rem]">
        {/* Panel merek (layar lebar): biru tua dengan aksen oranye, sama seperti header dan beranda. */}
        <aside className="bg-header-gradient relative hidden flex-col justify-between overflow-hidden p-8 text-header-foreground lg:flex">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/25 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-navy-soft/40 blur-3xl" />
          <div className="relative">
            <BrandMark size={56} />
            <h2 className="mt-6 text-3xl font-bold leading-tight">
              Tempat developer, freelancer, dan client <span className="text-primary-glow">bekerja bersama.</span>
            </h2>
            <ul className="mt-8 space-y-5">
              {PERKS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-primary-glow ring-1 ring-white/15"><Icon aria-hidden className="size-4" /></span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-sm text-header-foreground/70">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-10">
            <div className="batik-line" />
            <p className="mt-3 text-xs text-header-foreground/60">GoBi — komunitas developer Indonesia</p>
          </div>
        </aside>

        <section className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="lg:hidden"><BrandMark size={56} /></div>
            <h1 className="mt-3 text-2xl font-bold lg:mt-0">{mode === "in" ? "Masuk ke GoBi" : mode === "up" ? "Buat akun GoBi" : "Lupa kata sandi"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{SUBTITLE[mode]}</p>
          </div>

          {mode === "forgot" ? (
            <button type="button" onClick={() => setMode("in")} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
              <ArrowLeft aria-hidden className="size-4" /> Kembali ke halaman masuk
            </button>
          ) : (
            <div role="tablist" aria-label="Masuk atau daftar" className="mt-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-semibold">
              {(["in", "up"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("rounded-md py-2 transition", mode === m ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "in" ? "Masuk" : "Daftar"}
                </button>
              ))}
            </div>
          )}

          {mode === "up" && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium">Daftar sebagai</p>
              <RolePicker value={role} onChange={setRole} />
            </div>
          )}

          {mode !== "forgot" && (
            <>
              <div className="mt-5 space-y-2">
                <Button type="button" variant="google" className="h-11 w-full" disabled={busy} onClick={() => void googleLogin()}>
                  <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
                  Continue with Google
                </Button>
                <Button type="button" variant="outline" className="h-11 w-full" disabled={busy} onClick={() => void githubLogin()}>
                  <Github aria-hidden="true" /> Continue with GitHub
                </Button>
              </div>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />atau dengan email<span className="h-px flex-1 bg-border" /></div>
            </>
          )}

          <form onSubmit={submit} className={cn("space-y-3", mode === "forgot" && "mt-5")}>
            {mode === "up" && (
              <div>
                <Label htmlFor="u">Username</Label>
                <Field icon={User}><Input id="u" className="pl-9" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9_\-]{3,30}" title="3–30 huruf, angka, - atau _" /></Field>
              </div>
            )}
            <div>
              <Label htmlFor="e">Email</Label>
              <Field icon={Mail}><Input id="e" type="email" className="pl-9" autoComplete="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="p">Kata sandi</Label>
                  {mode === "in" && <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-link hover:underline">Lupa kata sandi?</button>}
                </div>
                <Field icon={Lock}>
                  <Input id="p" type={showPassword ? "text" : "password"} className="px-9" autoComplete={mode === "up" ? "new-password" : "current-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                  </button>
                </Field>
              </div>
            )}
            <Button className="h-11 w-full text-base" disabled={busy}>
              {busy && <Loader2 aria-hidden className="animate-spin" />}
              {mode === "in" ? "Masuk" : mode === "up" ? "Daftar" : "Kirim link reset"}
            </Button>
          </form>

          <p className="mt-5 flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            <span>Masuk dengan Google atau GitHub langsung masuk tanpa verifikasi email. Untuk impor dan ekspor repositori, hubungkan akun GitHub kamu di Pengaturan.</span>
          </p>
        </section>
      </div>
    </main>
  );
}
