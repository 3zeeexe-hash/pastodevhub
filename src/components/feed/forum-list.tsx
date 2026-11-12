import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";

type ForumRow = {
  id: string; title: string; body: string; created_at: string;
  author: { username: string; avatar_url: string | null } | null;
  comments: { count: number }[];
};

const PAGE = 20;

/** Forum bertopik (judul + isi + komentar) yang sudah ada sebelum Linimasa. Dimuat bertahap supaya tetap cepat saat thread makin banyak. */
export function ForumList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const list = useInfiniteQuery({
    queryKey: ["posts", "all"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ForumRow[]> => {
      const { data, error } = await supabase.from("posts").select("id,title,body,created_at, author:profiles(username,avatar_url), comments(count)")
        .order("created_at", { ascending: false }).range(pageParam, pageParam + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ForumRow[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("posts").insert({ author_id: user!.id, title: title.trim(), body: body.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setTitle(""); setBody("");
      toast.success("Diskusi terkirim");
      await qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = list.data?.pages.flat() ?? [];
  return (
    <div className="px-4 py-6">
      {user ? (
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim() && !create.isPending) create.mutate(); }} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Input placeholder="Judul diskusi" aria-label="Judul diskusi" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
          <Textarea placeholder="Tulis pertanyaan atau ide kamu…" aria-label="Isi diskusi" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          <Button disabled={!title.trim() || create.isPending}>{create.isPending ? "Mengirim…" : "Posting"}</Button>
        </form>
      ) : <SignInCta text="Masuk untuk memulai diskusi." />}

      {list.isError ? (
        <div className="mt-8 text-center text-sm">
          <p className="text-destructive">Gagal memuat forum: {(list.error as Error).message}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => list.refetch()}>Coba lagi</Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border">
          {list.isLoading && <li className="py-8 text-center text-sm text-muted-foreground">Memuat…</li>}
          {rows.map((p) => (
            <li key={p.id}>
              <Link to="/discuss/$id" params={{ id: p.id }} className="flex gap-3 py-4 hover:opacity-90">
                <AvatarMini name={p.author?.username ?? "?"} url={p.author?.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.body}</p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">{p.author ? `@${p.author.username}` : "Pengguna dihapus"} · {timeAgo(p.created_at)} <span className="flex items-center gap-1"><MessageSquare className="size-3" /> {p.comments[0]?.count ?? 0}</span></p>
                </div>
              </Link>
            </li>
          ))}
          {!list.isLoading && rows.length === 0 && <li className="py-8 text-center text-muted-foreground">Belum ada diskusi. Mulai yang pertama!</li>}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="p-4 text-center">
          <Button variant="secondary" size="sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
          </Button>
        </div>
      )}
    </div>
  );
}
