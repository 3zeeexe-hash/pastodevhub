import { useState } from "react";
import { Star } from "lucide-react";
import { RATING_LABEL } from "@/lib/services-buyer";
import { cn } from "@/lib/utils";
/**
 * Bintang rating. Tanpa `onChange` hanya menampilkan nilai; dengan `onChange` jadi input radio
 * yang bisa disentuh (area tiap bintang cukup besar untuk jari) dan bisa dipakai lewat keyboard.
 */
export function StarRating({
  value, onChange, size = "size-4", className,
}: { value: number; onChange?: (n: number) => void; size?: string; className?: string }) {
  const [hover, setHover] = useState(0);
  const shown = onChange && hover ? hover : value;

  if (!onChange) {
    return (
      <div className={cn("flex items-center gap-0.5", className)} role="img" aria-label={`${value} dari 5 bintang`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn(size, n <= value ? "fill-primary text-primary" : "text-muted-foreground/40")} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center justify-center gap-1", className)}
      role="radiogroup"
      aria-label="Beri nilai 1 sampai 5 bintang"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} bintang, ${RATING_LABEL[n]}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, (value || 2) - 1)); }
          }}
          className="flex size-11 items-center justify-center rounded-full outline-none transition active:scale-90 focus-visible:ring-2 focus-visible:ring-ring sm:size-12"
        >
          <Star className={cn(size, "transition", n <= shown ? "scale-110 fill-primary text-primary" : "text-muted-foreground/50")} />
        </button>
      ))}
    </div>
  );
}
