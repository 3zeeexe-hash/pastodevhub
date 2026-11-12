import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_LABEL, DEMO_NOTICE } from "@/lib/demo-profiles";

/** Small label shown on every sample profile. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title={DEMO_NOTICE}
      className={cn("inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground", className)}
    >
      <FlaskConical className="size-3" aria-hidden />
      {DEMO_LABEL}
    </span>
  );
}
