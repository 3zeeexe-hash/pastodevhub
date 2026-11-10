// Public site config (feature switches + announcement), read with the public key so it also works during SSR.
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import type { FeatureFlags } from "@/lib/features";

export type SiteConfig = { flags: FeatureFlags; announcement: string | null; announcementLevel: "info" | "warning" };

export const getSiteConfig = createServerFn({ method: "GET" }).handler(async (): Promise<SiteConfig> => {
  const empty: SiteConfig = { flags: {}, announcement: null, announcementLevel: "info" };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return empty;
    const db = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const [flags, settings] = await Promise.all([
      db.from("feature_flags").select("key,enabled"),
      db.from("app_settings").select("announcement,announcement_level").eq("id", 1).maybeSingle(),
    ]);
    const out: FeatureFlags = {};
    for (const row of flags.data ?? []) out[row.key] = row.enabled;
    const s = settings.data as { announcement: string | null; announcement_level: string } | null;
    return { flags: out, announcement: s?.announcement?.trim() || null, announcementLevel: s?.announcement_level === "warning" ? "warning" : "info" };
  } catch (e) {
    console.error("site config failed", e);
    return empty;
  }
});

export const siteConfigQuery = queryOptions({ queryKey: ["site-config"], queryFn: () => getSiteConfig(), staleTime: 60_000 });
