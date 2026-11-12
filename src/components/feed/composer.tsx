import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { MAX_POST_LENGTH, createPost, type FeedPostBase } from "@/lib/feed";
import { createPoll } from "@/lib/feed-extras";
import { POLL_DURATIONS, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, cleanPollOptions, validatePoll } from "@/lib/feed-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type PollDraft = { options: string[]; hours: number };
const NEW_POLL: PollDraft = { options: ["", ""], hours: 24 };

export function Composer({ kind, parentId, refPost, placeholder, submitLabel, autoFocus, onPosted }: Props) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const left = MAX_POST_LENGTH - body.length;
  const empty = body.trim().length === 0;
  const pollError = poll ? validatePoll(body, poll.options, poll.hours, MAX_POST_LENGTH) : null;
  const canSend = poll ? !pollError : !empty && left >= 0;

  const send = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Masuk dulu.");
      if (poll) {
        await createPoll({ body, options: cleanPollOptions(poll.options), hours: poll.hours });
        return;
      }
      const input: Parameters<typeof createPost>[1] = { kind, body };
      if (parentId) input.parentId = parentId;
      if (refPost) input.refId = refPost.id;
      await createPost(user.id, input);
    },
    onSuccess: async () => {
      const wasPoll = !!poll;
      setBody("");
      setPoll(null);
      toast.success(wasPoll ? "Polling terkirim" : kind === "reply" ? "Balasan terkirim" : kind === "quote" ? "Kutipan terkirim" : "Post terkirim");
      await Promise.all(["feed", "feed-post", "feed-replies"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onPosted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user || !profile) return <SignInCta text={kind === "reply" ? "Masuk untuk membalas." : "Masuk untuk ikut berdiskusi."} />;

  const submit = () => { if (canSend && !send.isPending) send.mutate(); };
  const setOption = (i: number, value: string) => setPoll((p) => (p ? { ...p, options: p.options.map((o, j) => (j === i ? value : o)) } : p));

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-3 rounded-lg border border-border bg-card p-4">
      <AvatarMini name={profile.username} url={profile.avatar_url} size={36} />
      <div className="min-w-0 flex-1">
        <Textarea
          value={body}
          autoFocus={autoFocus}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={poll ? "Tulis pertanyaan polling…" : (placeholder ?? "Apa yang sedang kamu kerjakan? Pakai #hashtag, @mention, dan ``` untuk kode.")}
          rows={kind === "post" ? 3 : 2}
          className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          aria-label={poll ? "Pertanyaan polling" : "Isi post"}
        />
        {refPost && <div className="mt-2"><QuotedPost post={refPost} /></div>}

        {poll && (
          <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
            {poll.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={o}
                  maxLength={POLL_OPTION_MAX}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Pilihan ${i + 1}`}
                  aria-label={`Pilihan ${i + 1}`}
                  className="h-9"
                />
                {poll.options.length > POLL_MIN_OPTIONS && (
                  <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Hapus pilihan ${i + 1}`}
                    onClick={() => setPoll((p) => (p ? { ...p, options: p.options.filter((_, j) => j !== i) } : p))}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {poll.options.length < POLL_MAX_OPTIONS && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPoll((p) => (p ? { ...p, options: [...p.options, ""] } : p))}>
                <Plus /> Tambah pilihan
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Durasi polling">
              <span className="mr-1 text-xs text-muted-foreground">Berlaku</span>
              {POLL_DURATIONS.map((d) => (
                <button
                  key={d.hours}
                  type="button"
                  aria-pressed={poll.hours === d.hours}
                  onClick={() => setPoll((p) => (p ? { ...p, hours: d.hours } : p))}
                  className={cn("rounded-full border border-border px-2.5 py-1 text-xs transition", poll.hours === d.hours ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-3">
          {kind === "post" && (
            <Button
              type="button"
              size="sm"
              variant={poll ? "secondary" : "ghost"}
              className="mr-auto"
              aria-pressed={!!poll}
              onClick={() => setPoll(poll ? null : NEW_POLL)}
            >
              <BarChart3 /> Polling
            </Button>
          )}
          <span className={cn("font-mono text-xs text-muted-foreground", left < 20 && "text-amber-500", left < 0 && "text-destructive")} aria-live="polite">{left}</span>
          <Button type="submit" size="sm" disabled={!canSend || send.isPending} title={pollError ?? undefined}>
            {send.isPending ? "Mengirim…" : (submitLabel ?? (kind === "reply" ? "Balas" : kind === "quote" ? "Kutip" : "Posting"))}
          </Button>
        </div>
      </div>
    </form>
  );
}
