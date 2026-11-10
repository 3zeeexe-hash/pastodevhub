import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FilePlus2, FileMinus2, FileDiff } from "lucide-react";
import { diffLines, type Change } from "@/lib/repo";
import { cn } from "@/lib/utils";

function FileDiffBlock({ change }: { change: Change }) {
  const [open, setOpen] = useState(true);
  const hasContent = change.before !== undefined || change.after !== undefined;
  const lines = useMemo(() => (hasContent ? diffLines(change.before ?? "", change.after ?? "") : []), [change, hasContent]);
  const add = lines.filter((l) => l.type === "add").length;
  const del = lines.filter((l) => l.type === "del").length;
  // Collapse long unchanged runs to 3 lines of context, like GitHub.
  const visible = useMemo(() => {
    const keep = new Array(lines.length).fill(false);
    lines.forEach((l, i) => { if (l.type !== "same") for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 3); k++) keep[k] = true; });
    const out: (typeof lines[number] | { gap: number })[] = [];
    let gap = 0;
    lines.forEach((l, i) => { if (keep[i]) { if (gap) out.push({ gap }); gap = 0; out.push(l); } else gap++; });
    if (gap) out.push({ gap });
    return out;
  }, [lines]);
  const Icon = change.type === "add" ? FilePlus2 : change.type === "delete" ? FileMinus2 : FileDiff;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-left font-mono text-sm">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Icon className={cn("size-4", change.type === "add" ? "text-success" : change.type === "delete" ? "text-destructive" : "text-primary")} />
        <span className="truncate">{change.path}</span>
        {hasContent && <span className="ml-auto shrink-0 text-xs"><span className="text-success">+{add}</span> <span className="text-destructive">−{del}</span></span>}
      </button>
      {open && (hasContent ? (
        <div className="overflow-x-auto font-mono text-[12.5px] leading-5">
          <table className="w-full border-collapse">
            <tbody>
              {visible.map((l, i) => "gap" in l ? (
                <tr key={i} className="bg-muted/40 text-muted-foreground"><td colSpan={3} className="px-3 py-1 text-xs">⋯ {l.gap} baris tidak berubah</td></tr>
              ) : (
                <tr key={i} className={l.type === "add" ? "bg-diff-add" : l.type === "del" ? "bg-diff-del" : ""}>
                  <td className="w-10 select-none px-2 text-right text-muted-foreground/60">{l.a ?? ""}</td>
                  <td className="w-10 select-none px-2 text-right text-muted-foreground/60">{l.b ?? ""}</td>
                  <td className="whitespace-pre px-3"><span className={cn("mr-2 select-none", l.type === "add" ? "text-success" : l.type === "del" ? "text-destructive" : "text-muted-foreground/40")}>{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>{l.text}</td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td className="px-3 py-3 text-xs text-muted-foreground">File kosong.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : <p className="px-3 py-3 text-xs text-muted-foreground">{change.type === "add" ? "File ditambahkan" : change.type === "delete" ? "File dihapus" : "File diubah"} (isi tidak disimpan untuk commit besar).</p>)}
    </div>
  );
}

export function DiffView({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Tidak ada perubahan.</p>;
  return <div className="space-y-4">{changes.map((c) => <FileDiffBlock key={c.path} change={c} />)}</div>;
}
