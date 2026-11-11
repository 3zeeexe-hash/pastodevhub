import { useState } from "react";
import { toast } from "sonner";
import { Code2, Download, Github, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RepoData } from "@/lib/repo-data";
import { CopyLine, gitUrl } from "@/components/repo/git-clone";

export function CodeMenu({ data }: { data: RepoData }) {
  const [busy, setBusy] = useState(false);
  const url = typeof window !== "undefined" ? gitUrl(data.owner.username, data.repo.name) : "";
  async function zip() {
    setBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      const root = z.folder(`${data.repo.name}-${data.repo.default_branch}`)!;
      for (const f of data.files) root.file(f.path, f.content);
      const blob = await z.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${data.repo.name}-${data.repo.default_branch}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm"><Code2 /> Code</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1rem))]">
        <DropdownMenuLabel>Clone lewat HTTPS</DropdownMenuLabel>
        <div className="space-y-1 px-2 pb-2">
          <CopyLine value={`git clone ${gitUrl(data.owner.username, data.repo.name)}`} label="perintah clone" />
          <p className="text-[11px] text-muted-foreground">Push/pull pakai token git dari Pengaturan sebagai kata sandi.</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>URL Git repositori</DropdownMenuLabel>
        <div className="flex gap-1 px-2 pb-2">
          <input readOnly value={url} className="flex-1 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs" aria-label="URL Git repositori" />
          <Button size="icon" variant="ghost" aria-label="Salin URL" onClick={() => { navigator.clipboard.writeText(url); toast.success("URL disalin"); }}><Copy /></Button>
        </div>
        {data.repo.github_full_name && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Clone dari GitHub</DropdownMenuLabel>
            <div className="flex gap-1 px-2 pb-2">
              <input readOnly value={`git clone https://github.com/${data.repo.github_full_name}.git`} className="flex-1 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs" aria-label="Perintah clone" />
              <Button size="icon" variant="ghost" aria-label="Salin perintah clone" onClick={() => { navigator.clipboard.writeText(`git clone https://github.com/${data.repo.github_full_name}.git`); toast.success("Perintah disalin"); }}><Copy /></Button>
            </div>
            <DropdownMenuItem asChild><a href={`https://github.com/${data.repo.github_full_name}`} target="_blank" rel="noreferrer noopener"><Github /> Buka di GitHub</a></DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={zip} disabled={busy || data.files.length === 0}><Download /> {busy ? "Menyiapkan ZIP…" : "Download ZIP"}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
