import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Globe, Lock, Github } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { commitChanges } from "@/lib/repo-data";
import { REPO_NAME_RE, type Change } from "@/lib/repo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignInCta } from "@/components/sign-in-cta";
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
};
const mit = (name: string) => `MIT License\n\nCopyright (c) ${new Date().getFullYear()} ${name}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.\n`;

function NewRepo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [readme, setReadme] = useState(true);
  const [gitignore, setGitignore] = useState("");
  const [license, setLicense] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || !profile) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk dulu untuk membuat repositori." /></main>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!REPO_NAME_RE.test(name)) { toast.error("Nama hanya boleh huruf, angka, titik, - dan _."); return; }
    setBusy(true);
    const { data, error } = await supabase.from("repositories").insert({ owner_id: user!.id, name, description, is_private: isPrivate }).select().single();
    if (error) { toast.error(error.code === "23505" ? "Nama repositori sudah kamu pakai." : error.message); setBusy(false); return; }
    const changes: Change[] = [];
    if (readme) changes.push({ path: "README.md", type: "add", after: `# ${name}\n\n${description}\n` });
    if (gitignore) changes.push({ path: ".gitignore", type: "add", after: GITIGNORES[gitignore] ?? "" });
    if (license) changes.push({ path: "LICENSE", type: "add", after: mit(profile!.display_name || profile!.username) });
    try {
      if (changes.length) await commitChanges({ repoId: data.id, authorId: user!.id, message: "Initial commit", changes });
    } catch (err) { toast.error((err as Error).message); }
    navigate({ to: "/$username/$repo", params: { username: profile!.username, repo: name } });
  }
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Buat repositori baru</h1>
      <p className="mt-1 text-sm text-muted-foreground">Repositori berisi semua file proyek beserta riwayat perubahannya. Sudah punya di GitHub? <Link to="/import" className="text-link hover:underline">Impor repositori</Link>.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <Label htmlFor="n">Nama repositori *</Label>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm"><span className="text-muted-foreground">{profile.username} /</span>
            <Input id="n" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))} required maxLength={100} placeholder="proyek-keren" /></div>
        </div>
        <div><Label htmlFor="d">Deskripsi (opsional)</Label><Textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={350} /></div>
        <div className="space-y-2 rounded-lg border border-border p-3">
          {[[false, Globe, "Public", "Siapa pun bisa melihat repositori ini."], [true, Lock, "Private", "Hanya kamu yang bisa melihat."]].map(([v, Icon, label, desc]: any) => (
            <label key={label} className={cn("flex cursor-pointer items-start gap-3 rounded-md p-2", isPrivate === v && "bg-accent")}>
              <input type="radio" name="vis" checked={isPrivate === v} onChange={() => setIsPrivate(v)} className="mt-1 accent-primary" />
              <Icon className="mt-0.5 size-5 text-muted-foreground" />
              <span><b className="block text-sm">{label}</b><span className="text-xs text-muted-foreground">{desc}</span></span>
            </label>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold">Inisialisasi repositori</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} className="accent-primary" /> Tambahkan file README</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={license} onChange={(e) => setLicense(e.target.checked)} className="accent-primary" /> Tambahkan lisensi MIT</label>
          <label className="flex items-center gap-2">.gitignore
            <select value={gitignore} onChange={(e) => setGitignore(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
              <option value="">Tidak ada</option>{Object.keys(GITIGNORES).map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>Buat repositori</Button>
          <Button asChild variant="outline" type="button"><Link to="/import"><Github /> Impor dari GitHub</Link></Button>
        </div>
      </form>
    </main>
  );
}
