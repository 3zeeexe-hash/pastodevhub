import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Gambar yang dilampirkan di post. Ketuk untuk membuka pratinjau besar (lightbox) tanpa meninggalkan linimasa;
 * dari sana ada tautan ke ukuran asli. Klik tidak ikut membuka detail post.
 */
export function PostImage({ url, compact = false, className }: { url: string; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    // Pembungkus ini menahan klik dari lightbox (portal) supaya tidak naik ke kartu post dan membuka halaman detail.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Perbesar gambar"
        className={cn("mt-2 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border bg-muted", className)}
      >
        <img src={url} alt="Gambar di post" loading="lazy" decoding="async" className={cn("w-full object-cover", compact ? "max-h-40" : "max-h-[32rem]")} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl border-0 bg-black/95 p-3 sm:p-4">
          <DialogTitle className="sr-only">Gambar post</DialogTitle>
          <img src={url} alt="Gambar di post" decoding="async" className="max-h-[80vh] w-full rounded-lg object-contain" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-center text-xs text-white/70 underline hover:text-white">Buka ukuran asli</a>
        </DialogContent>
      </Dialog>
    </span>
  );
}
