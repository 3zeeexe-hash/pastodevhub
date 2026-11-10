import { createFileRoute } from "@tanstack/react-router";
import { useRepo } from "@/lib/repo-data";
import { CodeBrowser } from "@/components/repo/code-browser";

export const Route = createFileRoute("/$username_/$repo/")({
  component: RepoHome,
});

function RepoHome() {
  const { username, repo } = Route.useParams();
  const { data } = useRepo(username, repo);
  if (!data) return null;
  return <CodeBrowser data={data} dir="" />;
}
