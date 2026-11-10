import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

export function PathCrumbs({ username, repo, path, lastIsFile = false }: { username: string; repo: string; path: string; lastIsFile?: boolean }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-sm">
      <Link to="/$username/$repo" params={{ username, repo }} className="font-semibold text-link hover:underline">{repo}</Link>
      {parts.map((p, i) => {
        const sub = parts.slice(0, i + 1).join("/");
        const last = i === parts.length - 1;
        return (
          <Fragment key={sub}>
            <span className="text-muted-foreground">/</span>
            {last ? <span className="font-semibold">{p}</span> : (
              <Link to="/$username/$repo/tree/$" params={{ username, repo, _splat: sub }} className="text-link hover:underline">{p}</Link>
            )}
          </Fragment>
        );
      })}
      {!lastIsFile && parts.length > 0 && <span className="text-muted-foreground">/</span>}
    </nav>
  );
}
