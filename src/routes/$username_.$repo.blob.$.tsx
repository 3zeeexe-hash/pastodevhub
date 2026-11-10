import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Copy, Download, FileCode2, Eye, History } from "lucide-react";
import { useAuth, timeAgo } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { fileName } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { CodeView } from "@/components/code-view";
import { Markdown } from "@/components/markdown";
import { PathCrumbs } from "@/components/repo/path-crumbs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo/blob/$")({
  head: ({ params }) => ({
    meta: [
      { title: `${params._splat} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `File ${params._splat} di repositori ${params.username}/${params.repo}.` },
      { property: "og:title", content: `${params.username}/${params.repo}/${params._splat}` },
      { property: "og:description", content: `Lihat file ${params._splat} di Pastodev.` },
    ],
  }),
  component: BlobPage,
});

function BlobPage() {
  const { username, repo, _splat } = Route.useParams();
  const path = _splat ?? "";
  const { user } = useAuth();
  const { data } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const isMd = /\.(md|markdown)$/i.test(path);
  const [view, setView] = useState<"preview" | "code">(isMd ? "preview" : "code");
  if (!data) return null;
  const file = data.files.find((f) => f.path === path);
  if (!file) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">File tidak ditemukan.</p>;
  const lines = Math.max(1, file.content.split("\n").length - (file.content.endsWith("\n") ? 1 : 0));
  const size = new Blob([file.content]).size;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file!.content], { type: "text/plain" }));
    a.download = fileName(file!.path);
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function raw() {
    const url = URL.createObjectURL(new Blob([file!.content], { type: "text/plain;charset=utf-8" }));
    window.open(url, "_blank", "noopener");
  }
  async function del() {
    if (!confirm(`Hapus ${file!.path}?`)) return;
    try {
      await commitChanges({ repoId: data!.repo.id, authorId: user!.id, message: `Hapus ${file!.path}`, changes: [{ path: file!.path, type: "delete", before: file!.content }] });
      await refresh();
      toast.success("File dihapus.");
      navigate({ to: "/$username/$repo", params: { username, repo } });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <PathCrumbs username={username} repo={repo} path={path} lastIsFile />
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {isMd && (
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["preview", "code"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={cn("flex items-center gap-1 px-3 py-1", view === v ? "bg-background text-foreground" : "hover:bg-accent")}>
                  {v === "preview" ? <Eye className="size-3.5" /> : <FileCode2 className="size-3.5" />}{v === "preview" ? "Preview" : "Code"}
                </button>
              ))}
            </div>
          )}
          <span className="font-mono">{lines} baris · {size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`} · diperbarui {timeAgo(file.updated_at)}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={raw}>Raw</Button>
            <Button size="icon" variant="ghost" aria-label="Salin isi" onClick={() => { navigator.clipboard.writeText(file.content); toast.success("Disalin"); }}><Copy /></Button>
            <Button size="icon" variant="ghost" aria-label="Download file" onClick={download}><Download /></Button>
            <Button asChild size="icon" variant="ghost" aria-label="Riwayat"><Link to="/$username/$repo/commits" params={{ username, repo }}><History /></Link></Button>
            {data.isOwner && (
              <>
                <Button asChild size="icon" variant="ghost" aria-label="Edit file"><Link to="/$username/$repo/edit/$" params={{ username, repo, _splat: path }}><Pencil /></Link></Button>
                <Button size="icon" variant="ghost" aria-label="Hapus file" onClick={del}><Trash2 className="text-destructive" /></Button>
              </>
            )}
          </div>
        </div>
        {isMd && view === "preview" ? <div className="p-6"><Markdown>{file.content}</Markdown></div> : <CodeView path={file.path} content={file.content} />}
      </div>
    </div>
  );
}
