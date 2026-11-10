import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { cleanPath, looksBinary, type Change } from "@/lib/repo";
import { FileEditor } from "@/components/repo/file-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$username_/$repo/new")({
  validateSearch: (s: Record<string, unknown>): { dir?: string | undefined; mode?: "create" | "upload" | undefined } => ({
    dir: typeof s["dir"] === "string" ? s["dir"] : undefined,
    mode: s["mode"] === "upload" ? "upload" : s["mode"] === "create" ? "create" : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `File baru · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: "Buat atau upload file ke repositori." },
      { property: "og:title", content: `File baru · ${params.username}/${params.repo}` },
      { property: "og:description", content: "Buat atau upload file ke repositori." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewFilePage,
});

function NewFilePage() {
  const { username, repo } = Route.useParams();
  const { dir = "", mode = "create" } = Route.useSearch();
  const { user } = useAuth();
  const { data } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<{ path: string; content: string }[]>([]);
  const [message, setMessage] = useState("");
  const [drag, setDrag] = useState(false);
  if (!data) return null;
  if (!data.isOwner) return <p className="text-muted-foreground">Hanya pemilik yang bisa menambah file.</p>;
  const prefix = dir ? `${dir}/` : "";

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: { path: string; content: string }[] = [];
    let skipped = 0;
    for (const f of Array.from(list)) {
      if (f.size > 1_000_000) { skipped++; continue; }
      const text = await f.text();
      if (looksBinary(text)) { skipped++; continue; }
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const p = cleanPath(prefix + rel);
      if (p) next.push({ path: p, content: text });
    }
    if (skipped) toast(`${skipped} file biner/terlalu besar dilewati.`);
    setUploads((u) => [...u.filter((x) => !next.some((n) => n.path === x.path)), ...next]);
  }
  async function commitUploads() {
    if (!uploads.length) return;
    setBusy(true);
    const existing = new Map(data!.files.map((f) => [f.path, f.content]));
    const changes: Change[] = uploads.map((u) => existing.has(u.path)
      ? { path: u.path, type: "modify", before: existing.get(u.path), after: u.content }
      : { path: u.path, type: "add", after: u.content });
    try {
      await commitChanges({ repoId: data!.repo.id, authorId: user!.id, message: message.trim() || `Upload ${uploads.length} file`, changes });
      await refresh();
      toast.success(`${uploads.length} file di-commit.`);
      navigate(dir ? { to: "/$username/$repo/tree/$", params: { username, repo, _splat: dir } } : { to: "/$username/$repo", params: { username, repo } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm">
        {(["create", "upload"] as const).map((m) => (
          <Link key={m} to="/$username/$repo/new" params={{ username, repo }} search={{ dir, mode: m }} className={cn("rounded-full border border-border px-3 py-1", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {m === "create" ? "Buat file" : "Upload file"}
          </Link>
        ))}
      </div>
      {mode === "create" ? (
        <FileEditor
          username={username} repo={repo} initialPath={prefix} initialContent="" busy={busy} defaultMessage="Buat file baru"
          onCommit={async ({ path, content, message, description }) => {
            const p = cleanPath(path);
            if (!p) { toast.error("Nama file tidak valid."); return; }
            if (data.files.some((f) => f.path === p)) { toast.error("File dengan nama itu sudah ada."); return; }
            setBusy(true);
            try {
              await commitChanges({ repoId: data.repo.id, authorId: user!.id, message: description ? `${message}\n\n${description}` : message === "Buat file baru" ? `Buat ${p}` : message, changes: [{ path: p, type: "add", after: content }] });
              await refresh();
              navigate({ to: "/$username/$repo/blob/$", params: { username, repo, _splat: p } });
            } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
          }}
        />
      ) : (
        <div className="space-y-4">
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 text-center", drag && "border-primary bg-primary/5")}
          >
            <Upload className="size-10 text-muted-foreground" />
            <p className="mt-3 font-semibold">Tarik file ke sini atau klik untuk memilih</p>
            <p className="text-sm text-muted-foreground">File teks/kode hingga 1 MB. Tujuan: <span className="font-mono">{repo}/{prefix}</span></p>
            <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-link hover:underline">
            Atau upload satu folder
            <input type="file" multiple className="hidden" {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => addFiles(e.target.files)} />
          </label>
          {uploads.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {uploads.map((u) => (
                <li key={u.path} className="flex items-center gap-2 px-3 py-2 font-mono text-sm">
                  <span className="truncate">{u.path}</span>
                  {data.files.some((f) => f.path === u.path) && <span className="rounded bg-primary/15 px-1.5 font-sans text-xs text-primary">ganti</span>}
                  <button className="ml-auto text-muted-foreground hover:text-destructive" aria-label={`Hapus ${u.path}`} onClick={() => setUploads(uploads.filter((x) => x.path !== u.path))}><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-semibold">Commit perubahan</p>
            <Input className="mt-3" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Upload ${uploads.length} file`} maxLength={200} />
            <Button className="mt-3" disabled={busy || uploads.length === 0} onClick={commitUploads}>{busy ? "Menyimpan…" : "Commit perubahan"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
