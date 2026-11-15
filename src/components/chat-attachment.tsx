// Lampiran gambar untuk semua obrolan (DM diskusi, pesan lowongan/kerja, pesan pesanan).
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { errMsg, uploadMedia } from "@/lib/market";
import { cn } from "@/lib/utils";

export const CHAT_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/** Menyimpan satu gambar terlampir: diunggah begitu dipilih, lalu dikirim bersama pesan. */
export function useChatAttachment() {
  const { user } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  async function pick(file: File | undefined | null) {
    if (!file || !user) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    setUploading(true);
    try {
      setImage(await uploadMedia(user.id, file, "chat"));
    } catch (e) {
      toast.error(errMsg(e));
      setPreview(null);
      setImage(null);
    } finally {
      setUploading(false);
    }
  }
  function clear() {
    setImage(null);
    setPreview(null);
  }
  return { image, preview, uploading, pick, clear };
}
export type ChatAttachment = ReturnType<typeof useChatAttachment>;

/** Tombol ikon untuk memilih gambar (galeri / kamera di HP). */
export function AttachImageButton({ attachment, disabled, className }: { attachment: ChatAttachment; disabled?: boolean | undefined; className?: string | undefined }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={CHAT_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => { void attachment.pick(e.target.files?.[0]); e.target.value = ""; }}
      />
      <button
        type="button"
        aria-label="Lampirkan gambar"
        title="Lampirkan gambar (maks 5 MB)"
        disabled={disabled || attachment.uploading}
        onClick={() => ref.current?.click()}
        className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:opacity-50", className)}
      >
        {attachment.uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
      </button>
    </>
  );
}

/** Pratinjau gambar terlampir di atas kolom ketik. */
export function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  if (!attachment.preview) return null;
  return (
    <div className="flex items-center gap-3 px-3 pt-2">
      <div className="relative">
        <img src={attachment.preview} alt="Gambar terlampir" className="h-20 w-20 rounded-lg border border-border object-cover" />
        {attachment.uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70"><Loader2 className="size-5 animate-spin" /></div>
        )}
        <button
          type="button"
          aria-label="Hapus lampiran"
          onClick={attachment.clear}
          className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{attachment.uploading ? "Mengunggah gambar…" : "Gambar siap dikirim. Tambahkan keterangan jika perlu."}</p>
    </div>
  );
}

/** Gambar di dalam gelembung pesan; ketuk untuk membuka ukuran penuh. */
export function MessageImage({ url, className }: { url: string; className?: string | undefined }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn("block overflow-hidden rounded-md", className)} aria-label="Buka gambar ukuran penuh">
      <img src={url} alt="Gambar dalam pesan" loading="lazy" className="max-h-72 w-full max-w-[280px] bg-black/5 object-cover" />
    </a>
  );
}
