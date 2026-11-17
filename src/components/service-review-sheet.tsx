import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { RATING_LABEL, REVIEW_COMMENT_MAX, reviewErrors } from "@/lib/services-buyer";
import { useIsMobile } from "@/hooks/use-mobile";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Frasa cepat: sekali ketuk menambah kalimat ke komentar, supaya mengulas dari HP tidak perlu mengetik panjang. */
const QUICK_TAGS = ["Hasil sesuai permintaan", "Komunikasi lancar", "Tepat waktu", "Revisi cepat ditangani", "Sangat profesional"];

export type ReviewSubmit = (rating: number, comment: string) => Promise<boolean>;

function ReviewForm({ sellerName, onSubmit, onSkip }: { sellerName: string; onSubmit: ReviewSubmit; onSkip: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleTag(tag: string) {
    setComment((c) => {
      if (c.includes(tag)) return c.replace(tag, "").replace(/\s*\.\s*\./g, ".").replace(/^\s*[.,]\s*/, "").trim();
      const next = c.trim() ? `${c.trim().replace(/[.!?]$/, "")}. ${tag}.` : `${tag}.`;
      return next.slice(0, REVIEW_COMMENT_MAX);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = reviewErrors({ rating, comment });
    if (errs.length) { setError(errs[0]); return; }
    setError("");
    setBusy(true);
    try { await onSubmit(rating, comment.trim()); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
        <div className="text-center">
          <StarRating value={rating} onChange={(n) => { setRating(n); setError(""); }} size="size-8 sm:size-9" />
          <p className={cn("mt-1 h-5 text-sm font-medium", rating ? "text-primary" : "text-muted-foreground")} aria-live="polite">
            {rating ? RATING_LABEL[rating] : `Ketuk bintang untuk menilai ${sellerName}`}
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Yang paling berkesan (opsional)</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((t) => {
              const on = comment.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label htmlFor="rv-sheet-comment">Komentar (opsional)</Label>
          <Textarea
            id="rv-sheet-comment"
            rows={4}
            maxLength={REVIEW_COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ceritakan pengalamanmu: kualitas hasil, komunikasi, ketepatan waktu."
            className="mt-1.5 text-base sm:text-sm"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{comment.length}/{REVIEW_COMMENT_MAX}</p>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row-reverse">
        <Button type="submit" disabled={busy || rating === 0} className="h-11 flex-1 sm:flex-none"><Send /> {busy ? "Mengirim…" : "Kirim ulasan"}</Button>
        <Button type="button" variant="ghost" onClick={onSkip} disabled={busy} className="h-11">Nanti saja</Button>
      </div>
    </form>
  );
}

/**
 * Pop-up ulasan untuk pembeli setelah pesanan jasa selesai. Di HP tampil sebagai bottom sheet yang bisa ditarik turun,
 * di layar lebar sebagai dialog. Ulasan dikirim lewat `onSubmit`; sheet menutup sendiri kalau pengiriman berhasil.
 */
export function ServiceReviewSheet({
  open, onOpenChange, serviceTitle, sellerName, onSubmit,
}: { open: boolean; onOpenChange: (o: boolean) => void; serviceTitle: string; sellerName: string; onSubmit: ReviewSubmit }) {
  const isMobile = useIsMobile();
  // Form dipasang ulang tiap dibuka supaya isian lama tidak tersisa.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => { if (open) setFormKey((k) => k + 1); }, [open]);

  const submit: ReviewSubmit = async (rating, comment) => {
    const ok = await onSubmit(rating, comment);
    if (ok) onOpenChange(false);
    return ok;
  };
  const title = "Bagaimana hasil pesananmu?";
  const description = `${serviceTitle} · dari ${sellerName}. Ulasan tampil di halaman jasa dan hanya bisa diberikan sekali.`;
  const form = <ReviewForm key={formKey} sellerName={sellerName} onSubmit={submit} onSkip={() => onOpenChange(false)} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="line-clamp-2">{description}</DrawerDescription>
          </DrawerHeader>
          {form}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="p-4 pb-3 pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
