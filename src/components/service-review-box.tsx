import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Star } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import type { ServiceOrderStage } from "@/lib/services";
import {
  REPLY_MAX, REVIEW_COMMENT_MAX, canLeaveReview, canReplyReview, replyErrors, reviewErrors, type CancelRole, type ReviewRow,
} from "@/lib/services-buyer";
import { serviceRpc } from "@/lib/services-db";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

function Stars({ value, onChange, size = "size-6" }: { value: number; onChange?: (n: number) => void; size?: string }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : "img"} aria-label={`${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star className={cn(size, n <= value ? "fill-primary text-primary" : "text-muted-foreground")} />;
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} bintang`} onClick={() => onChange(n)}>{icon}</button>
          : <span key={n}>{icon}</span>;
      })}
    </div>
  );
}

/**
 * Ulasan pesanan paket: pembeli memberi ulasan sekali setelah pesanan selesai; penjual membalas sekali.
 * Aturan ditegakkan fungsi database (service_leave_review, service_reply_review).
 */
export function ServiceReviewBox({ orderId, buyerId, sellerId, onChanged }: { orderId: string; buyerId: string; sellerId: string; onChanged?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");

  const q = useQuery({
    queryKey: ["service-review", orderId],
    queryFn: async () => {
      const [so, rv] = await Promise.all([
        rows<{ stage: ServiceOrderStage }>(looseDb.from("service_orders").select("stage").eq("order_id", orderId).limit(1)),
        rows<ReviewRow>(looseDb.from("service_reviews").select("id,rating,comment,seller_reply,replied_at,created_at,is_visible").eq("order_id", orderId).limit(1)),
      ]);
      return { stage: so[0]?.stage ?? null, review: rv[0] ?? null };
    },
  });

  const d = q.data;
  if (!d || !user) return null;
  const role: CancelRole = user.id === buyerId ? "buyer" : user.id === sellerId ? "seller" : null;
  const review = d.review;
  const mayReview = canLeaveReview(d.stage, role, !!review);
  const mayReply = canReplyReview(role, !!review, !!review?.seller_reply);
  if (!review && !mayReview) return null;

  async function call(fn: string, args: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      await serviceRpc(fn, args);
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["service-review", orderId] });
      await qc.invalidateQueries({ queryKey: ["service-buyer-orders"] });
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    const errs = reviewErrors({ rating, comment });
    if (errs.length) { toast.error(errs[0]); return; }
    const ok = await call("service_leave_review", { _order_id: orderId, _rating: rating, _comment: comment.trim() }, "Terima kasih, ulasanmu terkirim");
    if (ok) { setRating(0); setComment(""); }
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const errs = replyErrors(reply);
    if (errs.length) { toast.error(errs[0]); return; }
    const ok = await call("service_reply_review", { _order_id: orderId, _reply: reply.trim() }, "Balasan terkirim");
    if (ok) setReply("");
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Ulasan">
      <h2 className="font-semibold">Ulasan</h2>

      {mayReview && (
        <form onSubmit={submitReview} className="space-y-3">
          <p className="text-sm text-muted-foreground">Pesanan selesai. Bagaimana hasilnya? Ulasanmu membantu pembeli lain dan hanya bisa diberikan sekali.</p>
          <Stars value={rating} onChange={setRating} />
          <div>
            <Label htmlFor="rv-comment">Komentar (opsional)</Label>
            <Textarea id="rv-comment" rows={3} maxLength={REVIEW_COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ceritakan pengalamanmu: kualitas hasil, komunikasi, ketepatan waktu." />
          </div>
          <Button disabled={busy || rating === 0}><Send /> {busy ? "Mengirim…" : "Kirim ulasan"}</Button>
        </form>
      )}

      {review && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={review.rating} size="size-4" />
            <span className="text-xs text-muted-foreground">{timeAgo(review.created_at)}</span>
            {!review.is_visible && <span className="text-xs text-destructive">Disembunyikan moderator</span>}
          </div>
          {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
          {review.seller_reply && (
            <div className="rounded-md bg-muted p-2.5 text-xs">
              <p className="font-medium">Balasan penjual{review.replied_at ? ` · ${timeAgo(review.replied_at)}` : ""}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{review.seller_reply}</p>
            </div>
          )}
        </div>
      )}

      {mayReply && (
        <form onSubmit={submitReply} className="space-y-2">
          <Label htmlFor="rv-reply">Balas ulasan (sekali saja)</Label>
          <Textarea id="rv-reply" rows={3} maxLength={REPLY_MAX} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Terima kasih atau tanggapan singkat untuk pembeli." />
          <Button variant="outline" disabled={busy}>Kirim balasan</Button>
        </form>
      )}
    </section>
  );
}
