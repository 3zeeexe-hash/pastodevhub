import { Link } from "@tanstack/react-router";
import { Star, Lock, GitFork } from "lucide-react";
import { timeAgo } from "@/lib/auth";
import { languageColor } from "@/lib/repo";
import { AvatarMini } from "@/components/avatar-mini";

export type RepoCardData = {
  id: string; name: string; description: string | null; language: string | null; is_private?: boolean; updated_at?: string; created_at: string;
  forked_from?: string | null; topics?: string[];
  owner: { username: string; avatar_url: string | null } | null; stars?: { count: number }[];
};

export function RepoCard({ r, showOwner = true }: { r: RepoCardData; showOwner?: boolean }) {
  if (!r.owner) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition hover:border-primary/60">
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        {showOwner && <AvatarMini name={r.owner.username} url={r.owner.avatar_url} size={20} />}
        <Link to="/$username/$repo" params={{ username: r.owner.username, repo: r.name }} className="min-w-0 truncate hover:underline">
          {showOwner && <span className="text-muted-foreground">{r.owner.username} / </span>}
          <span className="font-semibold text-link">{r.name}</span>
        </Link>
        <span className="rounded-full border border-border px-2 text-[11px] text-muted-foreground">{r.is_private ? <><Lock className="mr-1 inline size-3" />Private</> : "Public"}</span>
      </div>
      {r.forked_from && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><GitFork className="size-3" /> fork</p>}
      {r.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
      {r.topics && r.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{r.topics.slice(0, 5).map((t) => <span key={t} className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{t}</span>)}</div>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {r.language && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ backgroundColor: languageColor(r.language) }} />{r.language}</span>}
        <span className="flex items-center gap-1"><Star className="size-3" /> {r.stars?.[0]?.count ?? 0}</span>
        <span>Diperbarui {timeAgo(r.updated_at ?? r.created_at)}</span>
      </div>
    </div>
  );
}
