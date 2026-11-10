// Server-only: platform settings the admin sets in the panel (GitHub OAuth app).
// Stored in a table only the server can read; the client secret is encrypted.
import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GithubOAuthConfig = { clientId: string; clientSecret: string; source: "admin" | "env" };

/** Admin panel settings win; environment variables are the fallback (e.g. self-hosted). */
export async function getGithubOAuthConfig(): Promise<GithubOAuthConfig | null> {
  try {
    const db = await admin();
    const { data } = await db.from("platform_secrets").select("github_client_id,github_client_secret_ciphertext").eq("id", 1).maybeSingle();
    if (data?.github_client_id && data.github_client_secret_ciphertext) {
      return { clientId: data.github_client_id, clientSecret: decryptConnectionKey(data.github_client_secret_ciphertext), source: "admin" };
    }
  } catch (e) {
    console.error("Reading GitHub settings failed", e);
  }
  const clientId = process.env["GITHUB_CLIENT_ID"];
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
  return clientId && clientSecret ? { clientId, clientSecret, source: "env" } : null;
}

export async function readGithubSettingsForAdmin() {
  const db = await admin();
  const { data } = await db.from("platform_secrets").select("github_client_id,github_client_secret_ciphertext,updated_at").eq("id", 1).maybeSingle();
  return {
    clientId: data?.github_client_id ?? "",
    hasSecret: !!data?.github_client_secret_ciphertext,
    updatedAt: data?.updated_at ?? null,
    envFallback: !!(process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]),
  };
}

export async function writeGithubSettings(clientId: string, clientSecret: string | null) {
  const db = await admin();
  const row: Record<string, unknown> = { id: 1, github_client_id: clientId || null, updated_at: new Date().toISOString() };
  if (clientSecret) row["github_client_secret_ciphertext"] = encryptConnectionKey(clientSecret);
  if (!clientId) row["github_client_secret_ciphertext"] = null;
  const { error } = await db.from("platform_secrets").upsert(row as never);
  if (error) throw new Error(error.message);
}
