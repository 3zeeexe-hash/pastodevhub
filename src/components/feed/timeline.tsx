import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchFeed, type FeedQuery } from "@/lib/feed";
import { dedupeById } from "@/lib/feed-rules";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/feed/post-card";

/**
 * Daftar post dengan tombol "Muat lagi" (kursor berdasarkan waktu).
 * variant="card" menampilkan tiap post sebagai kartu bulat (halaman Diskusi); bawaannya daftar berbatas garis.
 */
export function Timeline({ query, empty, variant = "plain" }: { query: FeedQuery; empty: ReactNode; variant?: "plain" | "card" }) {
  const { user } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ["feed", query, user?.id ?? null],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchFeed(query, user?.id, pageParam),
    getNextPageParam: (last) => last.next ?? undefined,
  });

  if (q.isLoading) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat…</p>;
  if (q.isError) {
    return (
      <div className="px-4 py-10 text-center text-sm">
        <p className="text-destructive">Gagal memuat: {(q.error as Error).message}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => q.refetch()}>Coba lagi</Button>
      </div>
    );
  }
  // Halaman berperingkat ("Untuk Kamu", "Tren") bisa bergeser di antara dua muatan, jadi buang post kembar.
  const items = dedupeById(q.data?.pages.flatMap((p) => p.items) ?? []);
  if (!items.length) return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</div>;

  const more = q.hasNextPage && (
    <div className="p-4 text-center">
      <Button variant="secondary" size="sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
        {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
      </Button>
    </div>
  );

  if (variant === "card") {
    return (
      <div className="space-y-3 px-3 pb-6 pt-1 sm:px-4">
        {items.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-primary/40">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-transparent" />
            <div className="relative [&>article]:border-b-0"><PostCard post={p} /></div>
          </div>
        ))}
        {more}
      </div>
    );
  }

  return (
    <div>
      {items.map((p) => <PostCard key={p.id} post={p} />)}
      {more}
    </div>
  );
}
