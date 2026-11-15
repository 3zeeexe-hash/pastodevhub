// Data untuk bagian "Pesanan" di halaman Pesan: pesanan (karya/jasa) yang sudah punya obrolan, lengkap dengan pesan terakhir.
import { supabase } from "@/integrations/supabase/client";
import { previewBody, type OrderRow } from "@/lib/inbox";

type Person = { username: string; display_name: string | null; avatar_url: string | null } | null;
type OrderHead = {
  id: string; number: string | number | null; title: string; buyer_id: string; seller_id: string; updated_at: string;
  buyer: Person; seller: Person;
};
type LastMsg = { order_id: string; body: string; image_url: string | null; created_at: string; sender_id: string };

/** Kolom pesanan yang dipakai daftar dan panel (nama relasi sama dengan halaman /pesanan). */
export const ORDER_HEAD_SELECT =
  "id,number,title,status,buyer_id,seller_id,updated_at, buyer:profiles!orders_buyer_id_fkey(username,display_name,avatar_url), seller:profiles!orders_seller_id_fkey(username,display_name,avatar_url)";

/**
 * Pesanan milik pengguna (sebagai pembeli atau penjual) yang sudah punya pesan dari manusia. Pesanan tanpa obrolan tidak
 * ditampilkan supaya daftar tidak penuh; obrolannya tetap bisa dibuka dari tombol "Pesan" di halaman pesanan.
 */
export async function fetchOrderConversations(uid: string): Promise<OrderRow[]> {
  const heads = await supabase.from("orders").select(ORDER_HEAD_SELECT).or(`buyer_id.eq.${uid},seller_id.eq.${uid}`).order("updated_at", { ascending: false }).limit(100);
  if (heads.error) throw new Error(heads.error.message);
  const rows = (heads.data ?? []) as unknown as OrderHead[];
  if (rows.length === 0) return [];

  const m = await supabase
    .from("order_messages")
    .select("order_id,body,image_url,created_at,sender_id")
    .in("order_id", rows.map((r) => r.id))
    .eq("is_system", false)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (m.error) throw new Error(m.error.message);
  const last = new Map<string, LastMsg>();
  for (const r of (m.data ?? []) as unknown as LastMsg[]) if (!last.has(r.order_id)) last.set(r.order_id, r);

  return rows
    .filter((r) => last.has(r.id))
    .map((r): OrderRow => {
      const lm = last.get(r.id)!;
      const other = r.buyer_id === uid ? r.seller : r.buyer;
      return {
        id: r.id, number: r.number, title: r.title,
        otherName: other?.display_name || other?.username || "Pengguna", otherUsername: other?.username ?? null, otherAvatar: other?.avatar_url ?? null,
        lastBody: previewBody(lm.body, lm.image_url), lastSender: lm.sender_id, lastAt: lm.created_at,
      };
    });
}
