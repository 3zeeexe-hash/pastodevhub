import { createFileRoute } from "@tanstack/react-router";
import { useRepo } from "@/lib/repo-data";
import { CodeBrowser } from "@/components/repo/code-browser";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/$username_/$repo/")({
  // Real title, description and structured data come from the database; the text below is the fallback.
  loader: ({ params }) => getSeoInfo({ data: { kind: "repo", id: params.username, extra: params.repo } }),
  staleTime: 300_000,
  head: ({ loaderData, params }) => seoHead(loaderData, { title: `${params.username}/${params.repo} — Pastodev`, description: `Repositori ${params.repo} oleh ${params.username} di Pastodev: kode, issue, dan pull request.` }),
  component: RepoHome,
});

function RepoHome() {
  const { username, repo } = Route.useParams();
  const { data } = useRepo(username, repo);
  if (!data) return null;
  return <CodeBrowser data={data} dir="" />;
}
