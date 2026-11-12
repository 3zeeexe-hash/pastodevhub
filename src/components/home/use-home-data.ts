import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureKey } from "@/lib/features";
import { JOB_SELECT, type JobCardData } from "@/lib/jobs";
import { PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";

export type DevRow = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  skills: string[];
  available_for_hire: boolean;
};

/** Data pendamping beranda (lowongan, karya, talenta). Dipakai bersama oleh kolom tengah dan kolom kanan. */
export function useHomeData(on: (key: FeatureKey) => boolean) {
  const jobs = useQuery({
    queryKey: ["home", "jobs"],
    enabled: on("jobs"),
    staleTime: 60_000,
    queryFn: async () => ((await supabase.from("jobs").select(JOB_SELECT).eq("status", "open").order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as JobCardData[],
  });
  const devs = useQuery({
    queryKey: ["home", "devs"],
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabase.from("profiles").select("username,display_name,avatar_url,headline,skills,available_for_hire").eq("account_type", "developer")
        .order("available_for_hire", { ascending: false }).order("created_at", { ascending: false }).limit(12)).data ?? []) as DevRow[],
  });
  const karya = useQuery({
    queryKey: ["home", "karya"],
    enabled: on("karya"),
    staleTime: 60_000,
    queryFn: async () => ((await supabase.from("products").select(PRODUCT_SELECT).eq("is_published", true).order("created_at", { ascending: false }).limit(4)).data ?? []) as unknown as ProductCardData[],
  });
  return { jobs, devs, karya };
}

export type HomeData = ReturnType<typeof useHomeData>;
