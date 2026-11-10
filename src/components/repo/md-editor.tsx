import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

export function MdEditor({ value, onChange, placeholder, minH = "min-h-[160px]" }: { value: string; onChange: (v: string) => void; placeholder?: string; minH?: string }) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex border-b border-border bg-muted/50 text-sm">
        {(["write", "preview"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("px-4 py-2", tab === t ? "bg-background font-medium" : "text-muted-foreground hover:text-foreground")}>{t === "write" ? "Tulis" : "Preview"}</button>
        ))}
        <span className="ml-auto self-center pr-3 text-xs text-muted-foreground">Mendukung Markdown</span>
      </div>
      {tab === "write"
        ? <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={20000} className={cn("rounded-none border-0 focus-visible:ring-0", minH)} />
        : <div className={cn("p-4", minH)}>{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Tidak ada yang bisa di-preview.</p>}</div>}
    </div>
  );
}
