import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Globe, Lock, Github, Terminal, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { commitChanges } from "@/lib/repo-data";
import { REPO_NAME_RE, type Change } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignInCta } from "@/components/sign-in-cta";
import { RepoSetupGuide } from "@/components/repo/git-clone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "Repositori baru — Pastodev" },
      { name: "description", content: "Buat repositori kode baru di Pastodev." },
      { property: "og:title", content: "Repositori baru — Pastodev" },
      { property: "og:description", content: "Buat repositori kode baru." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewRepo,
});

const GITIGNORES: Record<string, string> = {
  Node: "node_modules/\ndist/\n.env\n*.log\n",
  Python: "__pycache__/\n*.pyc\n.venv/\n.env\n",
  Go: "bin/\n*.exe\n*.test\n",
  Java: "*.class\ntarget/\nbuild/\n.gradle/\n.idea/\n",
  Rust: "target/\n",
  PHP: "vendor/\n.env\n",
  Flutter: ".dart_tool/\nbuild/\n.packages\n.flutter-plugins\n",
};
const mit = (name: string) => `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${name}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.\n`;

const VISIBILITY = [
  { priv: false, Icon: Globe, label: "Public", desc: "Siapa pun bisa melihat repositori ini." },
  { priv: true, Icon: Lock, label: "Private", desc: "Hanya kamu yang bisa melihat." },
] as const;

function nameProblem(n: string): string | null {
  if (!n) return null;
  if (!REPO_NAME_RE.test(n)) return "Nama hanya boleh huruf, angka, titik, - dan _.";
  if (n === "." || n === "..") return "Nama tidak valid.";
  if (/\.git$/i.test(n)) return "Nama tidak boleh berakhiran .git.";
  return null;
}

function NewRepo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  // Like GitHub: everything is off by default, so a new repo is empty.
  const [readme, setReadme] = useState(false);
  const [gitignore, setGitignore] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ repo: string; branch: string; initialized: boolean } | null>(null);
  if (!user || !profile) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk dulu untuk membuat repositori." /></main>;

  const problem = nameProblem(name);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || problem) { toast.error(problem ?? "Isi nama repositori."); return; }
    setBusy(true);
    const desc = description.trim();
    const { data, error } = await supabase.from("repositories").insert({ owner_id: user!.id, name, description: desc, is_private: isPrivate }).select().single();
    if (error) { toast.error(error.code === "23505" ? "Nama repositori sudah kamu pakai." : error.message); setBusy(false); return; }
    const changes: Change[] = [];
    if (readme) changes.push({ path: "README.md", type: "add", after: `# ${name}\n${desc ? `\n${desc}\n` : ""}` });
    if (gitignore) changes.push({ path: ".gitignore", type: "add", after: GITIGNORES[gitignore] ?? "" });
    if (license === "MIT") changes.push({ path: "LICENSE", type: "add", after: mit(profile!.display_name || profile!.username) });
    let initialized = false;
    try {
      if (changes.length) { await commitChanges({ repoId: data.id, authorId: user!.id, message: "Initial commit", changes }); initialized = true; }
    } catch (err) { toast.error((err as Error).message); }
    setBusy(false);
    // Stay on /new and show the GitHub-style setup guide (git commands + upload options).
    setCreated({ repo: name, branch: data.default_branch || "main", initialized });
    window.scrollTo({ top: 0 });
  }

  if (created) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className="size-8 text-primary" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Repositori berhasil dibuat</h1>
            <p className="truncate font-mono text-sm text-muted-foreground">{profile.username} / {created.repo}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button onClick={() => navigate({ to: "/$username/$repo", params: { username: profile.username, repo: created.repo } })}>Buka repositori</Button>
            <Button variant="outline" onClick={() => { setCreated(null); setName(""); setDescription(""); setReadme(false); setGitignore(""); setLicense(""); }}>Buat lagi</Button>
          </div>
        </div>
        <RepoSetupGuide username={profile.username} repo={created.repo} branch={created.branch} initialized={created.initialized} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Buat repositori baru</h1>
      <p className="mt-1 text-sm text-muted-foreground">Repositori berisi semua file proyek beserta riwayat perubahannya. Sudah punya di GitHub? <Link to="/import" className="text-link hover:underline">Impor repositori</Link>.</p>
      <p className="mt-1 text-xs text-muted-foreground">Kolom bertanda * wajib diisi.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_auto_1fr] sm:items-end">
          <div>
            <Label htmlFor="o">Pemilik *</Label>
            <Input id="o" value={profile.username} disabled className="mt-1 font-mono text-sm" />
          </div>
          <span className="hidden pb-2 text-lg text-muted-foreground sm:block">/</span>
          <div>
            <Label htmlFor="n">Nama repositori *</Label>
            <Input id="n" className="mt-1 font-mono text-sm" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))} required maxLength={100} placeholder="proyek-keren" aria-invalid={!!problem} aria-describedby="n-hint" />
          </div>
        </div>
        <p id="n-hint" className={cn("-mt-3 text-xs", problem ? "text-destructive" : "text-muted-foreground")}>
          {problem ?? (name ? <>Alamat git: <span className="font-mono">{origin}/{profile.username}/{name}.git</span></> : "Pilih nama yang singkat dan mudah diingat.")}
        </p>
        <div><Label htmlFor="d">Deskripsi (opsional)</Label><Textarea id="d" className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} /></div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          {VISIBILITY.map(({ priv, Icon, label, desc }) => (
            <label key={label} className={cn("flex cursor-pointer items-start gap-3 rounded-md p-2", isPrivate === priv && "bg-accent")}>
              <input type="radio" name="vis" checked={isPrivate === priv} onChange={() => setIsPrivate(priv)} className="mt-1 accent-primary" />
              <Icon className="mt-0.5 size-5 text-muted-foreground" />
              <span><b className="block text-sm">{label}</b><span className="text-xs text-muted-foreground">{desc}</span></span>
            </label>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <div>
            <p className="font-semibold">Inisialisasi repositori (opsional)</p>
            <p className="text-xs text-muted-foreground">Biarkan kosong jika kamu mau push proyek yang sudah ada dari terminal.</p>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} className="accent-primary" /> Tambahkan file README</label>
          <label className="flex items-center gap-2">.gitignore
            <select value={gitignore} onChange={(e) => setGitignore(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
              <option value="">Tidak ada</option>{Object.keys(GITIGNORES).map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Lisensi
            <select value={license} onChange={(e) => setLicense(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
              <option value="">Tidak ada</option><option value="MIT">MIT</option>
            </select>
          </label>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Terminal className="mt-0.5 size-4 shrink-0" /> Setelah dibuat kamu akan melihat panduan upload (perintah git untuk terminal) persis seperti GitHub.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !name || !!problem}>{busy ? "Membuat…" : "Buat repositori"}</Button>
          <Button asChild variant="outline" type="button"><Link to="/import"><Github /> Impor dari GitHub</Link></Button>
        </div>
      </form>
    </main>
  );
}
