import { Link } from "@tanstack/react-router";
import { GitCommitHorizontal } from "lucide-react";
import type { AutopostInfo } from "@/lib/feed-extras";

/** Penanda di bawah post yang dibuat otomatis dari commit sebuah repo. */
export function AutopostCard({ info }: { info: AutopostInfo }) {
  const [username, repo] = info.repoPath.split("/");
  if (!username || !repo) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
      <GitCommitHorizontal className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="text-muted-foreground">Otomatis dari repo</span>
      <Link to="/$username/$repo" params={{ username, repo }} className="truncate font-mono text-link hover:underline">
        {info.repoPath}
      </Link>
      {info.commitId && (
        <Link to="/$username/$repo/commit/$id" params={{ username, repo, id: info.commitId }} className="text-xs text-muted-foreground hover:text-primary">
          Lihat commit
        </Link>
      )}
    </div>
  );
}
