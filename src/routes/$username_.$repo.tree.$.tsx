import { createFileRoute } from "@tanstack/react-router";
import { useRepo } from "@/lib/repo-data";
import { CodeBrowser } from "@/components/repo/code-browser";

export const Route = createFileRoute("/$username_/$repo/tree/$")({
  head: ({ params }) => ({
    meta: [
      { title: `${params._splat} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Folder ${params._splat} di repositori ${params.username}/${params.repo}.` },
      { property: "og:title", content: `${params.username}/${params.repo}/${params._splat}` },
      { property: "og:description", content: `Folder ${params._splat} di Pastodev.` },
    ],
  }),
  component: TreePage,
});

function TreePage() {
  const { username, repo, _splat } = Route.useParams();
  const { data } = useRepo(username, repo);
  if (!data) return null;
  return <CodeBrowser data={data} dir={(_splat ?? "").replace(/\/+$/, "")} />;
}
