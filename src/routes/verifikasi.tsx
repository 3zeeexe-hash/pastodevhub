import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SignInCta } from "@/components/sign-in-cta";
import { AccountSideNav } from "@/components/side-navs";
import { VerificationPage } from "@/components/verification-page";

export const Route = createFileRoute("/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi akun — Pastodev" },
      { name: "description", content: "Ajukan centang biru untuk akun Developer, Freelancer, Client, atau Pribadi." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerificationRoute,
});

/** Untuk semua jenis akun, terutama Client yang tidak punya Studio. Ruang kerja mengikuti peran aktif. */
function VerificationRoute() {
  const { user, profile, loading } = useAuth();
  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk mengajukan centang biru." /></main>;
  return <AccountSideNav><VerificationPage /></AccountSideNav>;
}
