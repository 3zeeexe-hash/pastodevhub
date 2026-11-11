import { Link } from "@tanstack/react-router";
import { Folder, FileText, Plus, Upload, History, GitBranch, BookOpen, Star, GitFork, Link2 } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { findReadme, languageStats, listDir, shortId } from "@/lib/repo";
import type { RepoData } from "@/lib/repo-data";
import { Button } from "@/components/ui/button";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";
import { CodeMenu } from "@/components/repo/code-menu";
import { PathCrumbs } from "@/components/repo/path-crumbs";
import { EmptyRepoGitHelp } from "@/components/repo/git-clone";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function CodeBrowser({ data, dir }: { data: RepoData; dir: string }) {
  const { owner, repo, files } = data;
  const username = owner.username;
  const entries = listDir(files, dir);
  const readme = findReadme(files, dir);
  const stats = languageStats(files);
  const isRoot = dir === "";
  const dirExists = isRoot || files.some((f) => f.path.startsWith(`${dir}/`));

  // Like GitHub: a brand-new empty repo opens on "Quick setup" with the git commands.
  if (isRoot && files.length === 0 && data.isOwner) {
    return <EmptyRepoGitHelp username={username} repo={repo.name} branch={repo.default_branch} />;
  }

  return (
    <div className={isRoot ? "grid gap-6 lg:grid-cols-[1fr_300px]" : ""}>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs"><GitBranch className="size-3.5" />{repo.default_branch}</span>
          {!isRoot && <PathCrumbs username={username} repo={repo.name} path={dir} />}
          <div className="ml-auto flex gap-2">
            {data.isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Plus /> Tambah file</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link to="/$username/$repo/new" params={{ username, repo: repo.name }} search={{ dir, mode: "create" }}><Plus /> Buat file baru</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/$username/$repo/new" params={{ username, repo: repo.name }} search={{ dir, mode: "upload" }}><Upload /> Upload file</Link></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <CodeMenu data={data} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-sm">
            {data.lastCommit ? (
              <>
                <AvatarMini name={data.lastCommit.author?.username ?? "?"} url={data.lastCommit.author?.avatar_url} size={20} />
                <b className="shrink-0">{data.lastCommit.author?.username}</b>
                <Link to="/$username/$repo/commit/$id" params={{ username, repo: repo.name, id: data.lastCommit.id }} className="truncate text-muted-foreground hover:text-link">{data.lastCommit.message}</Link>
                <span className="ml-auto hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">{shortId(data.lastCommit.id)} · {timeAgo(data.lastCommit.created_at)}</span>
              </>
            ) : <span className="text-muted-foreground">Belum ada commit</span>}
            <Link to="/$username/$repo/commits" params={{ username, repo: repo.name }} className="flex shrink-0 items-center gap-1 text-xs hover:text-link sm:ml-3"><History className="size-4" /> {data.commitCount}</Link>
          </div>
          {!dirExists ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Folder tidak ditemukan.</p>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-semibold">Repositori ini masih kosong</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {!isRoot && (
                  <tr className="hover:bg-accent/50"><td className="px-4 py-2" colSpan={2}>
                    {dir.includes("/") ? (
                      <Link to="/$username/$repo/tree/$" params={{ username, repo: repo.name, _splat: dir.split("/").slice(0, -1).join("/") }} className="font-mono text-muted-foreground hover:text-link">..</Link>
                    ) : (
                      <Link to="/$username/$repo" params={{ username, repo: repo.name }} className="font-mono text-muted-foreground hover:text-link">..</Link>
                    )}
                  </td></tr>
                )}
                {entries.map((e) => (
                  <tr key={e.path} className="hover:bg-accent/50">
                    <td className="px-4 py-2">
                      {e.kind === "dir" ? (
                        <Link to="/$username/$repo/tree/$" params={{ username, repo: repo.name, _splat: e.path }} className="flex items-center gap-2 hover:text-link hover:underline">
                          <Folder className="size-4 shrink-0 fill-primary/30 text-primary" />{e.name}
                        </Link>
                      ) : (
                        <Link to="/$username/$repo/blob/$" params={{ username, repo: repo.name, _splat: e.path }} className="flex items-center gap-2 hover:text-link hover:underline">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />{e.name}
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted-foreground">
                      {e.kind === "file" ? timeAgo(e.file.updated_at) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {readme && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-sm font-semibold"><BookOpen className="size-4" /> {readme.name}</div>
            <div className="p-6">{/\.md|\.markdown$/i.test(readme.name) || !readme.name.includes(".") ? <Markdown>{readme.file.content}</Markdown> : <pre className="whitespace-pre-wrap font-mono text-sm">{readme.file.content}</pre>}</div>
          </div>
        )}
      </div>

      {isRoot && (
        <aside className="space-y-6 text-sm">
          <div>
            <h2 className="font-semibold">Tentang</h2>
            <p className="mt-2 text-muted-foreground">{repo.description || "Tidak ada deskripsi."}</p>
            {repo.homepage && <a href={repo.homepage} target="_blank" rel="noreferrer noopener" className="mt-2 flex items-center gap-1 truncate font-semibold text-link hover:underline"><Link2 className="size-4" />{repo.homepage.replace(/^https?:\/\//, "")}</a>}
            {repo.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{repo.topics.map((t) => <span key={t} className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">{t}</span>)}</div>}
            <ul className="mt-3 space-y-1.5 text-muted-foreground">
              {readme && <li className="flex items-center gap-2"><BookOpen className="size-4" />Readme</li>}
              <li className="flex items-center gap-2"><Star className="size-4" /><b className="text-foreground">{data.stars}</b> bintang</li>
              <li className="flex items-center gap-2"><GitFork className="size-4" /><b className="text-foreground">{data.forks}</b> fork</li>
            </ul>
          </div>
          {stats.length > 0 && (
            <div className="border-t border-border pt-5">
              <h2 className="font-semibold">Bahasa</h2>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                {stats.map((s) => <span key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />)}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {stats.slice(0, 8).map((s) => <li key={s.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /><b>{s.name}</b><span className="text-muted-foreground">{s.pct.toFixed(1)}%</span></li>)}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
