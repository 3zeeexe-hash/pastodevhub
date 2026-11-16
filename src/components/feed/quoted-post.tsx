import { Link } from "@tanstack/react-router";
import { timeAgo } from "@/lib/auth";
import type { FeedPostBase } from "@/lib/feed";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { RichText } from "@/components/feed/rich-text";
import { PostImage } from "@/components/feed/post-image";

/** Post yang dikutip, tampil kecil di dalam post lain atau di komposer kutipan. */
export function QuotedPost({ post }: { post: FeedPostBase & { image?: string | null } }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center gap-2 text-sm">
        <AvatarMini name={post.author.username} url={post.author.avatar_url} size={20} />
        <Link to="/$username" params={{ username: post.author.username }} className="truncate font-semibold hover:underline">{post.author.display_name || post.author.username}</Link>
        <VerifiedBadge username={post.author.username} size={14} />
        <span className="truncate text-muted-foreground">@{post.author.username} · {timeAgo(post.created_at)}</span>
      </div>
      <Link to="/gobifeed/status/$id" params={{ id: post.id }} className="mt-1 block">
        {post.body.trim() && <RichText body={post.body} className="line-clamp-4 text-sm" />}
      </Link>
      {post.image && <PostImage url={post.image} compact />}
    </div>
  );
}
