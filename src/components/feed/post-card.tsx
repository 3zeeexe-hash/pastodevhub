import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Bookmark, Flag, Heart, MessageCircle, MoreHorizontal, Quote, Repeat2, Share, Trash2, VolumeX } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { deletePost, setBookmark, setLike, setRepost, type FeedPost, type FeedPostBase, type PostMeta, type ViewerState } from "@/lib/feed";
import { setUserFilter, type UserFilterKind } from "@/lib/feed-moderation";
import { AvatarMini } from "@/components/avatar-mini";
import { VerifiedBadge } from "@/components/verified-badge";
import { RichText } from "@/components/feed/rich-text";
import { QuotedPost } from "@/components/feed/quoted-post";
import { Composer } from "@/components/feed/composer";
import { PollView } from "@/components/feed/poll-view";
import { AutopostCard } from "@/components/feed/autopost-card";
import { ReportDialog } from "@/components/feed/report-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const INVALIDATE = ["feed", "feed-post", "feed-replies"];

type Override = Partial<Pick<ViewerState, "liked" | "bookmarked" | "reposted">>;

function Action({ label, count, active, activeClass, onClick, children }: {
  label: string; count?: number; active?: boolean; activeClass?: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("group inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent", active && activeClass)}
    >
      {children}
      {typeof count === "number" && count > 0 && <span className="font-mono text-xs">{count}</span>}
    </button>
  );
}

