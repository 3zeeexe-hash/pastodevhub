import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchPost, fetchReplies } from "@/lib/feed";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { getSeoInfo } from "@/lib/seo.functions";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/gobifeed/status/$id")({
  // Judul, deskripsi, dan data terstruktur post diambil dari database; teks di bawah hanya cadangan.
  loader: ({ params }) => getSeoInfo({ data: { kind: "feed", id: params.id } }),
  staleTime: 300_000,
  head: ({ loaderData }) => seoHead(loaderData, { title: "Post — GobiFeed | GoBi", description: "Baca dan balas post developer Indonesia di GobiFeed." }),
  component: StatusPage,
});

function StatusPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const post = useQuery({ queryKey: ["feed-post", id, user?.id ?? null], queryFn: () => fetchPost(id, user?.id) });
  const parentId = post.data?.kind === "reply" ? post.data.parent_id : null;
  const parent = useQuery({
    queryKey: ["feed-post", parentId, user?.id ?? null],
    queryFn: () => fetchPost(parentId as string, user?.id),
    enabled: !!parentId,
  });
  const replies = useQuery({ queryKey: ["feed-replies", id, user?.id ?? null], queryFn: () => fetchReplies(id, user?.id) });

  return (
    <main className="mx-auto max-w-2xl border-x border-border">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/gobifeed" aria-label="Kembali ke GobiFeed" className="rounded-md p-1.5 hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-bold">Post</h1>
      </div>

      {post.isLoading && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Memuat…</p>}
      {post.isError && <p className="px-4 py-10 text-center text-sm text-destructive">Gagal memuat: {(post.error as Error).message}</p>}
      {post.isSuccess && !post.data && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Post tidak ditemukan atau sudah dihapus.</p>}

      {post.data && (
        <>
          {parent.data && <PostCard post={parent.data} />}
          <PostCard post={post.data} detail />
          <div className="border-b border-border p-4">
            <Composer kind="reply" parentId={post.data.kind === "repost" && post.data.ref ? post.data.ref.id : post.data.id} placeholder="Tulis balasanmu…" />
          </div>
          {replies.data?.map((r) => <PostCard key={r.id} post={r} />)}
          {replies.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada balasan.</p>}
        </>
      )}
    </main>
  );
}
