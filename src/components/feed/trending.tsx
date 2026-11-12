import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { fetchTrendingTags } from "@/lib/feed-discover";

/** Tagar yang sedang ramai (paling banyak penulis berbeda dalam beberapa hari terakhir). */
export function TrendingTags({ hours = 72, limit = 10 }: { hours?: number; limit?: number }) {
  const q = useQuery({ queryKey: ["feed-trending-tags", hours, limit], queryFn: () => fetchTrendingTags(hours, limit), staleTime: 60_000 });

  return (
    <section aria-label="Tagar tren" className="border-b border-border">
      <h2 className="flex items-center gap-2 px-4 pt-4 text-sm font-semibold"><Flame className="size-4 text-primary" /> Tagar sedang tren</h2>
      {q.isLoading ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Memuat…</p>
      ) : q.data?.length ? (
        <ol className="mt-1 pb-2">
          {q.data.map((t, i) => (
            <li key={t.tag}>
              <Link to="/discuss/tag/$tag" params={{ tag: t.tag }} className="flex items-baseline gap-3 px-4 py-2 hover:bg-accent/40">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">#{t.tag}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t.posts} post · {t.authors} penulis</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">Belum ada tagar yang ramai. Pakai #hashtag di postinganmu supaya topiknya mudah ditemukan.</p>
      )}
    </section>
  );
}
