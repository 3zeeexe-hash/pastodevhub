import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchFeed, type FeedQuery } from "@/lib/feed";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/feed/post-card";

/** Daftar post dengan tombol "Muat lagi" (kursor berdasarkan waktu). */
export function Timeline({ query, empty }: { query: FeedQuery; empty: ReactNode }) {
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
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (!items.length) return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div>
      {items.map((p) => <PostCard key={p.id} post={p} />)}
      {q.hasNextPage && (
        <div className="p-4 text-center">
          <Button variant="secondary" size="sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
          </Button>
        </div>
      )}
    </div>
  );
}
