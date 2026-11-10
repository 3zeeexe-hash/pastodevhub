import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Star, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { commitChanges } from "@/lib/repo-data";
import { REPO_NAME_RE, languageColor } from "@/lib/repo";
import { listGithubRepos } from "@/lib/github.functions";
import { downloadGithubRepo, githubErrorMessage } from "@/lib/github-client";
import { GithubConnectCard, useGithubStatus } from "@/components/github-connect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SignInCta } from "@/components/sign-in-cta";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Impor dari GitHub — Pastodev" },
      { name: "description", content: "Impor repositori GitHub kamu ke Pastodev lengkap dengan semua file kodenya." },
      { property: "og:title", content: "Impor dari GitHub — Pastodev" },
      { property: "og:description", content: "Pindahkan repositori GitHub ke Pastodev dalam sekali klik." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const { user, profile } = useAuth();
  const status = useGithubStatus();
  const list = useServerFn(listGithubRepos);
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [job, setJob] = useState<{ name: string; done: number; total: number; phase: string } | null>(null);
  const repos = useQuery({
    queryKey: ["github-repos", user?.id, page],
    enabled: !!status.data?.connected,
    queryFn: () => list({ data: { page } }),
  });

  if (!user || !profile) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk dulu untuk mengimpor repositori dari GitHub." /></main>;

  async function doImport(fullName: string, isPrivateHint?: boolean) {
    if (job) return;
    const repoName = fullName.split("/")[1] ?? fullName;
    setJob({ name: fullName, done: 0, total: 0, phase: "Membaca isi repo dari GitHub…" });
    try {
      const { info, files, skipped } = await downloadGithubRepo(fullName, (done, total) => setJob({ name: fullName, done, total, phase: "Mengunduh file…" }));
      let name = REPO_NAME_RE.test(repoName) ? repoName : repoName.replace(/[^A-Za-z0-9._-]/g, "-");
      const { data: existing } = await supabase.from("repositories").select("id").eq("owner_id", user!.id).eq("name", name).maybeSingle();
      if (existing) name = `${name}-github`;
      const { data: repo, error } = await supabase.from("repositories").insert({
        owner_id: user!.id, name, description: info.description, language: info.language, is_private: isPrivateHint ?? info.private,
        default_branch: info.defaultBranch, topics: info.topics.slice(0, 20), homepage: info.homepage ?? "", github_full_name: fullName,
      }).select().single();
      if (error) throw new Error(error.code === "23505" ? "Nama repositori sudah dipakai." : error.message);
      if (files.length) {
        setJob({ name: fullName, done: 0, total: files.length, phase: "Menyimpan ke Pastodev…" });
        await commitChanges({
          repoId: repo.id, authorId: user!.id, message: `Impor dari GitHub ${fullName}`,
          changes: files.map((f) => ({ path: f.path, type: "add" as const, after: f.content })), storeContent: false,
          onProgress: (done, total) => setJob({ name: fullName, done, total, phase: "Menyimpan ke Pastodev…" }),
        });
      }
      toast.success(`${files.length} file diimpor${skipped ? `, ${skipped} file biner/besar dilewati` : ""}.`);
      navigate({ to: "/$username/$repo", params: { username: profile!.username, repo: name } });
    } catch (e) {
      toast.error(githubErrorMessage(e));
    } finally {
      setJob(null);
    }
  }

  const shown = (repos.data ?? []).filter((r) => r.fullName.toLowerCase().includes(filter.toLowerCase()));
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Impor repositori dari GitHub</h1>
      <p className="mt-1 text-sm text-muted-foreground">Semua file teks (kode, README, konfigurasi) disalin ke repositori baru di Pastodev. File biner seperti gambar dilewati.</p>
      <div className="mt-6"><GithubConnectCard /></div>

      {job && (
        <div className="mt-6 rounded-lg border border-primary/50 bg-card p-4">
          <p className="text-sm font-semibold">{job.name}</p>
          <p className="text-xs text-muted-foreground">{job.phase} {job.total ? `${job.done}/${job.total}` : ""}</p>
          <Progress value={job.total ? (job.done / job.total) * 100 : 5} className="mt-2" />
        </div>
      )}

      {status.data?.connected && (
        <>
          <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = manual.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, ""); if (/^[\w.-]+\/[\w.-]+$/.test(v)) doImport(v); else toast.error("Format: pemilik/nama-repo"); }}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://github.com/pemilik/repo atau pemilik/repo" className="font-mono text-sm" />
            <Button disabled={!!job}>Impor</Button>
          </form>
          <div className="mt-6 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <Search className="size-4 text-muted-foreground" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Saring repo kamu…" className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            {repos.isLoading && <p className="p-4 text-sm text-muted-foreground">Memuat repositori GitHub…</p>}
            {repos.error && <p className="p-4 text-sm text-destructive">{githubErrorMessage(repos.error)}</p>}
            <ul className="divide-y divide-border">
              {shown.map((r) => (
                <li key={r.fullName} className="flex items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-mono text-sm"><span className="font-semibold text-link">{r.fullName}</span>{r.private && <Lock className="size-3 text-muted-foreground" />}</p>
                    {r.description && <p className="truncate text-xs text-muted-foreground">{r.description}</p>}
                    <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      {r.language && <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: languageColor(r.language) }} />{r.language}</span>}
                      <span className="flex items-center gap-1"><Star className="size-3" />{r.stars}</span><span>{timeAgo(r.updatedAt)}</span>
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" disabled={!!job} onClick={() => doImport(r.fullName, r.private)}><Download /> Impor</Button>
                </li>
              ))}
              {repos.data && shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Tidak ada repositori.</li>}
            </ul>
            <div className="flex justify-between border-t border-border px-3 py-2">
              <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
              <Button size="sm" variant="ghost" disabled={(repos.data?.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Berikutnya</Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
