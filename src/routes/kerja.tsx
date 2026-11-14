import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Briefcase, FileSignature, LayoutDashboard, MessageSquare, PlusCircle, Search, UserCog, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SideNavLayout, type NavGroup } from "@/components/side-nav-layout";
import { SignInCta } from "@/components/sign-in-cta";

export const Route = createFileRoute("/kerja")({
  head: () => ({
    meta: [
      { title: "GOBI WORK — Pastodev" },
      { name: "description", content: "GOBI WORK: lowongan, kontrak, milestone, dan pembayaran escrow untuk freelancer dan client." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KerjaLayout,
});

export const KERJA_NAV: NavGroup[] = [
  { group: "GOBI WORK", items: [
    { to: "/kerja", label: "Ringkasan", Icon: LayoutDashboard, exact: true },
    { to: "/lowongan", label: "Explore Jobs", Icon: Search, exact: true, feature: "jobs" },
    { to: "/lowongan/baru", label: "Buat Lowongan", Icon: PlusCircle, feature: "jobs" },
    { to: "/kerja/lamaran", label: "Lamaran Saya", Icon: Briefcase },
    { to: "/kerja/kontrak", label: "Proyek & Kontrak", Icon: FileSignature },
    { to: "/kerja/pesan", label: "Pesan Kerja", Icon: MessageSquare },
    { to: "/kerja/pembayaran", label: "Pembayaran", Icon: Wallet },
    { to: "/kerja/profil", label: "Profil Kerja", Icon: UserCog },
  ] },
];

function KerjaLayout() {
  const { user, loading } = useAuth();
  if (loading) return <main className="mx-auto max-w-5xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <SignInCta text="Masuk untuk memakai GOBI WORK." />
      </main>
    );
  }
  return (
    <SideNavLayout title="GOBI WORK" nav={KERJA_NAV}>
      <Outlet />
    </SideNavLayout>
  );
}
