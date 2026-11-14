// Potongan UI obrolan bergaya WhatsApp yang dipakai tab "Pesan" (DM) dan tab "Kerja" di /discuss/pesan.
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { clockTime, dayLabel, isSameDay } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

export type ChatMessage = { id: string; sender_id: string; body: string; created_at: string };

/** Latar obrolan: krem berpola titik halus seperti wallpaper WhatsApp. Elemen ini sendiri yang menggulir. */
export function ChatBackdrop({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("bg-[#efeae2]", className)} style={{ backgroundImage: "radial-gradient(rgba(11,20,26,0.05) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      {children}
    </div>
  );
}

function DayChip({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-[#54656f] shadow-sm">{dayLabel(iso)}</span>
    </div>
  );
}

function Bubble({ mine, body, time, tail, onDelete }: { mine: boolean; body: string; time: string; tail: boolean; onDelete?: (() => void) | undefined }) {
  return (
    <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start", tail ? "mt-2" : "mt-0.5")}>
      {mine && onDelete && (
        <button
          type="button"
          aria-label="Hapus pesan"
          onClick={onDelete}
          className="rounded-full p-1.5 text-[#667781] opacity-0 transition hover:bg-black/5 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      )}
      <div
        className={cn(
          "flow-root max-w-[85%] rounded-lg px-2.5 py-1.5 text-[14.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] md:max-w-[70%]",
          mine ? "bg-[#d9fdd3]" : "bg-white",
          tail && (mine ? "rounded-tr-none" : "rounded-tl-none"),
        )}
      >
        {/* Teks biasa: whitespace-pre-wrap menjaga baris baru, React meng-escape isinya. */}
        <span className="whitespace-pre-wrap break-words">{body}</span>
        <span className="float-right ml-3 mt-2 select-none text-[11px] leading-none text-[#667781]">{time}</span>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  userId,
  onDelete,
  endRef,
}: {
  messages: ChatMessage[];
  userId: string;
  onDelete?: ((id: string) => void) | undefined;
  endRef?: RefObject<HTMLDivElement | null> | undefined;
}) {
  return (
    <div>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
        const mine = m.sender_id === userId;
        const tail = newDay || !prev || prev.sender_id !== m.sender_id;
        return (
          <div key={m.id}>
            {newDay && <DayChip iso={m.created_at} />}
            <Bubble mine={mine} body={m.body} time={clockTime(m.created_at)} tail={tail} onDelete={onDelete ? () => onDelete(m.id) : undefined} />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

/** Pesan kecil di tengah latar obrolan (memuat, kosong, galat). */
export function ChatNotice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className="flex justify-center py-6">
      <p role={tone === "error" ? "alert" : undefined} className={cn("max-w-sm rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs shadow-sm", tone === "error" ? "text-destructive" : "text-[#54656f]")}>
        {children}
      </p>
    </div>
  );
}

/** Kolom ketik berbentuk pil + tombol kirim bulat hijau. Enter kirim di perangkat dengan mouse; di layar sentuh Enter = baris baru. */
export function Composer({
  value,
  onChange,
  onSend,
  pending,
  disabled,
  maxLength,
  placeholder = "Ketik pesan",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  disabled: boolean;
  maxLength: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);
  const submit = () => { if (!disabled && !pending) onSend(); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label="Isi pesan"
        className="max-h-[120px] min-h-11 flex-1 resize-none rounded-3xl bg-white px-4 py-2.5 text-base leading-6 text-[#111b21] outline-none placeholder:text-[#667781] md:text-[15px]"
      />
      <button type="submit" disabled={disabled || pending} aria-label="Kirim pesan" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition active:scale-95 disabled:opacity-50">
        {pending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
      </button>
    </form>
  );
}
