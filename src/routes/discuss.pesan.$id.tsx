import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { deleteMessage, fetchMessages, fetchPartner, markConversationRead, sendMessage } from "@/lib/dm";
import { MAX_DM_LENGTH, dmBodyError } from "@/lib/feed-rules";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/discuss/pesan/$id")({
  head: () => ({ meta: [{ title: "Percakapan — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const partner = useQuery({ queryKey: ["dm-partner", id], queryFn: () => fetchPartner(id, user!.id), enabled: !!user });
  const messages = useQuery({ queryKey: ["dm-messages", id], queryFn: () => fetchMessages(id), enabled: !!user, refetchInterval: 8_000 });

  const lastId = messages.data?.[messages.data.length - 1]?.id;
  // Tandai sudah dibaca setiap kali ada pesan terbaru yang tampil.
  useEffect(() => {
    if (!user || !lastId) return;
    markConversationRead(user.id, id)
      .then(() => Promise.all([qc.invalidateQueries({ queryKey: ["dm-unread"] }), qc.invalidateQueries({ queryKey: ["dm-inbox"] })]))
      .catch(() => {});
  }, [user, id, lastId, qc]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId]);

  const send = useMutation({
    mutationFn: () => sendMessage(user!.id, id, body),
    onSuccess: async () => { setBody(""); await qc.invalidateQueries({ queryKey: ["dm-messages", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (mid: string) => deleteMessage(mid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dm-messages", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <main className="mx-auto max-w-2xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-2xl px-4 py-8"><SignInCta text="Masuk untuk membaca pesanmu." /></main>;

  const err = dmBodyError(body);
  const submit = () => { if (!err && !send.isPending) send.mutate(); };
  const p = partner.data;
  const failed = messages.error ?? partner.error;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 py-6">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Link to="/discuss/pesan" search={{}} aria-label="Kembali ke daftar pesan" className="rounded-md p-2 text-muted-foreground hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        {p ? (
          <Link to="/$username" params={{ username: p.username }} className="flex min-w-0 items-center gap-3">
            <AvatarMini name={p.username} url={p.avatar_url} size={36} />
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{p.display_name || p.username}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">@{p.username}</p>
            </div>
          </Link>
        ) : (
          <p className="text-muted-foreground">{partner.isLoading ? "Memuat…" : "Percakapan"}</p>
        )}
      </div>

      <div className="min-h-[50vh] flex-1 space-y-2 py-4" aria-live="polite">
        {failed ? (
          <p role="alert" className="text-center text-sm text-destructive">{failed.message}</p>
        ) : messages.isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Memuat…</p>
        ) : !messages.data?.length ? (
          <p className="text-center text-sm text-muted-foreground">Belum ada pesan. Mulai percakapan di bawah.</p>
        ) : (
          messages.data.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start")}>
                {mine && (
                  <button type="button" aria-label="Hapus pesan" onClick={() => { if (confirm("Hapus pesan ini untuk kedua pihak?")) del.mutate(m.id); }}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
                    <Trash2 className="size-4" />
                  </button>
                )}
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary")}>
                  {/* Teks biasa: whitespace-pre-wrap menjaga baris baru, React meng-escape isinya. */}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{timeAgo(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="sticky bottom-0 flex items-end gap-2 border-t border-border bg-background pt-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={2}
          maxLength={MAX_DM_LENGTH}
          placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)"
          aria-label="Isi pesan"
          className="resize-none"
        />
        <Button type="submit" size="icon" disabled={!!err || send.isPending} aria-label="Kirim pesan"><Send /></Button>
      </form>
    </main>
  );
}
