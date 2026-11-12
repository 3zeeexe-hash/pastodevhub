import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { votePoll, type PollData } from "@/lib/feed-extras";
import { isPollOpen, pollPercents, pollTimeLeft } from "@/lib/feed-rules";
import { cn } from "@/lib/utils";

const INVALIDATE = ["feed", "feed-post", "feed-replies"];

/** Polling di dalam post: tombol pilihan sebelum memilih, batang hasil sesudah memilih, saat berakhir, atau untuk tamu. */
export function PollView({ postId, poll }: { postId: string; poll: PollData }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const open = isPollOpen(poll.endsAt);
  const canVote = !!user && open && poll.myVote === null;

  const vote = useMutation({
    mutationFn: (idx: number) => votePoll(user!.id, postId, idx),
    onSuccess: async () => {
      toast.success("Suaramu tercatat");
      await Promise.all(INVALIDATE.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const percents = pollPercents(poll.counts);
  const top = Math.max(0, ...poll.counts);

  return (
    <div className="mt-2 space-y-2" role="group" aria-label="Polling">
      {poll.options.map((label, i) =>
        canVote ? (
          <button
            key={i}
            type="button"
            disabled={vote.isPending}
            onClick={() => vote.mutate(i)}
            className="block w-full rounded-md border border-primary/50 px-3 py-2 text-left text-sm font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
          >
            {label}
          </button>
        ) : (
          <div key={i} className="relative overflow-hidden rounded-md border border-border px-3 py-2 text-sm">
            <div
              className={cn("absolute inset-y-0 left-0", poll.counts[i] === top && top > 0 ? "bg-primary/25" : "bg-secondary")}
              style={{ width: `${percents[i] ?? 0}%` }}
              aria-hidden
            />
            <div className="relative flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {poll.myVote === i && <Check className="size-4 shrink-0 text-primary" aria-label="Pilihanmu" />}
              <span className="shrink-0 font-mono text-xs">{percents[i] ?? 0}%</span>
            </div>
          </div>
        ),
      )}
      <p className="text-xs text-muted-foreground">
        {poll.total} suara · {pollTimeLeft(poll.endsAt)}
        {!user && open ? " · Masuk untuk memilih" : ""}
      </p>
    </div>
  );
}
