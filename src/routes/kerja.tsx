import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SideNavLayout, type NavGroup } from "@/components/side-nav-layout";
import { SignInCta } from "@/components/sign-in-cta";
import { GobiLoader } from "@/components/gobi-loader";
import { WORK_NAV } from "@/components/nav-data";

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

// Menu GOBI WORK sekarang didefinisikan di nav-data.ts dan ikut di menu utama (laci GOBI); ekspor ini dipertahankan untuk kode lama.
export const KERJA_NAV: NavGroup[] = [WORK_NAV];

function KerjaLayout() {
  const { user, loading } = useAuth();
  if (loading) return <main className="mx-auto max-w-5xl px-4"><GobiLoader page /></main>;
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
