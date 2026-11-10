import { cn } from "@/lib/utils";

/** GitHub-style yearly activity grid built from commit timestamps. */
export function ContributionGraph({ dates }: { dates: string[] }) {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = d.slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - start.getDay());
  const weeks: { date: string; n: number }[][] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) weeks.push([]);
    const k = d.toISOString().slice(0, 10);
    weeks[weeks.length - 1]?.push({ date: k, n: counts.get(k) ?? 0 });
  }
  const level = (n: number) => (n === 0 ? "bg-muted" : n < 2 ? "bg-primary/30" : n < 4 ? "bg-primary/55" : n < 7 ? "bg-primary/80" : "bg-primary");
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm">{dates.length} kontribusi dalam setahun terakhir</p>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((c) => <div key={c.date} title={`${c.n} commit pada ${c.date}`} className={cn("size-[10px] rounded-[2px]", level(c.n))} />)}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        Sedikit {[0, 1, 3, 5, 8].map((n) => <span key={n} className={cn("size-[10px] rounded-[2px]", level(n))} />)} Banyak
      </div>
    </div>
  );
}
