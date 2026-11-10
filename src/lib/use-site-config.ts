import { useQuery } from "@tanstack/react-query";
import { siteConfigQuery, type SiteConfig } from "@/lib/site-config.functions";
import { isFeatureOn, type FeatureKey } from "@/lib/features";

const EMPTY: SiteConfig = { flags: {}, announcement: null, announcementLevel: "info" };

export function useSiteConfig(): SiteConfig {
  const { data } = useQuery(siteConfigQuery);
  return data ?? EMPTY;
}

/** Whether a feature is switched on for everyone (admins can still open switched-off pages). */
export function useFeature(key: FeatureKey) {
  return isFeatureOn(useSiteConfig().flags, key);
}
