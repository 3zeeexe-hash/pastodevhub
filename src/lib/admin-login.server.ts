// Server-only helpers for the admin sign-in.
//
// The sign-in itself only needs the PUBLISHABLE key, so it works without SUPABASE_SERVICE_ROLE_KEY
// (self-hosted deploys, or a backend that was never connected). The service-role key is used only as
// an optional extra when it happens to be present: to repair an out-of-sync admin account.
import { createHmac } from "node:crypto";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunctionError } from "@/lib/admin-rules";

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

/** A throw-away client that uses only the publishable key; it keeps its session in memory. */
function publicClient(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Pengaturan server belum lengkap (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).");
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

/** Signs in; returns null only when the account does not exist or the password does not match. */
async function signIn(client: SupabaseClient, email: string, password: string): Promise<Session | null> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return data.session;
}

/** Creates the admin account with the publishable key. Needs e-mail sign-up open with auto-confirm. */
async function signUpAdmin(client: SupabaseClient, username: string, email: string, password: string): Promise<Session> {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { username: username.toLowerCase(), full_name: "Admin Pastodev", account_type: "client" } },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) throw accountMismatch();
    throw new Error(error.message);
  }
  if (!data.session) throw accountMismatch();
  return data.session;
}

function accountMismatch() {
  return new Error(
    "Akun admin belum bisa dibuat/dimasuki otomatis. Pastikan pendaftaran email aktif dengan auto-confirm, " +
      "atau jika akun admin sudah ada, ADMIN_PASSWORD dan APP_USER_CONNECTION_KEY_SECRET harus sama dengan saat akun itu dibuat.",
  );
}

async function hasAdminRole(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !error && !!data;
}

/** Grants the admin role through the database function from supabase/admin-claim.sql (no service key). */
async function claimAdminRole(client: SupabaseClient, adminPassword: string) {
  const { error } = await client.rpc("claim_admin_role", { _code: adminPassword });
  if (!error) return;
  if (isMissingFunctionError(error)) {
    throw new Error("Setup admin belum dijalankan: jalankan file supabase/admin-claim.sql sekali di SQL editor backend.");
  }
  throw new Error(error.message);
}

/** Optional: only when SUPABASE_SERVICE_ROLE_KEY exists. Creates/repairs the admin account and its role. */
async function provisionWithServiceRole(username: string, email: string, accountPassword: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (list.users.length < 200) break;
  }
  if (userId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: accountPassword, email_confirm: true });
    if (error) throw new Error(error.message);
  } else {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: accountPassword, email_confirm: true,
      app_metadata: { pastodev_admin: true },
      user_metadata: { username: username.toLowerCase(), full_name: "Admin Pastodev", account_type: "client" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Gagal membuat akun admin.");
    userId = created.user.id;
  }
  const { error: roleErr } = await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (roleErr) throw new Error(roleErr.message);
}

/**
 * Signs the admin in on the server and returns the session tokens for the browser.
 * Order: plain sign-in → (service key, if present) repair the account → create the account with the
 * publishable key → make sure the account has the admin role.
 */
export async function loginAdmin(input: { username: string; adminPassword: string; email: string }) {
  const accountPassword = adminAccountPassword(input.adminPassword);
  const hasServiceKey = !!process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const client = publicClient();

  let session = await signIn(client, input.email, accountPassword);
  if (!session && hasServiceKey) {
    await provisionWithServiceRole(input.username, input.email, accountPassword);
    session = await signIn(client, input.email, accountPassword);
  }
  if (!session) session = await signUpAdmin(client, input.username, input.email, accountPassword);

  if (!(await hasAdminRole(client, session.user.id))) {
    await claimAdminRole(client, input.adminPassword);
    if (!(await hasAdminRole(client, session.user.id))) throw new Error("Akun ini belum punya role admin.");
  }
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}