/** Satu post di linimasa. Repost menampilkan post aslinya dengan keterangan "me-repost" di atasnya. */
export function PostCard({ post, detail = false }: { post: FeedPost; detail?: boolean }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [quoting, setQuoting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [ov, setOv] = useState<Override>({});

  const isRepost = post.kind === "repost" && !!post.ref;
  const shown: FeedPostBase & PostMeta = isRepost ? (post.ref as FeedPostBase & PostMeta) : post;
  const quoted = post.kind === "quote" ? post.ref : null;

  const liked = ov.liked ?? shown.viewer.liked;
  const bookmarked = ov.bookmarked ?? shown.viewer.bookmarked;
  const reposted = ov.reposted ?? shown.viewer.reposted;
  const likeCount = shown.like_count + (liked === shown.viewer.liked ? 0 : liked ? 1 : -1);
  const repostCount = shown.repost_count + (reposted === shown.viewer.reposted ? 0 : reposted ? 1 : -1);

  const refresh = async () => {
    await Promise.all(INVALIDATE.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    setOv({});
  };
  const onError = (e: Error) => { setOv({}); toast.error(e.message); };

  const like = useMutation({ mutationFn: (on: boolean) => setLike(user!.id, shown.id, on), onMutate: (on) => setOv((o) => ({ ...o, liked: on })), onSettled: refresh, onError });
  const mark = useMutation({ mutationFn: (on: boolean) => setBookmark(user!.id, shown.id, on), onMutate: (on) => setOv((o) => ({ ...o, bookmarked: on })), onSettled: refresh, onError });
  const repost = useMutation({ mutationFn: (on: boolean) => setRepost(user!.id, shown.id, on), onMutate: (on) => setOv((o) => ({ ...o, reposted: on })), onSettled: refresh, onError });
  const del = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: async () => { toast.success(isRepost ? "Repost dibatalkan" : "Post dihapus"); await refresh(); if (detail) navigate({ to: "/discuss" }); },
    onError,
  });

  const hide = useMutation({
    mutationFn: (kind: UserFilterKind) => setUserFilter(user!.id, shown.author_id, kind),
    onSuccess: async (_d, kind) => {
      toast.success(kind === "mute" ? `@${shown.author.username} disenyapkan` : `@${shown.author.username} diblokir`);
      await refresh();
    },
    onError,
  });

  const needLogin = () => { toast("Masuk dulu untuk berinteraksi."); };
  const canDelete = !!user && (user.id === post.author_id || isAdmin);
  // Laporkan / senyapkan / blokir menyasar penulis post asli (untuk repost: penulis yang di-repost), bukan diri sendiri.
  const canModerate = !!user && user.id !== shown.author_id;

  async function share() {
    const url = `${window.location.origin}/discuss/status/${shown.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link disalin"); } catch { toast(url); }
  }

  // Klik di area kosong kartu membuka halaman post; klik link/tombol tetap bekerja sendiri.
  function openDetail(e: React.MouseEvent) {
    if (detail) return;
    if ((e.target as HTMLElement).closest("a,button,pre,[role=menuitem]")) return;
    navigate({ to: "/discuss/status/$id", params: { id: shown.id } });
  }

  return (
    <article
      onClick={openDetail}
      className={cn("border-b border-border px-4 py-3 transition", !detail && "cursor-pointer hover:bg-accent/30")}
    >
      {isRepost && (
        <p className="mb-1 flex items-center gap-1.5 pl-9 text-xs text-muted-foreground">
          <Repeat2 className="size-3.5" />
          <Link to="/$username" params={{ username: post.author.username }} className="font-medium hover:underline">{post.author_id === user?.id ? "Kamu" : post.author.display_name || post.author.username}</Link> me-repost
        </p>
      )}
      <div className="flex gap-3">
        <Link to="/$username" params={{ username: shown.author.username }} className="shrink-0">
          <AvatarMini name={shown.author.username} url={shown.author.avatar_url} size={detail ? 44 : 36} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Link to="/$username" params={{ username: shown.author.username }} className="truncate font-semibold hover:underline">{shown.author.display_name || shown.author.username}</Link>
            <VerifiedBadge username={shown.author.username} size={15} />
            <span className="truncate text-muted-foreground">@{shown.author.username}</span>
            <span className="shrink-0 text-muted-foreground">· {timeAgo(shown.created_at)}</span>
            {(canDelete || canModerate) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Menu post" className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent"><MoreHorizontal className="size-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => { if (confirm(isRepost ? "Batalkan repost ini?" : "Hapus post ini?")) del.mutate(); }}
                    >
                      <Trash2 /> {isRepost ? "Batalkan repost" : "Hapus post"}
                    </DropdownMenuItem>
                  )}
                  {canDelete && canModerate && <DropdownMenuSeparator />}
                  {canModerate && (
                    <>
                      <DropdownMenuItem onClick={() => setReporting(true)}><Flag /> Laporkan post</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => hide.mutate("mute")}><VolumeX /> Senyapkan @{shown.author.username}</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => { if (confirm(`Blokir @${shown.author.username}? Postingannya disembunyikan dan dia tidak bisa mengirim pesan padamu.`)) hide.mutate("block"); }}
                      >
                        <Ban /> Blokir @{shown.author.username}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {shown.kind === "reply" && shown.parent_id && (
            <Link to="/discuss/status/$id" params={{ id: shown.parent_id }} className="text-xs text-muted-foreground hover:text-primary">Membalas sebuah post</Link>
          )}
          <RichText body={shown.body} className={cn("mt-0.5", detail ? "text-lg leading-relaxed" : "text-[15px] leading-relaxed")} />
          {shown.autopost && <AutopostCard info={shown.autopost} />}
          {shown.poll && <PollView postId={shown.id} poll={shown.poll} />}
          {quoted && <div className="mt-2"><QuotedPost post={quoted} /></div>}
          {detail && <p className="mt-3 text-xs text-muted-foreground">{new Date(shown.created_at).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</p>}

          <div className="-ml-2 mt-1.5 flex items-center justify-between gap-1 sm:justify-start sm:gap-6">
            <Action label="Balas" count={shown.reply_count}
              onClick={() => navigate({ to: "/discuss/status/$id", params: { id: shown.id } })}>
              <MessageCircle className="size-4" />
            </Action>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Repost" aria-pressed={reposted}
                    className={cn("group inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-accent", reposted && "text-emerald-500")}>
                    <Repeat2 className="size-4" />
                    {repostCount > 0 && <span className="font-mono text-xs">{repostCount}</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => repost.mutate(!reposted)}><Repeat2 /> {reposted ? "Batalkan repost" : "Repost"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuoting(true)}><Quote /> Kutip</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Action label="Repost" count={repostCount} onClick={needLogin}><Repeat2 className="size-4" /></Action>
            )}

            <Action label={liked ? "Batal suka" : "Suka"} count={likeCount} active={liked} activeClass="text-rose-500"
              onClick={() => (user ? like.mutate(!liked) : needLogin())}>
              <Heart className={cn("size-4", liked && "fill-current")} />
            </Action>
            <Action label={bookmarked ? "Hapus dari tersimpan" : "Simpan"} active={bookmarked} activeClass="text-primary"
              onClick={() => (user ? mark.mutate(!bookmarked) : needLogin())}>
              <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
            </Action>
            <Action label="Bagikan" onClick={share}><Share className="size-4" /></Action>
          </div>
        </div>
      </div>

      <Dialog open={quoting} onOpenChange={setQuoting}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Kutip post</DialogTitle></DialogHeader>
          <Composer kind="quote" refPost={shown} autoFocus placeholder="Tambahkan komentarmu…" onPosted={() => setQuoting(false)} />
        </DialogContent>
      </Dialog>
      {canModerate && <ReportDialog postId={shown.id} open={reporting} onOpenChange={setReporting} />}
    </article>
  );
}
