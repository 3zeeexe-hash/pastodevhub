import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";

export const Route = createFileRoute("/discuss/$id")({
  head: () => ({ meta: [{ title: "Diskusi — Pastodev" }, { name: "description", content: "Baca dan balas diskusi di Pastodev." }, { property: "og:title", content: "Diskusi — Pastodev" }, { property: "og:description", content: "Baca dan balas diskusi di Pastodev." }] }),
  component: PostPage,
});

function PostPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      const [p, c] = await Promise.all([
        supabase.from("posts").select("*, author:profiles(username,avatar_url)").eq("id", id).maybeSingle(),
        supabase.from("comments").select("*, author:profiles(username,avatar_url)").eq("post_id", id).order("created_at"),
      ]);
      return p.data ? { post: p.data as any, comments: (c.data ?? []) as any[] } : null;
    },
  });
  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!data) return <main className="mx-auto max-w-3xl px-4 py-12">Diskusi tidak ditemukan.</main>;
  const { post, comments } = data;
  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("comments").insert({ post_id: id, author_id: user!.id, body });
    if (error) { toast.error(error.message); return; }
    setBody(""); qc.invalidateQueries({ queryKey: ["post", id] });
  }
  async function delPost() {
    if (!confirm("Hapus diskusi ini?")) return;
    await supabase.from("posts").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["posts"] });
    navigate({ to: "/discuss" });
  }
  async function delComment(cid: string) {
    await supabase.from("comments").delete().eq("id", cid);
    qc.invalidateQueries({ queryKey: ["post", id] });
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/discuss" className="text-sm text-muted-foreground hover:text-primary">← Semua diskusi</Link>
      <h1 className="mt-3 text-3xl font-bold">{post.title}</h1>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <AvatarMini name={post.author.username} url={post.author.avatar_url} size={22} />
        <Link to="/$username" params={{ username: post.author.username }} className="hover:text-primary">@{post.author.username}</Link> · {timeAgo(post.created_at)}
        {user?.id === post.author_id && <button onClick={delPost} className="ml-auto text-destructive">Hapus</button>}
      </div>
      <p className="mt-6 whitespace-pre-wrap leading-relaxed">{post.body}</p>
      <h2 className="mt-10 font-mono text-sm uppercase tracking-wider text-muted-foreground">{comments.length} komentar</h2>
      <ul className="mt-4 space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AvatarMini name={c.author.username} url={c.author.avatar_url} size={22} />
              <Link to="/$username" params={{ username: c.author.username }} className="hover:text-primary">@{c.author.username}</Link> · {timeAgo(c.created_at)}
              {user?.id === c.author_id && <button onClick={() => delComment(c.id)} className="ml-auto text-xs text-destructive">Hapus</button>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {user ? (
          <form onSubmit={reply} className="space-y-3">
            <Textarea placeholder="Tulis komentar…" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={3000} />
            <Button>Kirim komentar</Button>
          </form>
        ) : <SignInCta text="Masuk untuk berkomentar." />}
      </div>
    </main>
  );
}
