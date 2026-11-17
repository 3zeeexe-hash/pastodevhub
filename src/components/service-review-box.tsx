import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PartyPopper, Send, Star } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import type { ServiceOrderStage } from "@/lib/services";
import {
  REPLY_MAX, canLeaveReview, canReplyReview, replyErrors, type CancelRole, type ReviewRow,
} from "@/lib/services-buyer";
import { serviceRpc } from "@/lib/services-db";
import { ServiceReviewSheet } from "@/components/service-review-sheet";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

const dismissKey = (orderId: string) => `gobi:review-dismissed:${orderId}`;
function wasDismissed(orderId: string): boolean {
  try { return sessionStorage.getItem(dismissKey(orderId)) === "1"; } catch { return false; }
}
function markDismissed(orderId: string) {
  try { sessionStorage.setItem(dismissKey(orderId), "1"); } catch { /* penyimpanan bisa diblokir; abaikan */ }
}

/**
 * Ulasan pesanan paket. Setelah pesanan selesai, pembeli langsung diberi pop-up (bottom sheet di HP) untuk memberi bintang
 * dan komentar; kalau ditutup, kartu "Beri ulasan" tetap ada di halaman. Ulasan yang masuk tampil di detail jasa.
 * Penjual bisa membalas sekali. Aturan ditegakkan fungsi database (service_leave_review, service_reply_review).
 */
export function ServiceReviewBox({
  orderId, buyerId, sellerId, serviceId, serviceTitle, sellerName, onChanged,
}: {
  orderId: string; buyerId: string; sellerId: string; serviceId?: string | null; serviceTitle: string; sellerName: string; onChanged?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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
  const role: CancelRole = !user ? null : user.id === buyerId ? "buyer" : user.id === sellerId ? "seller" : null;
  const review = d?.review ?? null;
  const mayReview = !!d && canLeaveReview(d.stage, role, !!review);
  const mayReply = canReplyReview(role, !!review, !!review?.seller_reply);

  // Buka otomatis begitu pesanan selesai, kecuali pembeli sudah menutupnya di sesi ini.
  useEffect(() => {
    if (!mayReview || wasDismissed(orderId)) return;
    const t = setTimeout(() => setSheetOpen(true), 500);
    return () => clearTimeout(t);
  }, [mayReview, orderId]);

  if (!d || !user) return null;
  if (!review && !mayReview) return null;

  function onSheetOpenChange(o: boolean) {
    setSheetOpen(o);
    if (!o) markDismissed(orderId);
  }

  async function call(fn: string, args: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      await serviceRpc(fn, args);
      toast.success(ok);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["service-review", orderId] }),
        qc.invalidateQueries({ queryKey: ["service-buyer-orders"] }),
        qc.invalidateQueries({ queryKey: ["orders"] }),
        // Hasil ulasan langsung tampil di detail jasa: muat ulang rating rata-rata, daftar ulasan, dan statistik penjual.
        ...(serviceId ? [
          qc.invalidateQueries({ queryKey: ["service", serviceId] }),
          qc.invalidateQueries({ queryKey: ["service-extra", serviceId] }),
          qc.invalidateQueries({ queryKey: ["service-reviews", serviceId] }),
        ] : []),
        qc.invalidateQueries({ queryKey: ["service-seller-info"] }),
      ]);
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(rating: number, comment: string): Promise<boolean> {
    return call("service_leave_review", { _order_id: orderId, _rating: rating, _comment: comment }, "Terima kasih, ulasanmu terkirim");
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    const errs = replyErrors(reply);
    if (errs.length) { toast.error(errs[0]); return; }
    const ok = await call("service_reply_review", { _order_id: orderId, _reply: reply.trim() }, "Balasan terkirim");
    if (ok) setReply("");
  }

  return (
    <section className="space-y-3" aria-label="Ulasan">
      {mayReview && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><PartyPopper className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Pesanan selesai. Bagaimana hasilnya?</h2>
            <p className="text-sm text-muted-foreground">Beri bintang dan komentar. Ulasanmu akan tampil di halaman jasa dan membantu pembeli lain.</p>
          </div>
          <Button className="h-11 w-full sm:w-auto" onClick={() => setSheetOpen(true)}><Star /> Beri ulasan</Button>
        </div>
      )}

      {review && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">{role === "buyer" ? "Ulasanmu" : "Ulasan dari client"}</h2>
          <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StarRating value={review.rating} />
              <span className="text-xs text-muted-foreground">{timeAgo(review.created_at)}</span>
              {!review.is_visible && <span className="text-xs text-destructive">Disembunyikan moderator</span>}
            </div>
            {review.comment ? <p className="whitespace-pre-wrap break-words">{review.comment}</p> : <p className="text-muted-foreground">Tanpa komentar.</p>}
            {review.seller_reply && (
              <div className="rounded-lg bg-muted p-2.5 text-xs">
                <p className="font-medium">Balasan penjual{review.replied_at ? ` · ${timeAgo(review.replied_at)}` : ""}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{review.seller_reply}</p>
              </div>
            )}
          </div>

          {mayReply && (
            <form onSubmit={submitReply} className="space-y-2">
              <Label htmlFor="rv-reply">Balas ulasan (sekali saja)</Label>
              <Textarea id="rv-reply" rows={3} maxLength={REPLY_MAX} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Terima kasih atau tanggapan singkat untuk pembeli." className="text-base sm:text-sm" />
              <Button variant="outline" disabled={busy} className="h-10 w-full sm:w-auto"><Send /> Kirim balasan</Button>
            </form>
          )}
        </div>
      )}

      {/* Tetap terpasang untuk pembeli walau mayReview sudah false (ulasan terkirim), supaya sheet menutup dengan animasi normal. */}
      {role === "buyer" && <ServiceReviewSheet open={sheetOpen && !review} onOpenChange={onSheetOpenChange} serviceTitle={serviceTitle} sellerName={sellerName} onSubmit={submitReview} />}
    </section>
  );
}
