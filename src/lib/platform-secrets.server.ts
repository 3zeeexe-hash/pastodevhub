// Server-only: platform settings the admin sets in the panel (GitHub OAuth app).
// Stored in a table only the app server can read (server proof); secrets are encrypted.
import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connectionKeyCrypto.server";
import { firebaseConfigFromEnv, type FirebaseWebConfig } from "@/lib/firebase-config";

// Uses the publishable key plus the server proof — no SUPABASE_SERVICE_ROLE_KEY needed.
async function admin() {
  const { serverDb } = await import("@/lib/server-db.server");
  return serverDb();
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

// ---------- Firebase (Google sign-in with the owner's own Firebase project) ----------

export type FirebaseSettings = { enabled: boolean; config: FirebaseWebConfig | null; projectId: string | null; clientEmail: string | null; hasServiceAccount: boolean; updatedAt: string | null };

export async function readFirebaseSettings(): Promise<FirebaseSettings> {
  const db = await admin();
  const { data } = await db.from("platform_secrets")
    .select("firebase_enabled,firebase_config,firebase_project_id,firebase_client_email,firebase_service_account_ciphertext,updated_at").eq("id", 1).maybeSingle();
  return {
    enabled: !!data?.firebase_enabled,
    config: (data?.firebase_config as unknown as FirebaseWebConfig | null) ?? null,
    projectId: data?.firebase_project_id ?? null,
    clientEmail: data?.firebase_client_email ?? null,
    hasServiceAccount: !!data?.firebase_service_account_ciphertext,
    updatedAt: data?.updated_at ?? null,
  };
}

export async function writeFirebaseSettings(input: { enabled: boolean; config: FirebaseWebConfig | null; serviceAccount: { json: string; clientEmail: string } | null; clear: boolean }) {
  const db = await admin();
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  if (input.clear) {
    Object.assign(row, { firebase_enabled: false, firebase_config: null, firebase_project_id: null, firebase_client_email: null, firebase_service_account_ciphertext: null });
  } else {
    row["firebase_enabled"] = input.enabled;
    if (input.config) { row["firebase_config"] = input.config; row["firebase_project_id"] = input.config.projectId; }
    if (input.serviceAccount) {
      row["firebase_service_account_ciphertext"] = encryptConnectionKey(input.serviceAccount.json);
      row["firebase_client_email"] = input.serviceAccount.clientEmail;
    }
  }
  const { error } = await db.from("platform_secrets").upsert(row as never);
  if (error) throw new Error(error.message);
}

export type FirebaseWebState = { enabled: boolean; config: FirebaseWebConfig | null; source: "admin" | "env" | "none" };

/**
 * The browser config used for Google sign-in. The admin panel wins (including switching it off);
 * FIREBASE_WEB_CONFIG / FIREBASE_API_KEY + FIREBASE_PROJECT_ID are the fallback so Google login
 * does not depend on the admin having registered the server proof first.
 */
export async function getFirebaseWebConfig(): Promise<FirebaseWebState> {
  try {
    const s = await readFirebaseSettings();
    if (s.config) return { enabled: s.enabled, config: s.enabled ? s.config : null, source: "admin" };
  } catch (e) {
    console.error("Reading Firebase settings failed", e);
  }
  const fromEnv = firebaseConfigFromEnv(process.env);
  return fromEnv ? { enabled: true, config: fromEnv, source: "env" } : { enabled: false, config: null, source: "none" };
    }
