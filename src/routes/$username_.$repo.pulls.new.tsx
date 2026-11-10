import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, GitFork } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchAllFiles, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { computeChanges, diffStats } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignInCta } from "@/components/sign-in-cta";
import { DiffView } from "@/components/diff-view";
import { MdEditor } from "@/components/repo/md-editor";

export const Route = createFileRoute("/$username_/$repo/pulls/new")({
  validateSearch: (s: Record<string, unknown>): { head?: string | undefined } => (typeof s["head"] === "string" ? { head: s["head"] } : {}),
  head: ({ params }) => ({
    meta: [
      { title: `Pull request baru · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: "Ajukan perubahan dari fork kamu." },
      { property: "og:title", content: `Pull request baru · ${params.username}/${params.repo}` },
      { property: "og:description", content: "Ajukan perubahan dari fork kamu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewPull,
});

function NewPull() {
  const { username, repo } = Route.useParams();
  const { head } = Route.useSearch();
  const { user, profile } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const [headId, setHeadId] = useState(head ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const forks = useQuery({
    queryKey: ["my-forks", rd?.repo.id, user?.id],
    enabled: !!rd && !!user,
    queryFn: async () => (await supabase.from("repositories").select("id,name").eq("forked_from", rd!.repo.id).eq("owner_id", user!.id)).data ?? [],
  });
  useEffect(() => { if (!headId && forks.data?.[0]) setHeadId(forks.data[0].id); }, [forks.data, headId]);
  const diff = useQuery({
    queryKey: ["compare", rd?.repo.id, headId],
    enabled: !!rd && !!headId,
    queryFn: async () => computeChanges(rd!.files, await fetchAllFiles(headId)),
  });
  if (!rd) return null;
  if (!user || !profile) return <SignInCta text="Masuk untuk membuat pull request." />;
  const changes = diff.data ?? [];
  const stats = diffStats(changes);

  async function create() {
    setBusy(true);
    const { data, error } = await supabase.from("pull_requests").insert({ repo_id: rd!.repo.id, head_repo_id: headId, author_id: user!.id, title: title.trim(), body }).select("number").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    refresh();
    navigate({ to: "/$username/$repo/pulls/$number", params: { username, repo, number: String(data.number) } });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Bandingkan perubahan</h2>
        <p className="text-sm text-muted-foreground">Pilih fork kamu sebagai sumber perubahan untuk <b className="text-foreground">{username}/{repo}</b>.</p>
      </div>
      {forks.data?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <GitFork className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">{rd.isOwner ? "Pull request dikirim dari fork. Minta teman fork repo ini, atau buka repo induk dari fork kamu." : "Kamu belum punya fork repo ini. Klik tombol Fork di atas, ubah file di fork kamu, lalu kembali ke sini."}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 font-mono text-sm">
            <span className="rounded-md bg-secondary px-2 py-1">base: {username}/{repo}</span>
            <ArrowLeft className="size-4 text-muted-foreground" />
            <select value={headId} onChange={(e) => setHeadId(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1" aria-label="Fork sumber">
              {forks.data?.map((f) => <option key={f.id} value={f.id}>compare: {profile.username}/{f.name}</option>)}
            </select>
            {diff.data && <span className="ml-auto font-sans text-xs text-muted-foreground">{changes.length} file · <span className="text-success">+{stats.add}</span> <span className="text-destructive">−{stats.del}</span></span>}
          </div>
          {changes.length > 0 ? (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul pull request" maxLength={250} />
              <MdEditor value={body} onChange={setBody} placeholder="Jelaskan perubahan kamu…" />
              <Button disabled={busy || !title.trim()} onClick={create}>Buat pull request</Button>
            </div>
          ) : diff.data && <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">Tidak ada perbedaan antara fork dan repo ini.</p>}
          {diff.isLoading && <p className="text-sm text-muted-foreground">Membandingkan…</p>}
          <DiffView changes={changes} />
        </>
      )}
      <Link to="/$username/$repo/pulls" params={{ username, repo }} className="text-sm text-link hover:underline">← Semua pull request</Link>
    </div>
  );
}
