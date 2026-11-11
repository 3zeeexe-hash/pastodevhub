import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Forum bertopik (judul + isi + komentar) yang sudah ada sebelum Linimasa. */
export function ForumList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { data } = useQuery({
    queryKey: ["posts", "all"],
    queryFn: async (): Promise<ForumRow[]> => ((await supabase.from("posts").select("id,title,body,created_at, author:profiles(username,avatar_url), comments(count)").order("created_at", { ascending: false })).data ?? []) as unknown as ForumRow[],
  });
  async function post(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("posts").insert({ author_id: user!.id, title, body });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setBody(""); qc.invalidateQueries({ queryKey: ["posts"] });
  }
  return (
    <div className="px-4 py-6">
      {user ? (
        <form onSubmit={post} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Input placeholder="Judul diskusi" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
          <Textarea placeholder="Tulis pertanyaan atau ide kamu…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          <Button>Posting</Button>
        </form>
      ) : <SignInCta text="Masuk untuk memulai diskusi." />}
      <ul className="mt-8 divide-y divide-border">
        {data?.map((p) => (
          <li key={p.id}>
            <Link to="/discuss/$id" params={{ id: p.id }} className="flex gap-3 py-4 hover:opacity-90">
              <AvatarMini name={p.author?.username ?? "?"} url={p.author?.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{p.body}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">@{p.author?.username} · {timeAgo(p.created_at)} <span className="flex items-center gap-1"><MessageSquare className="size-3" /> {p.comments[0]?.count ?? 0}</span></p>
              </div>
            </Link>
          </li>
        ))}
        {data?.length === 0 && <li className="py-8 text-center text-muted-foreground">Belum ada diskusi.</li>}
      </ul>
    </div>
  );
}
