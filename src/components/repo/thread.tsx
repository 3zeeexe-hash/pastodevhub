import { Link } from "@tanstack/react-router";
import { timeAgo } from "@/lib/auth";
import { AvatarMini } from "@/components/avatar-mini";
import { Markdown } from "@/components/markdown";

export type ThreadItem = { id: string; body: string; created_at: string; author_id: string; author: { username: string; avatar_url: string | null } | null };

export function ThreadComment({ item, badge, onDelete }: { item: ThreadItem; badge?: string | undefined; onDelete?: (() => void) | undefined }) {
  const name = item.author?.username ?? "?";
  return (
    <div className="flex gap-3">
      <div className="hidden sm:block"><AvatarMini name={name} url={item.author?.avatar_url} size={36} /></div>
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-sm">
          <Link to="/$username" params={{ username: name }} className="font-semibold hover:underline">{name}</Link>
          <span className="text-muted-foreground">berkomentar {timeAgo(item.created_at)}</span>
          {badge && <span className="ml-auto rounded-full border border-border px-2 text-xs text-muted-foreground">{badge}</span>}
          {onDelete && <button onClick={onDelete} className={`${badge ? "" : "ml-auto"} text-xs text-destructive hover:underline`}>Hapus</button>}
        </div>
        <div className="p-4">{item.body.trim() ? <Markdown>{item.body}</Markdown> : <p className="text-sm italic text-muted-foreground">Tidak ada deskripsi.</p>}</div>
      </div>
    </div>
  );
}
