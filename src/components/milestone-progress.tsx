import { milestoneProgress, milestoneTone, type MilestoneTone } from "@/lib/job-milestones";
import { MILESTONE_STATUS_LABEL, type MilestoneStatus } from "@/lib/work";
import { rp } from "@/lib/work-db";
import { cn } from "@/lib/utils";

type Item = { id?: string; title?: string; amount: number; status: MilestoneStatus };

const SEGMENT: Record<MilestoneTone, string> = {
  done: "bg-emerald-500",
  active: "bg-primary",
  bad: "bg-destructive",
  todo: "bg-muted-foreground/25",
};

/**
 * Progres milestone sebuah kontrak: satu segmen per milestone (hijau = selesai, oranye = sedang berjalan, abu-abu = belum),
 * ditambah ringkasan "x dari y selesai" dan persen dari nilai rupiah yang sudah disetujui. `bare` = tanpa kartu pembungkus.
 */
export function MilestoneProgress({ milestones, bare = false, className }: { milestones: Item[]; bare?: boolean; className?: string }) {
  const live = milestones.filter((m) => m.status !== "cancelled");
  if (live.length === 0) return null;
  const p = milestoneProgress(live);
  const current = live.find((m) => milestoneTone(m.status) !== "done");
  return (
    <div className={cn(!bare && "rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {!bare && <p className="text-sm font-bold">Progres milestone</p>}
        <p className="text-sm"><b>{p.done}</b> dari {p.total} milestone selesai · <b className="text-primary">{p.percent}%</b></p>
      </div>
      <div role="progressbar" aria-label="Progres milestone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} className="mt-2.5 flex gap-1">
        {live.map((m, i) => (
          <div
            key={m.id ?? i}
            title={`${m.title || `Milestone ${i + 1}`}: ${MILESTONE_STATUS_LABEL[m.status]}`}
            className={cn("h-2.5 flex-1 rounded-full", SEGMENT[milestoneTone(m.status)])}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {p.complete
          ? "Semua milestone sudah disetujui."
          : current
            ? <>Sekarang: <b className="text-foreground">{current.title || "Milestone berikutnya"}</b> · {MILESTONE_STATUS_LABEL[current.status]}</>
            : null}
        {p.totalAmount > 0 ? <> · {rp(p.doneAmount)} dari {rp(p.totalAmount)} disetujui</> : null}
      </p>
    </div>
  );
}
