import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FeatureKey } from "@/lib/features";
import { JOB_SELECT, type JobCardData } from "@/lib/jobs";

export type DevRow = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  skills: string[];
  available_for_hire: boolean;
  active_role?: string | null;
};

/** Data pendamping beranda (lowongan dan talenta). Karya sengaja tidak ditampilkan di beranda. */
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
    queryFn: async () => {
      // Talenta = developer dan freelancer. Kolom active_role ada setelah SQL 0009; sebelum itu semua akun developer tampil seperti dulu.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const withRole = await sb.from("profiles").select("username,display_name,avatar_url,headline,skills,available_for_hire,active_role").eq("account_type", "developer")
        .or("active_role.is.null,active_role.in.(developer,freelancer)")
        .order("available_for_hire", { ascending: false }).order("created_at", { ascending: false }).limit(12);
      if (!withRole.error) return (withRole.data ?? []) as DevRow[];
      return ((await supabase.from("profiles").select("username,display_name,avatar_url,headline,skills,available_for_hire").eq("account_type", "developer")
        .order("available_for_hire", { ascending: false }).order("created_at", { ascending: false }).limit(12)).data ?? []) as DevRow[];
    },
  });
  return { jobs, devs };
}

export type HomeData = ReturnType<typeof useHomeData>;
