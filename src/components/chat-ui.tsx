// Potongan UI obrolan bertema GOBI (biru tua, oranye, abu-abu, putih) yang dipakai semua percakapan di /gobifeed/pesan:
// pesan pribadi, obrolan kerja (lamaran), dan chat pesanan.
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { clockTime, dayLabel, isSameDay } from "@/lib/chat-time";
import { cn } from "@/lib/utils";
import { AttachImageButton, AttachmentPreview, MessageImage, type ChatAttachment } from "@/components/chat-attachment";

export type ChatMessage = { id: string; sender_id: string; body: string; created_at: string; image_url?: string | null };

/** Kelas tombol kembali di header percakapan (hanya tampil di layar sempit, tempat daftar dan percakapan bergantian). */
export const chatBackClass = "grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground md:hidden";

/** Header percakapan yang sama untuk semua jenis chat: [kembali] [avatar] judul + keterangan [aksi]. */
export function ChatHeader({ back, avatar, title, subtitle, right }: { back?: ReactNode; avatar: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <>
      <header className="flex items-center gap-2 bg-card px-2 py-2.5 sm:gap-3 sm:px-4">
        {back}
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight text-foreground">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
      </header>
      <div aria-hidden className="batik-line" />
    </>
  );
}

/** Latar obrolan: abu-abu kebiruan berpola titik halus. Elemen ini sendiri yang menggulir. */
export function ChatBackdrop({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("bg-grey-50", className)} style={{ backgroundImage: "radial-gradient(rgba(10,26,69,0.07) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
      {children}
    </div>
  );
}

function DayChip({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex justify-center">
      <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-border">{dayLabel(iso)}</span>
    </div>
  );
}

function Bubble({ mine, body, image, time, tail, onDelete }: { mine: boolean; body: string; image?: string | null | undefined; time: string; tail: boolean; onDelete?: (() => void) | undefined }) {
  return (
    <div className={cn("group flex items-end gap-1", mine ? "justify-end" : "justify-start", tail ? "mt-2.5" : "mt-0.5")}>
      {mine && onDelete && (
        <button
          type="button"
          aria-label="Hapus pesan"
          onClick={onDelete}
          className="rounded-full p-1.5 text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      )}
      <div
        className={cn(
          "flow-root max-w-[85%] rounded-2xl px-3 py-2 text-[14.5px] leading-snug shadow-sm md:max-w-[70%]",
          mine ? "bg-navy text-white" : "bg-card text-foreground ring-1 ring-border",
          tail && (mine ? "rounded-tr-md" : "rounded-tl-md"),
        )}
      >
        {image && <MessageImage url={image} className={cn("-mx-1 -mt-0.5", body.trim() ? "mb-1.5" : "mb-0")} />}
        {/* Teks biasa: whitespace-pre-wrap menjaga baris baru, React meng-escape isinya. */}
        <span className="whitespace-pre-wrap break-words">{body}</span>
        <span className={cn("float-right ml-3 mt-2 select-none text-[11px] leading-none", mine ? "text-white/60" : "text-muted-foreground")}>{time}</span>
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
            <Bubble mine={mine} body={m.body} image={m.image_url} time={clockTime(m.created_at)} tail={tail} onDelete={onDelete ? () => onDelete(m.id) : undefined} />
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
      <p
        role={tone === "error" ? "alert" : undefined}
        className={cn("max-w-sm rounded-2xl px-4 py-2.5 text-center text-xs shadow-sm ring-1", tone === "error" ? "bg-destructive/10 text-destructive ring-destructive/30" : "bg-card text-muted-foreground ring-border")}
      >
        {children}
      </p>
    </div>
  );
}

/** Kolom ketik berbentuk pil + tombol kirim bulat oranye. Enter kirim di perangkat dengan mouse; di layar sentuh Enter = baris baru. */
export function Composer({
  value,
  onChange,
  onSend,
  pending,
  disabled,
  maxLength,
  placeholder = "Ketik pesan",
  attachment,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  disabled: boolean;
  maxLength: number;
  placeholder?: string;
  /** Jika diisi, tombol lampirkan gambar ikut tampil. */
  attachment?: ChatAttachment | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);
  const busy = pending || !!attachment?.uploading;
  const submit = () => { if (!disabled && !busy) onSend(); };
  return (
    <div className="border-t border-border bg-card">
      {attachment && <AttachmentPreview attachment={attachment} />}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        {attachment && <AttachImageButton attachment={attachment} />}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const f = attachment ? [...e.clipboardData.files].find((x) => x.type.startsWith("image/")) : undefined;
            if (f && attachment) { e.preventDefault(); void attachment.pick(f); }
          }}
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
          className="max-h-[120px] min-h-11 flex-1 resize-none rounded-3xl bg-secondary px-4 py-2.5 text-base leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-primary/50 md:text-[15px]"
        />
        <button
          type="submit"
          disabled={disabled || busy}
          aria-label="Kirim pesan"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:shadow-none"
        >
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </button>
      </form>
    </div>
  );
}
