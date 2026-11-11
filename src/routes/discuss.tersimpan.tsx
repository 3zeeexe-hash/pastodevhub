import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SignInCta } from "@/components/sign-in-cta";
import { Timeline } from "@/components/feed/timeline";

export const Route = createFileRoute("/discuss/tersimpan")({
  head: () => ({ meta: [{ title: "Tersimpan — Diskusi — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: SavedPage,
});

function SavedPage() {
  const { user, loading } = useAuth();
  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/discuss" aria-label="Kembali ke Diskusi" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-bold">Tersimpan</h1>
      </div>
      {loading ? null : user ? (
        <Timeline query={{ tab: "bookmarks" }} empty="Belum ada post tersimpan. Tekan ikon bookmark di sebuah post untuk menyimpannya." />
      ) : (
        <div className="p-6"><SignInCta text="Masuk untuk melihat post yang kamu simpan." /></div>
      )}
    </main>
  );
}
