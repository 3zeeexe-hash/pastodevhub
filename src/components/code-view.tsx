import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import { hljsLanguage } from "@/lib/repo";

export function CodeView({ path, content }: { path: string; content: string }) {
  const html = useMemo(() => {
    const lang = hljsLanguage(path);
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      if (content.length < 100_000) return hljs.highlightAuto(content).value;
    } catch { /* fall through */ }
    return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }, [path, content]);
  const lines = Math.max(1, content.split("\n").length - (content.endsWith("\n") ? 1 : 0));
  return (
    <div className="flex overflow-x-auto font-mono text-[13px] leading-6">
      <pre aria-hidden className="select-none border-r border-border px-3 py-3 text-right text-muted-foreground/60">
        {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
      </pre>
      <pre className="flex-1 px-4 py-3"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}
