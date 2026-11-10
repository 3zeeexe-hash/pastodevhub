import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, parseLinks } from "@/lib/market";
import type { StoreData } from "@/lib/store";

export async function fetchStore(username: string) {
  const { data: p, error } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  const [store, products, services] = await Promise.all([
    supabase.from("stores").select("*").eq("owner_id", p.id).maybeSingle(),
    supabase.from("products").select("id,title,summary,price,cover_url,category,download_count").eq("owner_id", p.id).eq("is_published", true).order("created_at", { ascending: false }).limit(100),
    supabase.from("services").select("id,title,summary,price_from,delivery_days,cover_url,category").eq("owner_id", p.id).eq("is_active", true).order("created_at", { ascending: false }).limit(100),
  ]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const data: StoreData = {
    developer: {
      username: p.username, name: p.display_name || p.username, headline: p.headline, bio: p.bio, avatar: p.avatar_url,
      profileUrl: `${origin}/${p.username}`,
    },
    products: (products.data ?? []).map((x) => ({ id: x.id, title: x.title, summary: x.summary, price: x.price, priceLabel: formatRupiah(x.price), cover: x.cover_url, url: `${origin}/karya/${x.id}` })),
    services: (services.data ?? []).map((x) => ({ id: x.id, title: x.title, summary: x.summary, priceFrom: x.price_from, priceLabel: formatRupiah(x.price_from, "Nego"), deliveryDays: x.delivery_days, cover: x.cover_url, url: `${origin}/jasa/${x.id}` })),
    links: parseLinks(p.links),
  };
  return { profile: p, store: store.data, data };
}
