import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Timeline } from "@/components/feed/timeline";

export const Route = createFileRoute("/discuss/tag/$tag")({
  head: ({ params }) => ({ meta: [{ title: `#${params.tag} — Diskusi — Pastodev` }, { name: "description", content: `Post dengan tagar #${params.tag} di Diskusi Pastodev.` }, { property: "og:title", content: `#${params.tag} — Pastodev` }, { property: "og:description", content: `Post dengan tagar #${params.tag} di Diskusi Pastodev.` }] }),
  component: TagPage,
});

function TagPage() {
  const { tag } = Route.useParams();
  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/discuss" aria-label="Kembali ke Diskusi" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-bold">#{tag}</h1>
      </div>
      <Timeline query={{ tab: "tag", tag }} empty={`Belum ada post dengan #${tag}.`} />
    </main>
  );
}
