import { cn } from "@/lib/utils";

/** Gambar yang dilampirkan di post. Ketuk untuk membuka ukuran penuh; klik tidak ikut membuka detail post. */
export function PostImage({ url, compact = false, className }: { url: string; compact?: boolean; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="Buka gambar ukuran penuh"
      className={cn("mt-2 block overflow-hidden rounded-xl border border-border bg-muted", className)}
    >
      <img src={url} alt="Gambar di post" loading="lazy" className={cn("w-full object-cover", compact ? "max-h-40" : "max-h-[32rem]")} />
    </a>
  );
}
