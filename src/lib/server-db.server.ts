// Server-only database access that needs ONLY the publishable key (no SUPABASE_SERVICE_ROLE_KEY),
// so it also runs on a self-hosted deploy (Firebase, Cloud Run, …).
//
// Privileged server work (platform settings, terminal git) sends a secret "proof" header derived
// from APP_USER_CONNECTION_KEY_SECRET. The database keeps only its SHA-256 hash (public.server_proof)
// and row-level rules allow those tables when the header matches. The admin login registers the hash.
import { createHash, createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;
export const PROOF_HEADER = "x-pastodev-proof";

/** Secret proof value; never leaves the server. */
export function serverProof() {
  const key = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!key) throw new Error("APP_USER_CONNECTION_KEY_SECRET belum diatur di server.");
  return createHmac("sha256", key).update("pastodev-server-proof:v1").digest("base64url");
}

/** What the database stores (hex SHA-256 of the proof). */
export function serverProofHash() {
  return createHash("sha256").update(serverProof()).digest("hex");
}

/** A fresh publishable-key client without a stored session. */
export function publicDb(extraHeaders: Record<string, string> = {}): Db {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Pengaturan server belum lengkap (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Publishable-key client that carries the server proof (see file header). */
export function serverDb(): Db {
  return publicDb({ [PROOF_HEADER]: serverProof() });
}

/** Registers the proof hash; needs a client signed in as an admin. Safe to call repeatedly. */
export async function registerServerProof(adminClient: SupabaseClient) {
  const { error } = await adminClient.rpc("admin_register_server_proof", { _hash: serverProofHash() });
  if (error) throw new Error(error.message);
}

/** True when the database accepts this server's proof (i.e. an admin has signed in since setup). */
export async function serverProofAccepted(db: Db = serverDb()) {
  const { data, error } = await db.rpc("server_proof_ok");
  return !error && data === true;
}

export const SETUP_HINT = "Server belum terhubung ke database. Masuk sekali di /admin dengan akun admin untuk menyelesaikan setup.";
