import { supabase } from "@/integrations/supabase/client";

export type AccountType = "client" | "developer";
export type OrderStatus =
  | "requested" | "declined" | "awaiting_payment" | "payment_review"
  | "in_progress" | "delivered" | "completed" | "cancelled";
export type OrderKind = "product" | "service";

export type ProfileLink = { label: string; url: string };

export const CATEGORIES = [
  ["website", "Website"],
  ["aplikasi-mobile", "Aplikasi mobile"],
  ["template", "Template & UI kit"],
  ["plugin", "Plugin & library"],
  ["game", "Game"],
  ["desain", "Desain"],
  ["data-ai", "Data & AI"],
  ["lainnya", "Lainnya"],
] as const;
export const categoryLabel = (c: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? "Lainnya";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  requested: "Menunggu jawaban developer",
  declined: "Ditolak developer",
  awaiting_payment: "Menunggu pembayaran",
  payment_review: "Pembayaran diverifikasi admin",
  in_progress: "Sedang dikerjakan",
  delivered: "Hasil dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

/** Formats whole rupiah: 150000 -> "Rp150.000"; 0 -> "Gratis". */
export function formatRupiah(n: number, freeLabel = "Gratis") {
  if (!n) return freeLabel;
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

/** Accepts only absolute http(s) links, so profile links never run scripts. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseLinks(v: unknown): ProfileLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ label: String((x as ProfileLink)?.label ?? "").slice(0, 40), url: safeUrl(String((x as ProfileLink)?.url ?? "")) ?? "" }))
    .filter((l) => l.url);
}

export type OrderAction =
  | "accept" | "decline" | "pay" | "cancel" | "verify" | "deliver" | "complete" | "revise";

/** Which buttons each person sees on an order, by status. Mirrors the database rules. */
export function orderActions(
  o: { kind: OrderKind; status: OrderStatus; buyer_id: string; seller_id: string },
  viewer: { id: string | null; isAdmin: boolean },
): OrderAction[] {
  const out: OrderAction[] = [];
  const buyer = viewer.id === o.buyer_id;
  const seller = viewer.id === o.seller_id;
  if (o.status === "requested") {
    if (seller) out.push("accept", "decline");
    if (buyer) out.push("cancel");
  }
  if (o.status === "awaiting_payment" && buyer) out.push("pay", "cancel");
  if (o.status === "payment_review" && viewer.isAdmin) out.push("verify");
  if (o.status === "in_progress" && seller) out.push("deliver");
  if (o.status === "delivered" && buyer) out.push("complete", "revise");
  return out;
}

/** Developer earnings for one order after the platform fee (rounded to whole rupiah). */
export function sellerEarning(amount: number, feePercent: number) {
  return amount - Math.round((amount * feePercent) / 100);
}

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
}

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
/** Uploads an image to the shared media storage and returns a long-lived link to show it. */
export async function uploadMedia(userId: string, file: File, folder: string) {
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Gambar maksimal 5 MB.");
  const path = `${userId}/${folder}/${Date.now()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, TEN_YEARS);
  if (error || !data) throw error ?? new Error("Gagal membuat link gambar.");
  return data.signedUrl;
}

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Terjadi kesalahan.";
}
