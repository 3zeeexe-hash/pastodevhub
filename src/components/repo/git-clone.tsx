import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function gitUrl(username: string, repo: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/${username}/${repo}.git`;
}

export function CopyLine({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 gap-1">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs" />
      <Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={`Salin ${label}`}
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Disalin"); }}><Copy /></Button>
    </div>
  );
}

function Block({ title, lines }: { title: string; lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <p className="text-sm font-semibold">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(text); toast.success("Perintah disalin"); }}><Copy /> Salin</Button>
      </div>
      <pre className="overflow-x-auto p-3 text-left font-mono text-xs leading-5">{text}</pre>
    </div>
  );
}

/**
 * GitHub-style "Quick setup" guide. `initialized` = the repo already has files (README etc.),
 * so the guide shows clone + add-files commands instead of the empty-repo init commands.
 */
export function RepoSetupGuide({ username, repo, branch, initialized }: { username: string; repo: string; branch: string; initialized: boolean }) {
  const url = gitUrl(username, repo);
  return (
    <section className="space-y-6 rounded-lg border border-border p-6 text-left">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Terminal className="size-5 text-primary" /> Quick setup — mulai dari sini</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {initialized
            ? "Repositori sudah berisi file awal. Ambil ke komputermu lalu tambah file lewat terminal, sama seperti GitHub."
            : "Repositori ini masih kosong. Hubungkan dari komputermu lewat terminal, sama seperti GitHub."}
        </p>
        <div className="mt-3"><CopyLine value={url} label="URL git" /></div>
        <p className="mt-3 text-sm text-muted-foreground">
          Atau langsung{" "}
          <Link to="/$username/$repo/new" params={{ username, repo }} search={{ dir: "", mode: "create" }} className="text-link hover:underline">buat file baru</Link>{" "}
          atau{" "}
          <Link to="/$username/$repo/new" params={{ username, repo }} search={{ dir: "", mode: "upload" }} className="text-link hover:underline">upload file yang sudah ada</Link>.
          Sebaiknya setiap repositori punya README, LICENSE, dan .gitignore.
        </p>
      </div>
      {initialized ? (
        <Block title="…ambil repositori ini ke komputermu" lines={[`git clone ${url}`, `cd ${repo}`]} />
      ) : (
        <>
          <Block title="…atau buat repositori baru lewat terminal" lines={[
            `echo "# ${repo}" >> README.md`, "git init", "git add README.md", 'git commit -m "first commit"',
            `git branch -M ${branch}`, `git remote add origin ${url}`, `git push -u origin ${branch}`,
          ]} />
          <Block title="…atau push repositori yang sudah ada lewat terminal" lines={[
            `git remote add origin ${url}`, `git branch -M ${branch}`, `git push -u origin ${branch}`,
          ]} />
        </>
      )}
      <Block title="…tambah atau ubah file (kode, gambar, video, audio) lalu kirim" lines={[
        "git add .", 'git commit -m "tambah file"', "git push",
      ]} />
      <p className="text-sm text-muted-foreground">
        …atau <Link to="/import" className="text-link hover:underline">impor kode dari repositori lain</Link> (GitHub).
      </p>
      <p className="text-xs text-muted-foreground">
        Saat diminta kata sandi, pakai <Link to="/settings" hash="token-git" className="text-link hover:underline">token git</Link> kamu (bukan kata sandi akun).
      </p>
    </section>
  );
}

/** Quick setup for an empty repo (shown on the repo page). */
export function EmptyRepoGitHelp({ username, repo, branch }: { username: string; repo: string; branch: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <RepoSetupGuide username={username} repo={repo} branch={branch} initialized={false} />
    </div>
  );
}
