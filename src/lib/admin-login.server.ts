// Server-only helpers for the admin sign-in.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * The admin account's real sign-in password is derived from ADMIN_PASSWORD with a server key,
 * so it is long and random-looking (passes the leaked-password check) and never leaves the server.
 */
export function adminAccountPassword(adminPassword: string) {
  const key = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!key) throw new Error("APP_USER_CONNECTION_KEY_SECRET belum diatur di server.");
  const digest = createHmac("sha256", key).update(`pastodev-admin:${adminPassword}`).digest("base64url");
  return `${digest}Aa1!`;
}

/** Signs the admin in on the server and returns the session tokens for the browser. */
export async function signInAdmin(email: string, password: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Pengaturan server belum lengkap.");
  const client = createClient(url, key, {
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
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? "Gagal masuk sebagai admin.");
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}
