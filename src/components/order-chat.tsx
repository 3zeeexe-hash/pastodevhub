import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarMini } from "@/components/avatar-mini";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string; body: string; is_system: boolean; created_at: string; sender_id: string;
  sender: { username: string; avatar_url: string | null } | null;
};

/** Chat satu pesanan (client, developer, admin). Dipasang di dalam panel ChatDock, jadi hanya aktif saat panel dibuka. */
export function OrderChat({ orderId, userId }: { orderId: string; userId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // Kunci diawali ["order", id] supaya ikut tersegarkan saat halaman pesanan memanggil refresh().
  const status = useQuery({
    queryKey: ["order", orderId, "status"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
      return (data?.status as string | undefined) ?? null;
    },
  });
  const closed = status.data === "cancelled" || status.data === "declined";

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ["order-messages", orderId],
    queryFn: async () => (await supabase.from("order_messages").select("id,body,is_system,created_at,sender_id, sender:profiles(username,avatar_url)").eq("order_id", orderId).order("created_at").limit(500)).data ?? [],
  });

  useEffect(() => {
    const ch = supabase
      .channel(`order-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` }, () => {
        qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
        qc.invalidateQueries({ queryKey: ["order", orderId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, qc]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { error } = await supabase.from("order_messages").insert({ order_id: orderId, sender_id: userId, body: body.slice(0, 4000) });
    if (error) { toast.error(error.message); setText(body); } else qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
  }

  const list = msgs as unknown as ChatMessage[];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Memuat…</p>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Belum ada pesan. Sapa lawan bicara untuk memulai.</p>
        ) : list.map((m) => m.is_system ? (
          <p key={m.id} className="text-center text-xs text-muted-foreground">{m.body} · {timeAgo(m.created_at)}</p>
        ) : (
          <div key={m.id} className={cn("flex gap-2", m.sender_id === userId && "flex-row-reverse")}>
            <AvatarMini name={m.sender?.username ?? "?"} url={m.sender?.avatar_url} size={26} />
            <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.sender_id === userId ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{timeAgo(m.created_at)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <Input aria-label="Tulis pesan" value={text} onChange={(e) => setText(e.target.value)} placeholder={closed ? "Pesanan ditutup" : "Tulis pesan…"} disabled={closed} maxLength={4000} />
        <Button size="icon" aria-label="Kirim" disabled={closed || !text.trim()}><Send /></Button>
      </form>
    </div>
  );
}
