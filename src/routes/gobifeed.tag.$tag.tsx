import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Timeline } from "@/components/feed/timeline";

export const Route = createFileRoute("/gobifeed/tag/$tag")({
  head: ({ params }) => ({ meta: [{ title: `#${params.tag} — GobiFeed — GoBi` }, { name: "description", content: `Post dengan tagar #${params.tag} di GobiFeed.` }, { property: "og:title", content: `#${params.tag} — GoBi` }, { property: "og:description", content: `Post dengan tagar #${params.tag} di GobiFeed.` }] }),
  component: TagPage,
});

function TagPage() {
  const { tag } = Route.useParams();
  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/gobifeed" aria-label="Kembali ke GobiFeed" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-bold">#{tag}</h1>
      </div>
      <Timeline query={{ tab: "tag", tag }} empty={`Belum ada post dengan #${tag}.`} />
    </main>
  );
}
