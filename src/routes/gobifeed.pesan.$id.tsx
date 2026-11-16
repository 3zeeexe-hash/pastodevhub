import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { deleteMessage, fetchMessages, fetchPartner, markConversationRead, sendMessage } from "@/lib/dm";
import { MAX_DM_LENGTH, dmBodyError } from "@/lib/feed-rules";
import { AvatarMini } from "@/components/avatar-mini";
import { ChatBackdrop, ChatHeader, ChatNotice, Composer, MessageList, chatBackClass } from "@/components/chat-ui";
import { useChatAttachment } from "@/components/chat-attachment";

export const Route = createFileRoute("/gobifeed/pesan/$id")({
  head: () => ({ meta: [{ title: "Percakapan — GoBi" }, { name: "robots", content: "noindex" }] }),
  component: ChatPage,
});

/** Panel kanan di /gobifeed/pesan (layout induk yang menangani masuk/keluar akun dan daftar percakapan). */
function ChatPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const attachment = useChatAttachment();
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
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId, id]);

  const send = useMutation({
    mutationFn: () => sendMessage(user!.id, id, body, attachment.image),
    onSuccess: async () => {
      setBody("");
      attachment.clear();
      await Promise.all([qc.invalidateQueries({ queryKey: ["dm-messages", id] }), qc.invalidateQueries({ queryKey: ["dm-inbox"] })]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (mid: string) => deleteMessage(mid),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ["dm-messages", id] }), qc.invalidateQueries({ queryKey: ["dm-inbox"] })]),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) return null;

  const err = dmBodyError(body, !!attachment.image);
  const p = partner.data;
  const failed = messages.error ?? partner.error;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ChatHeader
        back={<Link to="/gobifeed/pesan" search={{}} aria-label="Kembali ke daftar pesan" className={chatBackClass}><ArrowLeft className="size-5" /></Link>}
        avatar={
          p ? (
            <Link to="/$username" params={{ username: p.username }} aria-label={`Profil @${p.username}`} className="shrink-0"><AvatarMini name={p.username} url={p.avatar_url} size={42} /></Link>
          ) : (
            <AvatarMini name="?" url={null} size={42} />
          )
        }
        title={p ? <Link to="/$username" params={{ username: p.username }} className="hover:text-primary">{p.display_name || p.username}</Link> : partner.isLoading ? "Memuat…" : "Percakapan"}
        subtitle={p ? `@${p.username}` : undefined}
      />

      <ChatBackdrop className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-[6%]">
        <div aria-live="polite">
          {failed ? (
            <ChatNotice tone="error">{failed.message}</ChatNotice>
          ) : messages.isLoading ? (
            <ChatNotice>Memuat…</ChatNotice>
          ) : !messages.data?.length ? (
            <ChatNotice>Belum ada pesan. Mulai percakapan di bawah.</ChatNotice>
          ) : (
            <MessageList
              messages={messages.data}
              userId={user.id}
              endRef={endRef}
              onDelete={(mid) => { if (confirm("Hapus pesan ini untuk kedua pihak?")) del.mutate(mid); }}
            />
          )}
        </div>
      </ChatBackdrop>

      <Composer value={body} onChange={setBody} onSend={() => send.mutate()} pending={send.isPending} disabled={!!err} maxLength={MAX_DM_LENGTH} attachment={attachment} />
    </div>
  );
}
