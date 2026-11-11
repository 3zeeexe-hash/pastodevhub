import { Link } from "@tanstack/react-router";
import { tokenizeBody } from "@/lib/feed";
import { cn } from "@/lib/utils";

/** Isi post: #hashtag dan @mention jadi link, URL dibuka di tab baru, `kode` dan ```blok kode``` rapi. */
export function RichText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {tokenizeBody(body).map((t, i) => {
        switch (t.type) {
          case "hashtag":
            return <Link key={i} to="/discuss/tag/$tag" params={{ tag: t.tag }} className="text-primary hover:underline">{t.value}</Link>;
          case "mention":
            return <Link key={i} to="/$username" params={{ username: t.username }} className="text-primary hover:underline">{t.value}</Link>;
          case "url":
            return <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-primary hover:underline">{t.value}</a>;
          case "code":
            return <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em]">{t.value}</code>;
          case "codeblock":
            return (
              <pre key={i} className="my-2 overflow-x-auto whitespace-pre rounded-md border border-border bg-secondary p-3 font-mono text-xs leading-relaxed">
                {t.lang && <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">{t.lang}</span>}
                <code>{t.value}</code>
              </pre>
            );
          default:
            return <span key={i}>{t.value}</span>;
        }
      })}
    </div>
  );
}
