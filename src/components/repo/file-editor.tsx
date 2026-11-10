import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

export type EditorResult = { path: string; content: string; message: string; description: string };

export function FileEditor({ username, repo, initialPath, initialContent, defaultMessage, onCommit, busy }: {
  username: string; repo: string; initialPath: string; initialContent: string; defaultMessage: string;
  onCommit: (r: EditorResult) => void; busy: boolean;
}) {
  const [path, setPath] = useState(initialPath);
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const isMd = /\.(md|markdown)$/i.test(path);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className="text-link">{repo}</span><span className="text-muted-foreground">/</span>
        <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="folder/nama-file.ts" className="max-w-md font-mono" aria-label="Nama file" />
        <span className="font-sans text-xs text-muted-foreground">Gunakan "/" untuk membuat folder</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex border-b border-border bg-muted/50 text-sm">
          {(["edit", "preview"] as const).filter((t) => t === "edit" || isMd).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("flex items-center gap-1 px-4 py-2", tab === t ? "bg-background" : "text-muted-foreground hover:text-foreground")}>
              {t === "edit" ? <FileCode2 className="size-4" /> : <Eye className="size-4" />}{t === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
        {tab === "edit" ? (
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart; const v = content.slice(0, s) + "  " + content.slice(t.selectionEnd); setContent(v); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); } }}
            className="min-h-[480px] rounded-none border-0 bg-background font-mono text-[13px] leading-6 focus-visible:ring-0" />
        ) : <div className="min-h-[480px] p-6"><Markdown>{content}</Markdown></div>}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-semibold">Commit perubahan</p>
        <Input className="mt-3" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={defaultMessage} maxLength={200} aria-label="Pesan commit" />
        <Textarea className="mt-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi tambahan (opsional)" maxLength={2000} />
        <div className="mt-3 flex gap-2">
          <Button disabled={busy} onClick={() => onCommit({ path, content, message: message.trim() || defaultMessage, description: description.trim() })}>{busy ? "Menyimpan…" : "Commit perubahan"}</Button>
          <Button asChild variant="ghost"><Link to="/$username/$repo" params={{ username, repo }}>Batal</Link></Button>
        </div>
      </div>
    </div>
  );
}
