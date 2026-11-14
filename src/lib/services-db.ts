// GOBI SERVICES: tipe baris, pembantu RPC, dan hook baca untuk sisi penjual.
// Tabel dan fungsi jasa belum ada di tipe Supabase hasil generate (sampai Lovable meregenerasinya), jadi memakai looseDb.
// Semua perubahan lewat fungsi database (service_*), bukan insert/update langsung.
import { useQuery } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import type { PackageTier, ServiceStatus } from "@/lib/services";

export type CategoryRow = { slug: string; label: string; group_label: string; sort_order: number };
export type SubcategoryRow = { slug: string; category_slug: string; label: string; sort_order: number };

export type SellerProfileRow = {
  user_id: string; is_active: boolean; tagline: string; response_time_hours: number | null;
  terms_accepted_at: string | null; suspended_at: string | null; suspended_reason: string | null;
};

export type ServiceEditRow = {
  id: string; owner_id: string; title: string; summary: string; description: string; category: string;
  category_slug: string | null; subcategory_slug: string | null; skills: string[];
  buyer_requirements: string; revision_terms: string; scope_limits: string;
  cover_url: string | null; status: ServiceStatus; is_active: boolean; admin_hold: boolean;
  moderation_note: string | null; published_at: string | null; price_from: number; delivery_days: number;
};
export type PackageRow = {
  id: string; tier: PackageTier; name: string; description: string; price: number; delivery_days: number;
  revisions: number; features: string[]; work_limit: string; is_active: boolean;
};
export type AddonRow = { id: string; name: string; description: string; price: number; extra_days: number; extra_revisions: number; is_active: boolean };
export type FaqRow = { id: string; question: string; answer: string; position: number };
export type GalleryRow = { id: string; url: string | null; caption: string; position: number };

export type ServiceListRow = {
  id: string; title: string; cover_url: string | null; price_from: number; delivery_days: number; status: ServiceStatus;
  is_active: boolean; admin_hold: boolean; moderation_note: string | null;
  rating_avg: number; rating_count: number; orders_completed: number; created_at: string;
};
export const SERVICE_LIST_SELECT =
  "id,title,cover_url,price_from,delivery_days,status,is_active,admin_hold,moderation_note,rating_avg,rating_count,orders_completed,created_at";

export type ServiceConfig = { require_moderation: boolean; auto_complete_days: number; commission_percent: number };

/** Memanggil fungsi database dan melempar Error berpesan bahasa Indonesia jika gagal. */
export async function serviceRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await looseDb.rpc(fn, args);
  if (error) throw new Error(errMsg(error));
  return data as T;
}

export function useServiceTaxonomy() {
  return useQuery({
    queryKey: ["service-taxonomy"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [c, s] = await Promise.all([
        looseDb.from("service_categories").select("slug,label,group_label,sort_order").eq("active", true).order("sort_order"),
        looseDb.from("service_subcategories").select("slug,category_slug,label,sort_order").eq("active", true).order("sort_order"),
      ]);
      if (c.error) throw new Error(errMsg(c.error));
      if (s.error) throw new Error(errMsg(s.error));
      return { categories: (c.data ?? []) as CategoryRow[], subcategories: (s.data ?? []) as SubcategoryRow[] };
    },
  });
}

export function useSellerProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["service-seller", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await looseDb.from("service_seller_profiles").select("*").eq("user_id", userId!).maybeSingle();
      if (error) throw new Error(errMsg(error));
      return (data ?? null) as SellerProfileRow | null;
    },
  });
}

export function useServiceConfig() {
  return useQuery({
    queryKey: ["service-config"],
    staleTime: 60_000,
    queryFn: () => serviceRpc<ServiceConfig>("service_public_config"),
  });
}

export async function loadServiceForEdit(id: string) {
  const { data: service, error } = await looseDb.from("services").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(errMsg(error));
  if (!service) return null;
  const [p, a, f, g] = await Promise.all([
    looseDb.from("service_packages").select("*").eq("service_id", id),
    looseDb.from("service_addons").select("*").eq("service_id", id).order("created_at"),
    looseDb.from("service_faqs").select("*").eq("service_id", id).order("position"),
    looseDb.from("service_gallery").select("*").eq("service_id", id).order("position"),
  ]);
  for (const r of [p, a, f, g]) if (r.error) throw new Error(errMsg(r.error));
  return {
    service: service as ServiceEditRow,
    packages: (p.data ?? []) as PackageRow[],
    addons: (a.data ?? []) as AddonRow[],
    faqs: (f.data ?? []) as FaqRow[],
    gallery: (g.data ?? []) as GalleryRow[],
  };
}
