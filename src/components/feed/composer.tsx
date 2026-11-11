import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { MAX_POST_LENGTH, createPost, type FeedPostBase } from "@/lib/feed";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { QuotedPost } from "@/components/feed/quoted-post";
import { cn } from "@/lib/utils";

type Props = {
  kind: "post" | "reply" | "quote";
  parentId?: string;
  refPost?: FeedPostBase;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onPosted?: () => void;
};

export function Composer({ kind, parentId, refPost, placeholder, submitLabel, autoFocus, onPosted }: Props) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const left = MAX_POST_LENGTH - body.length;
  const empty = body.trim().length === 0;

  const send = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Masuk dulu.");
      const input: Parameters<typeof createPost>[1] = { kind, body };
      if (parentId) input.parentId = parentId;
      if (refPost) input.refId = refPost.id;
      return createPost(user.id, input);
    },
    onSuccess: async () => {
      setBody("");
      toast.success(kind === "reply" ? "Balasan terkirim" : kind === "quote" ? "Kutipan terkirim" : "Post terkirim");
      await Promise.all(["feed", "feed-post", "feed-replies"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onPosted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user || !profile) return <SignInCta text={kind === "reply" ? "Masuk untuk membalas." : "Masuk untuk ikut berdiskusi."} />;

  const submit = () => { if (!empty && left >= 0 && !send.isPending) send.mutate(); };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-3 rounded-lg border border-border bg-card p-4">
      <AvatarMini name={profile.username} url={profile.avatar_url} size={36} />
      <div className="min-w-0 flex-1">
        <Textarea
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={placeholder ?? "Apa yang sedang kamu kerjakan? Pakai #hashtag, @mention, dan ``` untuk kode."}
          rows={kind === "post" ? 3 : 2}
          className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          aria-label="Isi post"
        />
        {refPost && <div className="mt-2"><QuotedPost post={refPost} /></div>}
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className={cn("font-mono text-xs text-muted-foreground", left < 20 && "text-amber-500", left < 0 && "text-destructive")} aria-live="polite">{left}</span>
          <Button type="submit" size="sm" disabled={empty || left < 0 || send.isPending}>
            {send.isPending ? "Mengirim…" : (submitLabel ?? (kind === "reply" ? "Balas" : kind === "quote" ? "Kutip" : "Posting"))}
          </Button>
        </div>
      </div>
    </form>
  );
}
