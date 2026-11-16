// Klien database publik (kunci publishable) untuk kode server yang tidak perlu login: sitemap dan metadata SEO.
// Hanya baris yang memang boleh dilihat siapa saja yang bisa dibaca lewat klien ini.
import { createClient } from "@supabase/supabase-js";

/** Variabel server belum ada. Dipisah dari galat database supaya sitemap bisa menyebut penyebabnya. */
export class PublicDbConfigError extends Error {
  constructor() {
    super("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY belum ada di server.");
    this.name = "PublicDbConfigError";
  }
}

/**
 * Alamat dan kunci publik database. SUPABASE_* dibaca dulu, lalu VITE_SUPABASE_* (termasuk yang tertanam saat build),
 * sama seperti getSiteConfig. Tanpa cadangan ini, server yang hanya punya variabel VITE_ gagal membaca sitemap dan metadata SEO.
 */
export function publicDbConfig(): { url: string; key: string } | null {
  const env = process.env;
  const url = env["SUPABASE_URL"] || env["VITE_SUPABASE_URL"] || (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
  const key = env["SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"] || (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined);
  return url && key ? { url, key } : null;
}

/** Klien baru tanpa sesi tersimpan. */
export function publicAnon() {
  const cfg = publicDbConfig();
  if (!cfg) throw new PublicDbConfigError();
  const { url, key } = cfg;
  return createClient(url, key, {
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
}
