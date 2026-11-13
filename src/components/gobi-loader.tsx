import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * Indikator memuat standar GOBI: logo GOBI berdenyut di dalam cincin oranye yang berputar, dengan teks "Memuat data…" di bawahnya,
 * selalu di tengah. Pakai ini sebagai pengganti teks "Memuat…" di semua halaman.
 *  - default: blok di tengah area (cocok di dalam kartu atau bagian halaman).
 *  - page: mengisi tinggi layar (cocok untuk halaman penuh yang sedang memuat).
 *  - compact: lebih kecil dan rapat (cocok di panel kecil, obrolan, atau daftar).
 */
export function GobiLoader({
  label = "Memuat data…",
  page = false,
  compact = false,
  className,
}: {
  label?: string;
  page?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const logo = compact ? 28 : 44;
  const box = logo + (compact ? 14 : 20);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 px-4 text-center",
        page ? "min-h-[60vh]" : compact ? "py-5" : "py-12",
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: box, height: box }}>
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary motion-reduce:animate-none" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="animate-pulse motion-reduce:animate-none"><BrandMark size={logo} /></span>
        </span>
      </div>
      <p className={cn("font-semibold text-muted-foreground", compact ? "text-xs" : "text-sm")}>{label}</p>
    </div>
  );
}
