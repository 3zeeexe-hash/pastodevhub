import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Bot, Briefcase, Search, FileCode2, FolderKanban, Images, LayoutDashboard, Package, Receipt, Settings, Share2, Store, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignInCta } from "@/components/sign-in-cta";
import { SideNavLayout, type NavGroup } from "@/components/side-nav-layout";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "Studio developer — Pastodev" },
      { name: "description", content: "Kelola karya, jasa, portofolio, hosting file, toko, dan AI kamu." },
      { property: "og:title", content: "Studio developer — Pastodev" },
      { property: "og:description", content: "Semua tools developer Pastodev dalam satu tempat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudioLayout,
});

const NAV: NavGroup[] = [
  { group: "Jualan", items: [
    { to: "/studio", label: "Ringkasan & saldo", Icon: LayoutDashboard, exact: true },
    { to: "/studio/karya", label: "Karya", Icon: Package },
    { to: "/studio/jasa", label: "Jasa", Icon: Wrench },
    { to: "/studio/portofolio", label: "Portofolio", Icon: FolderKanban },
    { to: "/pesanan", label: "Pesanan", Icon: Receipt },
  ] },
  { group: "Freelance", items: [
    { to: "/lowongan", label: "Cari lowongan", Icon: Search },
    { to: "/studio/lamaran", label: "Lamaran saya", Icon: Briefcase },
  ] },
  { group: "Tools", items: [
    { to: "/studio/hosting", label: "Hosting HTML", Icon: FileCode2 },
    { to: "/studio/files", label: "Berbagi file", Icon: Share2 },
    { to: "/studio/images", label: "Cloud gambar", Icon: Images },
    { to: "/studio/toko", label: "Toko saya", Icon: Store },
    { to: "/studio/ai", label: "AI untuk repo", Icon: Bot },
  ] },
  { group: "Akun", items: [
    { to: "/settings", label: "Pengaturan", Icon: Settings },
  ] },
];

function StudioLayout() {
  const { user, profile, loading } = useAuth();
  if (loading || (user && !profile)) return <main className="mx-auto max-w-6xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk membuka Studio developer." /></main>;
  if (profile?.account_type !== "developer") {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 text-center">
        <Briefcase className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-xl font-bold">Studio khusus akun developer</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ganti jenis akun ke Developer di Pengaturan untuk menjual karya, membuka jasa, dan memakai tools.</p>
        <Button asChild className="mt-4"><Link to="/settings">Buka pengaturan</Link></Button>
      </main>
    );
  }
  return (
    <SideNavLayout title="Studio developer" nav={NAV}>
      <Outlet />
    </SideNavLayout>
  );
}
