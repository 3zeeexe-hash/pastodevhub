// Public site config (feature switches + announcement), read with the public key so it also works during SSR.
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import type { FeatureFlags } from "@/lib/features";
import { normalizeSiteUrl, resolveSiteOrigin } from "@/lib/site-url";

export type SiteConfig = {
  flags: FeatureFlags;
  announcement: string | null;
  announcementLevel: "info" | "warning";
  /** Public origin of the site, e.g. https://pastodev.com (env SITE_URL, else the address of the request). */
  siteUrl: string | null;
  /** Google Search Console meta-tag token (env GOOGLE_SITE_VERIFICATION). */
  googleVerification: string | null;
  /** Alasan konfigurasi tidak terbaca (variabel server hilang atau database menolak). Kosong kalau semuanya baik. */
  error?: string | null;
};

export const getSiteConfig = createServerFn({ method: "GET" }).handler(async (): Promise<SiteConfig> => {
  let siteUrl: string | null = null;
  try {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    siteUrl = resolveSiteOrigin(process.env["SITE_URL"], getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).href);
  } catch {
    siteUrl = normalizeSiteUrl(process.env["SITE_URL"]);
  }
  const googleVerification = (process.env["GOOGLE_SITE_VERIFICATION"] ?? "").trim().replace(/^google-site-verification[=:]\s*/i, "") || null;
  const empty: SiteConfig = { flags: {}, announcement: null, announcementLevel: "info", siteUrl, googleVerification, error: null };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    // Sama seperti klien browser: nama variabel server (SUPABASE_*) atau yang berawalan VITE_ sama-sama dipakai.
    // Tanpa cadangan ini, server yang hanya punya variabel VITE_ membaca konfigurasi kosong, sehingga pengumuman dan saklar fitur tidak pernah berlaku.
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined);
    if (!url || !key) {
      const message = "Variabel SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY (atau VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY) belum ada di server.";
      console.error("site config:", message);
      return { ...empty, error: message };
    }
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
    const failure = flags.error?.message ?? settings.error?.message ?? null;
    if (failure) console.error("site config query failed:", failure);
    const out: FeatureFlags = {};
    for (const row of flags.data ?? []) out[row.key] = row.enabled;
    const s = settings.data as { announcement: string | null; announcement_level: string } | null;
    return {
      flags: out,
      announcement: s?.announcement?.trim() || null,
      announcementLevel: s?.announcement_level === "warning" ? "warning" : "info",
      siteUrl,
      googleVerification,
      error: failure ? `Database menolak pembacaan: ${failure}` : null,
    };
  } catch (e) {
    console.error("site config failed", e);
    return { ...empty, error: e instanceof Error ? e.message : "Konfigurasi situs gagal dibaca." };
  }
});

// Dipoles tiap menit dan saat tab dibuka lagi, supaya pengumuman dan saklar baru sampai ke pengunjung yang halamannya sudah terbuka.
export const siteConfigQuery = queryOptions({
  queryKey: ["site-config"],
  queryFn: () => getSiteConfig(),
  staleTime: 60_000,
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
});
