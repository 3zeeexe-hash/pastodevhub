// Panel percakapan "Pesanan" di halaman Pesan: chat satu pesanan (karya/jasa) antara pembeli dan penjual, tampilan sama dengan DM.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_HEAD_SELECT } from "@/lib/inbox-data";
import type { OrderStatus } from "@/lib/market";
import { AvatarMini } from "@/components/avatar-mini";
import { ChatBackdrop, ChatHeader, ChatNotice, Composer, MessageList, chatBackClass, type ChatMessage } from "@/components/chat-ui";
import { OrderStatusBadge } from "@/components/order-status";
import { useChatAttachment } from "@/components/chat-attachment";

const MAX_ORDER_MESSAGE = 4000;

type Person = { username: string; display_name: string | null; avatar_url: string | null } | null;
type Head = { id: string; number: string | number | null; title: string; status: string; buyer_id: string; seller_id: string; buyer: Person; seller: Person };

export function OrderChatPane({ orderId, userId }: { orderId: string; userId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const attachment = useChatAttachment();
  const endRef = useRef<HTMLDivElement>(null);

  // Kunci diawali ["order", id] supaya ikut tersegarkan saat halaman pesanan memanggil refresh().
  const head = useQuery({
    queryKey: ["order", orderId, "head"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_HEAD_SELECT).eq("id", orderId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as Head | null) ?? null;
    },
  });
  const messages = useQuery({
    queryKey: ["order-pane-messages", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages")
        .select("id,body,image_url,created_at,sender_id")
        .eq("order_id", orderId)
        .eq("is_system", false)
        .order("created_at")
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ChatMessage[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`order-pane-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["order-pane-messages", orderId] });
        void qc.invalidateQueries({ queryKey: ["order-convs"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [orderId, qc]);

  const lastId = messages.data?.[messages.data.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId, orderId]);

  const h = head.data;
  const other = h ? (h.buyer_id === userId ? h.seller : h.buyer) : null;
  const otherName = other?.display_name || other?.username || "Pesanan";
  const closed = h?.status === "cancelled" || h?.status === "declined";

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_messages").insert({ order_id: orderId, sender_id: userId, body: body.trim().slice(0, MAX_ORDER_MESSAGE), image_url: attachment.image });
      if (error) throw new Error("Pesan gagal dikirim.");
    },
    onSuccess: async () => {
      setBody("");
      attachment.clear();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["order-pane-messages", orderId] }),
        qc.invalidateQueries({ queryKey: ["order-convs"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ChatHeader
        back={<Link to="/gobifeed/pesan" search={{ filter: "pesanan" }} aria-label="Kembali ke daftar percakapan" className={chatBackClass}><ArrowLeft className="size-5" /></Link>}
        avatar={<AvatarMini name={other?.username ?? "?"} url={other?.avatar_url} size={42} />}
        title={head.isLoading ? "Memuat…" : otherName}
        subtitle={
          h ? (
            <Link to="/pesanan/$id" params={{ id: h.id }} className="hover:text-primary hover:underline">
              {h.number ? `Pesanan #${h.number} · ` : "Pesanan · "}{h.title}
            </Link>
          ) : head.isLoading ? undefined : "Pesanan tidak ditemukan"
        }
        right={h ? <OrderStatusBadge status={h.status as OrderStatus} /> : undefined}
      />

      <ChatBackdrop className="min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-[6%]">
        <div aria-live="polite">
          {messages.error ? (
            <ChatNotice tone="error">{messages.error.message}</ChatNotice>
          ) : messages.isLoading ? (
            <ChatNotice>Memuat…</ChatNotice>
          ) : !messages.data?.length ? (
            <ChatNotice>Belum ada pesan. Sapa lawan bicara untuk membahas pesanan ini.</ChatNotice>
          ) : (
            <MessageList messages={messages.data} userId={userId} endRef={endRef} />
          )}
        </div>
      </ChatBackdrop>

      {closed ? (
        <p className="flex items-center justify-center gap-2 border-t border-border bg-card px-3 py-3.5 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden /> Pesanan ini sudah ditutup, pesan baru tidak bisa dikirim.</p>
      ) : (
        <Composer value={body} onChange={setBody} onSend={() => send.mutate()} pending={send.isPending} disabled={!body.trim() && !attachment.image} maxLength={MAX_ORDER_MESSAGE} attachment={attachment} />
      )}
    </div>
  );
}
