import { CircleDot, CircleCheck, GitMerge, GitPullRequest, GitPullRequestClosed } from "lucide-react";
import { cn } from "@/lib/utils";

export function StateBadge({ state, kind }: { state: string; kind: "issue" | "pr" }) {
  const map = {
    issue: { open: ["Open", CircleDot, "bg-success text-success-foreground"], closed: ["Closed", CircleCheck, "bg-merged text-merged-foreground"] },
    pr: { open: ["Open", GitPullRequest, "bg-success text-success-foreground"], closed: ["Closed", GitPullRequestClosed, "bg-destructive text-destructive-foreground"], merged: ["Merged", GitMerge, "bg-merged text-merged-foreground"] },
  } as const;
  const entry = (map[kind] as Record<string, readonly [string, typeof CircleDot, string]>)[state] ?? map.issue.open;
  const [label, Icon, cls] = entry;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium", cls)}><Icon className="size-4" />{label}</span>;
}

export function StateIcon({ state, kind }: { state: string; kind: "issue" | "pr" }) {
  if (kind === "issue") return state === "open" ? <CircleDot className="size-4 shrink-0 text-success" /> : <CircleCheck className="size-4 shrink-0 text-merged" />;
  if (state === "merged") return <GitMerge className="size-4 shrink-0 text-merged" />;
  if (state === "closed") return <GitPullRequestClosed className="size-4 shrink-0 text-destructive" />;
  return <GitPullRequest className="size-4 shrink-0 text-success" />;
}
