import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { parseLinks, safeUrl, type AccountType, type ProfileLink } from "@/lib/market";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SignInCta } from "@/components/sign-in-cta";
import { AvatarMini } from "@/components/avatar-mini";
import { GithubConnectCard } from "@/components/github-connect";
import { ImageUpload } from "@/components/image-upload";
import { AccountTypePicker } from "@/components/account-type-picker";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Pengaturan — Pastodev" },
      { name: "description", content: "Ubah profil, jenis akun, link, dan koneksi GitHub kamu." },
      { property: "og:title", content: "Pengaturan — Pastodev" },
      { property: "og:description", content: "Ubah profil, jenis akun, link, dan koneksi GitHub kamu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Settings,
});

const EMPTY = { username: "", display_name: "", headline: "", bio: "", avatar_url: "", location: "", website: "", company: "", skills: "" };

function Settings() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [type, setType] = useState<AccountType | null>(null);
  const [hire, setHire] = useState(false);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  useEffect(() => {
    if (!profile) return;
    setF({ username: profile.username, display_name: profile.display_name ?? "", headline: profile.headline ?? "", bio: profile.bio ?? "", avatar_url: profile.avatar_url ?? "", location: profile.location ?? "", website: profile.website ?? "", company: profile.company ?? "", skills: (profile.skills ?? []).join(", ") });
    setType(profile.account_type);
    setHire(profile.available_for_hire);
    setLinks(parseLinks(profile.links));
  }, [profile]);
  if (!profile) return <main className="mx-auto max-w-xl px-4 py-12"><SignInCta text="Masuk untuk membuka pengaturan." /></main>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(f.username)) { toast.error("Username 3–30 huruf, angka, - atau _."); return; }
    if (f.website && !safeUrl(f.website)) { toast.error("Website harus diawali https://"); return; }
    const cleanLinks: ProfileLink[] = [];
    for (const l of links) {
      if (!l.url.trim() && !l.label.trim()) continue;
      const url = safeUrl(l.url);
      if (!url) { toast.error(`Link "${l.label || l.url}" harus diawali https://`); return; }
      cleanLinks.push({ label: l.label.trim().slice(0, 40) || new URL(url).hostname, url });
    }
    const skills = [...new Set(f.skills.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 20).map((s) => s.slice(0, 30));
    const { error } = await supabase.from("profiles").update({
      username: f.username.toLowerCase(), display_name: f.display_name || null, headline: f.headline || null, bio: f.bio || null,
      avatar_url: f.avatar_url || null, location: f.location || null, website: f.website || null, company: f.company || null,
      skills, links: cleanLinks.slice(0, 10), account_type: type, available_for_hire: type === "developer" && hire,
    }).eq("id", profile!.id);
    if (error) toast.error(error.code === "23505" ? "Username sudah dipakai." : error.message);
    else { toast.success("Profil disimpan"); qc.invalidateQueries(); }
  }
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><Label htmlFor={k}>{label}</Label><Input id={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={120} {...props} /></div>
  );
  return (
    <main className="mx-auto grid max-w-4xl gap-10 px-4 py-10 md:grid-cols-[1fr_260px]">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan</h1>
        <form onSubmit={save} className="space-y-4">
          <h2 className="mt-8 border-b border-border pb-2 text-lg font-semibold">Jenis akun</h2>
          <AccountTypePicker value={type} onChange={setType} />
          {type === "developer" && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span><b>Terbuka untuk proyek</b><span className="block text-xs text-muted-foreground">Tampilkan lencana "Siap di-hire" di profil.</span></span>
              <Switch checked={hire} onCheckedChange={setHire} />
            </label>
          )}

          <h2 className="mt-10 border-b border-border pb-2 text-lg font-semibold">Profil publik</h2>
          <div><Label>Foto profil</Label><ImageUpload round value={f.avatar_url || null} onChange={(u) => setF({ ...f, avatar_url: u ?? "" })} folder="avatar" label="Unggah foto" className="mt-2" /></div>
          {field("username", "Username")}
          {field("display_name", "Nama tampilan")}
          {field("headline", "Headline", { placeholder: "mis. Fullstack developer · React & Laravel" })}
          <div><Label htmlFor="b">Bio</Label><Textarea id="b" value={f.bio} maxLength={500} onChange={(e) => setF({ ...f, bio: e.target.value })} /></div>
          {field("skills", "Keahlian (pisahkan dengan koma)", { placeholder: "React, Node.js, Figma", maxLength: 600 })}
          {field("company", "Perusahaan / kampus")}
          {field("location", "Lokasi")}
          {field("website", "Website", { type: "url", placeholder: "https://" })}

          <div>
            <div className="flex items-center justify-between"><Label>Link (GitHub, LinkedIn, Dribbble, dll.)</Label>
              <Button type="button" size="sm" variant="ghost" disabled={links.length >= 10} onClick={() => setLinks([...links, { label: "", url: "" }])}><Plus /> Tambah</Button></div>
            <div className="mt-2 space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label="Nama link" placeholder="LinkedIn" value={l.label} maxLength={40} className="w-36" onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input aria-label="Alamat link" placeholder="https://" value={l.url} maxLength={300} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" aria-label="Hapus link" onClick={() => setLinks(links.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
              {links.length === 0 && <p className="text-xs text-muted-foreground">Belum ada link.</p>}
            </div>
          </div>
          <Button>Simpan profil</Button>
        </form>
        <h2 className="mt-10 border-b border-border pb-2 text-lg font-semibold">Koneksi</h2>
        <div className="mt-4"><GithubConnectCard /></div>
      </div>
      <aside className="text-center md:pt-16">
        <div className="inline-block"><AvatarMini name={f.username || "?"} url={f.avatar_url || null} size={160} /></div>
        <p className="mt-3 font-semibold">{f.display_name}</p>
        <p className="font-mono text-sm text-muted-foreground">@{f.username}</p>
        {f.headline && <p className="mt-2 text-sm text-muted-foreground">{f.headline}</p>}
      </aside>
    </main>
  );
}
