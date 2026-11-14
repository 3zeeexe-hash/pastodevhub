import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { GobiLoader } from "@/components/gobi-loader";
import { SideNavLayout } from "@/components/side-nav-layout";
import { navForRole } from "@/components/side-navs";
import { ROLE_INFO } from "@/lib/roles";
import { useRole } from "@/lib/use-role";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Ruang kerja — Pastodev" },
      { name: "description", content: "Kelola karya, jasa, portofolio, hosting file, toko, dan AI kamu." },
      { property: "og:title", content: "Ruang kerja — Pastodev" },
      { property: "og:description", content: "Semua tools developer Pastodev dalam satu tempat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioLayout,
});



function StudioLayout() {
  const { user, profile, loading } = useAuth();
  const { role } = useRole();
  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4"><GobiLoader page /></main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk membuka Studio developer." /></main>;
  if (profile?.account_type !== "developer") {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <Briefcase className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Ruang kerja ini untuk peran Developer, Freelancer, dan Pribadi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pindah peran lewat tombol peran di header atau di Pengaturan untuk menjual karya, membuka jasa, dan memakai tools.</p>
        <Button asChild className="mt-4"><Link to="/settings">Buka pengaturan</Link></Button>
      </main>
    );
  }
  return (
    <SideNavLayout title={ROLE_INFO[role].workspaceLabel} nav={navForRole(role)}>
      <Outlet />
    </SideNavLayout>
  );
}
