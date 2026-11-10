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
        <p className="text-xs font-semibold">{title}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(text); toast.success("Perintah disalin"); }}><Copy /> Salin</Button>
      </div>
      <pre className="overflow-x-auto p-3 text-left font-mono text-xs leading-5">{text}</pre>
    </div>
  );
}

/** GitHub-style "quick setup" for an empty repo. */
export function EmptyRepoGitHelp({ username, repo, branch }: { username: string; repo: string; branch: string }) {
  const url = gitUrl(username, repo);
  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-3 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold"><Terminal className="size-4 text-primary" /> Atau lewat terminal</p>
      <CopyLine value={url} label="URL git" />
      <Block title="…buat repositori baru dari terminal" lines={[
        `echo "# ${repo}" >> README.md`, "git init", "git add README.md", 'git commit -m "first commit"',
        `git branch -M ${branch}`, `git remote add origin ${url}`, `git push -u origin ${branch}`,
      ]} />
      <Block title="…atau push repositori yang sudah ada (impor dari GitHub/GitLab)" lines={[
        `git remote add pastodev ${url}`, `git push -u pastodev ${branch}`,
      ]} />
      <p className="text-xs text-muted-foreground">
        Saat diminta kata sandi, pakai <Link to="/settings" hash="token-git" className="text-link hover:underline">token git</Link> kamu (bukan kata sandi akun).
      </p>
    </div>
  );
}
