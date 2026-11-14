// Panel percakapan tab "Kerja" di /discuss/pesan: obrolan satu lamaran antara client dan pelamar, tampilan sama dengan DM.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { looseDb } from "@/lib/escrow-db";
import type { WorkConversation } from "@/lib/work-chat";
import { AvatarMini } from "@/components/avatar-mini";
import { ChatBackdrop, ChatNotice, Composer, MessageList, type ChatMessage } from "@/components/chat-ui";
import { ReportButton } from "@/components/work-ui";

const MAX_WORK_MESSAGE = 4000;

export function WorkChatPane({ applicationId, userId, conv }: { applicationId: string; userId: string; conv?: WorkConversation | undefined }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["wa-job-messages", applicationId],
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase.from("job_messages").select("id,body,created_at,sender_id").eq("application_id", applicationId).order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as ChatMessage[];
    },
  });

  const lastId = messages.data?.[messages.data.length - 1]?.id;
  // Tandai pesan lawan bicara sebagai dibaca setiap ada pesan terbaru yang tampil (hanya kedua pihak yang diizinkan database).
  useEffect(() => {
    looseDb.rpc("work_mark_thread_read", { _application_id: applicationId }).then(
      () => qc.invalidateQueries({ queryKey: ["work-convs-v2"] }),
      () => undefined,
    );
  }, [applicationId, lastId, qc]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId, applicationId]);

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("job_messages").insert({ application_id: applicationId, sender_id: userId, body: body.trim().slice(0, MAX_WORK_MESSAGE) });
      if (error) throw new Error("Pesan gagal dikirim.");
    },
    onSuccess: async () => {
      setBody("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wa-job-messages", applicationId] }),
        qc.invalidateQueries({ queryKey: ["work-convs-v2"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2 sm:px-3">
        <Link to="/discuss/pesan" search={{ tab: "kerja" }} aria-label="Kembali ke daftar percakapan kerja" className="rounded-full p-2 text-[#54656f] hover:bg-black/5 md:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <AvatarMini name={conv?.otherName ?? "?"} url={conv?.otherAvatar} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight text-[#111b21]">{conv?.otherName ?? "Percakapan kerja"}</p>
          {conv?.jobId ? (
            <Link to="/lowongan/$id" params={{ id: conv.jobId }} className="block truncate text-xs text-[#667781] hover:text-[#00a884]">{conv.jobTitle}</Link>
          ) : (
            <p className="truncate text-xs text-[#667781]">{conv?.jobTitle ?? "Memuat…"}</p>
          )}
        </div>
        <ReportButton targetType="conversation" targetId={applicationId} label="Laporkan percakapan" />
      </header>

      <ChatBackdrop className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-[6%]">
        <div aria-live="polite">
          {messages.error ? (
            <ChatNotice tone="error">{messages.error.message}</ChatNotice>
          ) : messages.isLoading ? (
            <ChatNotice>Memuat…</ChatNotice>
          ) : !messages.data?.length ? (
            <ChatNotice>Belum ada pesan. Mulai obrolan untuk membahas detail pekerjaan.</ChatNotice>
          ) : (
            <MessageList messages={messages.data} userId={userId} endRef={endRef} />
          )}
        </div>
      </ChatBackdrop>

      <Composer value={body} onChange={setBody} onSend={() => send.mutate()} pending={send.isPending} disabled={!body.trim()} maxLength={MAX_WORK_MESSAGE} />
    </div>
  );
}
