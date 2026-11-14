import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { deleteMessage, fetchMessages, fetchPartner, markConversationRead, sendMessage } from "@/lib/dm";
import { MAX_DM_LENGTH, dmBodyError } from "@/lib/feed-rules";
import { AvatarMini } from "@/components/avatar-mini";
import { ChatBackdrop, ChatNotice, Composer, MessageList } from "@/components/chat-ui";

export const Route = createFileRoute("/discuss/pesan/$id")({
  head: () => ({ meta: [{ title: "Percakapan — GOBI" }, { name: "robots", content: "noindex" }] }),
  component: ChatPage,
});

/** Panel kanan di /discuss/pesan (layout induk yang menangani masuk/keluar akun dan daftar percakapan). */
function ChatPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
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
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId, id]);

  const send = useMutation({
    mutationFn: () => sendMessage(user!.id, id, body),
    onSuccess: async () => {
      setBody("");
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

  const err = dmBodyError(body);
  const p = partner.data;
  const failed = messages.error ?? partner.error;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2 sm:px-3">
        <Link to="/discuss/pesan" search={{}} aria-label="Kembali ke daftar pesan" className="rounded-full p-2 text-[#54656f] hover:bg-black/5 md:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        {p ? (
          <Link to="/$username" params={{ username: p.username }} className="flex min-w-0 flex-1 items-center gap-3">
            <AvatarMini name={p.username} url={p.avatar_url} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight text-[#111b21]">{p.display_name || p.username}</p>
              <p className="truncate text-xs text-[#667781]">@{p.username}</p>
            </div>
          </Link>
        ) : (
          <p className="flex-1 px-1 text-[#667781]">{partner.isLoading ? "Memuat…" : "Percakapan"}</p>
        )}
      </header>

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

      <Composer value={body} onChange={setBody} onSend={() => send.mutate()} pending={send.isPending} disabled={!!err} maxLength={MAX_DM_LENGTH} />
    </div>
  );
}
