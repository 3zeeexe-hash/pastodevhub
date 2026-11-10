import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Github, Upload, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { commitChanges, useRepo, useRefreshRepo } from "@/lib/repo-data";
import { REPO_NAME_RE, computeChanges } from "@/lib/repo";
import { exportToGithub } from "@/lib/github.functions";
import { downloadGithubRepo, githubErrorMessage } from "@/lib/github-client";
import { GithubConnectCard, useGithubStatus } from "@/components/github-connect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/$username_/$repo/settings")({
  head: ({ params }) => ({
    meta: [
      { title: `Settings · ${params.username}/${params.repo} — Pastodev` },
      { name: "description", content: "Pengaturan repositori." },
      { property: "og:title", content: `Settings · ${params.username}/${params.repo}` },
      { property: "og:description", content: "Pengaturan repositori." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RepoSettings,
});

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? "rounded-lg border border-destructive/60 p-5" : "rounded-lg border border-border bg-card p-5"}>
      <h2 className={danger ? "mb-4 text-lg font-semibold text-destructive" : "mb-4 text-lg font-semibold"}>{title}</h2>
      {children}
    </section>
  );
}

function RepoSettings() {
  const { username, repo } = Route.useParams();
  const { user } = useAuth();
  const { data: rd } = useRepo(username, repo);
  const refresh = useRefreshRepo(username, repo);
  const navigate = useNavigate();
  const gh = useGithubStatus();
  const push = useServerFn(exportToGithub);
  const [f, setF] = useState({ name: "", description: "", homepage: "", topics: "" });
  const [ghName, setGhName] = useState("");
  const [ghPrivate, setGhPrivate] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [job, setJob] = useState<{ label: string; pct: number } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  useEffect(() => {
    if (rd) {
      setF({ name: rd.repo.name, description: rd.repo.description ?? "", homepage: rd.repo.homepage ?? "", topics: rd.repo.topics.join(", ") });
      setGhName(rd.repo.name);
      setGhPrivate(rd.repo.is_private);
    }
  }, [rd?.repo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rd) return null;
  if (!rd.isOwner) return <p className="text-muted-foreground">Hanya pemilik yang bisa membuka pengaturan.</p>;
  const r = rd.repo;

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!REPO_NAME_RE.test(f.name)) { toast.error("Nama tidak valid."); return; }
    const topics = f.topics.split(/[,\s]+/).map((t) => t.toLowerCase().replace(/[^a-z0-9-]/g, "")).filter(Boolean).slice(0, 20);
    const { error } = await supabase.from("repositories").update({ name: f.name, description: f.description, homepage: f.homepage, topics, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) { toast.error(error.code === "23505" ? "Nama sudah dipakai." : error.message); return; }
    toast.success("Pengaturan disimpan.");
    if (f.name !== r.name) navigate({ to: "/$username/$repo/settings", params: { username, repo: f.name } });
    else refresh();
  }
  async function toggleVisibility() {
    if (!confirm(`Ubah repositori menjadi ${r.is_private ? "Public" : "Private"}?`)) return;
    const { error } = await supabase.from("repositories").update({ is_private: !r.is_private }).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Visibilitas diubah."); refresh(); }
  }
  async function doPush() {
    setJob({ label: r.github_full_name ? `Push ke ${r.github_full_name}…` : "Membuat repo di GitHub…", pct: 40 });
    try {
      const res = await push({ data: { repoId: r.id, githubName: r.github_full_name ? undefined : ghName, isPrivate: ghPrivate, message: pushMsg.trim() || undefined } });
      toast.success(`${res.files} file ${res.created ? "diekspor ke repo baru" : "di-push ke"} ${res.fullName}.`);
      refresh();
    } catch (e) { toast.error(githubErrorMessage(e)); } finally { setJob(null); }
  }
  async function doPull() {
    if (!r.github_full_name) return;
    if (!confirm(`Tarik isi terbaru dari ${r.github_full_name}? File di Pastodev akan disamakan dengan GitHub.`)) return;
    setJob({ label: "Mengunduh dari GitHub…", pct: 5 });
    try {
      const { files } = await downloadGithubRepo(r.github_full_name, (d, t) => setJob({ label: `Mengunduh dari GitHub… ${d}/${t}`, pct: (d / Math.max(t, 1)) * 70 }));
      const changes = computeChanges(rd!.files, files);
      if (!changes.length) { toast("Sudah sama dengan GitHub."); return; }
      await commitChanges({
        repoId: r.id, authorId: user!.id, message: `Tarik perubahan dari GitHub ${r.github_full_name}`, changes,
        onProgress: (d, t) => setJob({ label: `Menyimpan… ${d}/${t}`, pct: 70 + (d / Math.max(t, 1)) * 30 }),
      });
      toast.success(`${changes.length} file diperbarui dari GitHub.`);
      refresh();
    } catch (e) { toast.error(githubErrorMessage(e)); } finally { setJob(null); }
  }
  async function unlink() {
    const { error } = await supabase.from("repositories").update({ github_full_name: null }).eq("id", r.id);
    if (error) toast.error(error.message); else refresh();
  }
  async function del() {
    const { error } = await supabase.from("repositories").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Repositori dihapus.");
    navigate({ to: "/$username", params: { username } });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Section title="Umum">
        <form onSubmit={saveGeneral} className="space-y-4">
          <div><Label htmlFor="rn">Nama repositori</Label><Input id="rn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-") })} maxLength={100} /></div>
          <div><Label htmlFor="rd">Deskripsi</Label><Textarea id="rd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={350} /></div>
          <div><Label htmlFor="rh">Website</Label><Input id="rh" type="url" value={f.homepage} onChange={(e) => setF({ ...f, homepage: e.target.value })} placeholder="https://" /></div>
          <div><Label htmlFor="rt">Topik (pisahkan dengan koma)</Label><Input id="rt" value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} placeholder="react, indonesia, api" /></div>
          <Button>Simpan</Button>
        </form>
      </Section>

      <Section title="GitHub">
        <div className="space-y-4">
          <GithubConnectCard compact />
          {job && <div><p className="text-sm">{job.label}</p><Progress value={job.pct} className="mt-2" /></div>}
          {gh.data?.connected && (
            r.github_full_name ? (
              <div className="space-y-3 rounded-md border border-border p-4">
                <p className="flex items-center gap-2 text-sm"><Github className="size-4" /> Terhubung ke <a href={`https://github.com/${r.github_full_name}`} target="_blank" rel="noreferrer noopener" className="font-mono text-link hover:underline">{r.github_full_name}</a></p>
                <Input value={pushMsg} onChange={(e) => setPushMsg(e.target.value)} placeholder="Pesan commit untuk GitHub (opsional)" maxLength={300} />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={doPush} disabled={!!job}><Upload /> Push ke GitHub</Button>
                  <Button variant="outline" onClick={doPull} disabled={!!job}><Download /> Tarik dari GitHub</Button>
                  <Button variant="ghost" onClick={unlink} disabled={!!job}>Lepas tautan</Button>
                </div>
                <p className="text-xs text-muted-foreground">Push menyamakan isi branch {`"default"`} di GitHub dengan file di Pastodev (file yang tidak ada di sini akan dihapus di GitHub).</p>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-border p-4">
                <p className="text-sm font-semibold">Ekspor ke repositori GitHub baru</p>
                <div className="flex items-center gap-2 font-mono text-sm"><span className="text-muted-foreground">{gh.data.login ?? "github"} /</span><Input value={ghName} onChange={(e) => setGhName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ghPrivate} onChange={(e) => setGhPrivate(e.target.checked)} className="accent-primary" /> Jadikan private di GitHub</label>
                <Button onClick={doPush} disabled={!!job || !ghName}><Upload /> Ekspor ke GitHub</Button>
              </div>
            )
          )}
        </div>
      </Section>

      <Section title="Zona berbahaya" danger>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1"><p className="font-semibold">Ubah visibilitas</p><p className="text-sm text-muted-foreground">Saat ini {r.is_private ? "Private" : "Public"}.</p></div>
            <Button variant="outline" onClick={toggleVisibility}>Jadikan {r.is_private ? "Public" : "Private"}</Button>
          </div>
          <div className="border-t border-border pt-5">
            <p className="font-semibold">Hapus repositori</p>
            <p className="text-sm text-muted-foreground">Semua file, commit, issue, dan pull request akan hilang permanen. Ketik <b className="font-mono text-foreground">{username}/{r.name}</b> untuk konfirmasi.</p>
            <div className="mt-3 flex gap-2">
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} className="font-mono" aria-label="Konfirmasi nama" />
              <Button variant="destructive" disabled={confirmName !== `${username}/${r.name}`} onClick={del}>Hapus</Button>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
