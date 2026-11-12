// Server-only: turns a provider-verified e-mail (Google or GitHub) into a Pastodev session.
//
// How: the account's real password is an HMAC of the e-mail with a server-only key
// (APP_USER_CONNECTION_KEY_SECRET). Nobody can type it, only this server can derive it, and it is
// long and random-looking so it passes the leaked-password check. The server has already verified
// the Google/GitHub identity, so it signs in with that password — or creates the account first.
//
// No e-mail confirmation step: the provider has already verified the address, so the account is
// created as confirmed and the person lands straight in the app. Creating a confirmed account needs
// the admin API, so it is used whenever SUPABASE_SERVICE_ROLE_KEY exists (Lovable Cloud has it).
// Without that key (self-hosted deploy) it falls back to the publishable key and then relies on the
// backend's "Confirm email" switch being off.
import { createHmac } from "node:crypto";

export type GoogleUserInfo = {
  email: string;
  name?: string | undefined;
  picture?: string | undefined;
  accountType?: "client" | "developer" | undefined;
  /** Where the identity came from; stored in the account metadata. Defaults to the Firebase Google bridge. */
  provider?: "firebase-google" | "github" | undefined;
};

export type SessionTokens = { access_token: string; refresh_token: string };

/** Deterministic account password for a provider user. Same e-mail (any letter case) → same password. */
export function googleAccountPassword(email: string, secret: string | undefined = process.env["APP_USER_CONNECTION_KEY_SECRET"]): string {
  if (!secret) throw new Error("APP_USER_CONNECTION_KEY_SECRET belum diatur di server.");
  const digest = createHmac("sha256", secret).update(`pastodev-google:${email.trim().toLowerCase()}`).digest("base64url");
  return `${digest}Gg1!`;
}

function emailTaken() {
  return new Error(
    "Email ini sudah terdaftar dengan kata sandi biasa. Masuk dengan email & kata sandi, atau pakai “Lupa?” untuk membuat kata sandi baru.",
  );
}

/** The admin API client, or null when this deploy has no service key (self-hosted). */
async function adminApi() {
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin.auth.admin;
}

/** Finds an existing account id by e-mail. The admin API has no direct lookup, so pages are scanned (bounded). */
async function findUserId(admin: NonNullable<Awaited<ReturnType<typeof adminApi>>>, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Signs in or creates the account; always resolves to session tokens or throws a readable error. */
export async function signInGoogleUser(info: GoogleUserInfo): Promise<SessionTokens> {
  const email = info.email.trim().toLowerCase();
  const password = googleAccountPassword(email);
  const { publicDb } = await import("@/lib/server-db.server");
  const client = publicDb();
  const admin = await adminApi();

  const tokens = (s: { access_token: string; refresh_token: string }): SessionTokens => ({ access_token: s.access_token, refresh_token: s.refresh_token });

  /** Returns a session, null when the account is missing / has another password, throws otherwise. */
  async function trySignIn(allowConfirm = true): Promise<SessionTokens | null> {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (data.session) return tokens(data.session);
    if (!error) return null;
    if (/email not confirmed/i.test(error.message)) {
      // Left over from before sign-in skipped confirmation: the provider verified this address, so confirm it now.
      if (admin && allowConfirm) {
        const id = await findUserId(admin, email);
        if (id) {
          const { error: confirmErr } = await admin.updateUserById(id, { email_confirm: true });
          if (!confirmErr) return trySignIn(false);
        }
      }
      throw new Error("Email kamu belum dikonfirmasi dan tidak bisa dikonfirmasi otomatis. Minta admin mematikan “Confirm email” di pengaturan Auth backend.");
    }
    if (/invalid login credentials/i.test(error.message)) return null;
    throw new Error(error.message);
  }

  const existing = await trySignIn();
  if (existing) return existing;

  const meta: Record<string, string> = { provider: info.provider ?? "firebase-google" };
  if (info.name) meta["full_name"] = info.name;
  if (info.picture) meta["avatar_url"] = info.picture;
  if (info.accountType) meta["account_type"] = info.accountType;

  // Preferred: create the account already confirmed, then sign in. No e-mail is sent.
  if (admin) {
    const { error: createErr } = await admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) throw new Error(createErr.message);
    // Two taps at once, or an address that already has another password, both end up here.
    const session = await trySignIn();
    if (session) return session;
    throw emailTaken();
  }

  const { data: created, error: signUpErr } = await client.auth.signUp({ email, password, options: { data: meta } });
  if (signUpErr) {
    if (/already|registered|exists/i.test(signUpErr.message)) {
      // Two taps at once can create the account in between: try the password once more.
      const retry = await trySignIn();
      if (retry) return retry;
      throw emailTaken();
    }
    throw new Error(signUpErr.message);
  }
  if (created.session) return tokens(created.session);
  // With e-mail confirmation on, an address that already exists comes back as a user without identities.
  if (created.user && Array.isArray(created.user.identities) && created.user.identities.length === 0) throw emailTaken();
  throw new Error(
    "Akun dibuat, tapi email perlu dikonfirmasi dulu. Cek kotak masuk kamu, lalu masuk lagi. " +
      "(Admin: matikan “Confirm email” di pengaturan Auth backend agar langsung masuk.)",
  );
}
