import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { cleanPath, fileName, type Change } from "@/lib/repo";
import { FileEditor } from "@/components/repo/file-editor";

export const Route = createFileRoute("/$username_/$repo/edit/$")({
  head: ({ params }) => ({
    meta: [
      { title: `Edit ${params._splat} · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: `Edit file ${params._splat}.` },
      { property: "og:title", content: `Edit ${params._splat}` },
      { property: "og:description", content: `Edit file di ${params.username}/${params.repo}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditPage,
});

function EditPage() {
  const { username, repo, _splat } = Route.useParams();
  const { user } = useAuth();
  const { data } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  if (!data.isOwner) return <p className="text-muted-foreground">Hanya pemilik yang bisa mengedit. Fork repositori ini untuk membuat perubahan.</p>;
  const file = data.files.find((f) => f.path === _splat);
  if (!file) return <p className="text-muted-foreground">File tidak ditemukan.</p>;

  return (
    <FileEditor
      key={file.id}
      username={username} repo={repo} initialPath={file.path} initialContent={file.content} busy={busy}
      defaultMessage={`Update ${fileName(file.path)}`}
      onCommit={async ({ path, content, message, description }) => {
        const p = cleanPath(path);
        if (!p) { toast.error("Nama file tidak valid."); return; }
        if (p !== file.path && data.files.some((f) => f.path === p)) { toast.error("File dengan nama itu sudah ada."); return; }
        const changes: Change[] = p === file.path
          ? [{ path: p, type: "modify", before: file.content, after: content }]
          : [{ path: file.path, type: "delete", before: file.content }, { path: p, type: "add", after: content }];
        if (p === file.path && content === file.content) { toast("Tidak ada perubahan."); return; }
        setBusy(true);
        try {
          await commitChanges({ repoId: data.repo.id, authorId: user!.id, message: description ? `${message}\n\n${description}` : message, changes });
          await refresh();
          toast.success("Perubahan di-commit.");
          navigate({ to: "/$username/$repo/blob/$", params: { username, repo, _splat: p } });
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}
    />
  );
}
