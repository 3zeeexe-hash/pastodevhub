// Server-only: turns a Google-verified e-mail into a Pastodev session using ONLY the publishable
// key. SUPABASE_SERVICE_ROLE_KEY is never needed, so it works the same on Lovable and on a
// self-hosted deploy (Firebase, Cloud Run, …).
//
// How: the account's real password is an HMAC of the e-mail with a server-only key
// (APP_USER_CONNECTION_KEY_SECRET). Nobody can type it, only this server can derive it, and it is
// long and random-looking so it passes the leaked-password check. The server has already verified
// the Google/Firebase ID token, so it signs in with that password — or creates the account first.
import { createHmac } from "node:crypto";

export type GoogleUserInfo = {
  email: string;
  name?: string | undefined;
  picture?: string | undefined;
  accountType?: "client" | "developer" | undefined;
};

export type SessionTokens = { access_token: string; refresh_token: string };

/** Deterministic account password for a Google user. Same e-mail (any letter case) → same password. */
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

/** Signs in or creates the account; always resolves to session tokens or throws a readable error. */
export async function signInGoogleUser(info: GoogleUserInfo): Promise<SessionTokens> {
  const email = info.email.trim().toLowerCase();
  const password = googleAccountPassword(email);
  const { publicDb } = await import("@/lib/server-db.server");
  const client = publicDb();

  const tokens = (s: { access_token: string; refresh_token: string }): SessionTokens => ({ access_token: s.access_token, refresh_token: s.refresh_token });

  /** Returns a session, null when the account is missing / has another password, throws otherwise. */
  async function trySignIn(): Promise<SessionTokens | null> {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (data.session) return tokens(data.session);
    if (!error) return null;
    if (/email not confirmed/i.test(error.message)) {
      throw new Error("Email kamu belum dikonfirmasi. Cek kotak masuk untuk link konfirmasi, lalu masuk dengan Google lagi.");
    }
    if (/invalid login credentials/i.test(error.message)) return null;
    throw new Error(error.message);
  }

  const existing = await trySignIn();
  if (existing) return existing;

  const meta: Record<string, string> = { provider: "firebase-google" };
  if (info.name) meta["full_name"] = info.name;
  if (info.picture) meta["avatar_url"] = info.picture;
  if (info.accountType) meta["account_type"] = info.accountType;

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
    "Akun dibuat, tapi email perlu dikonfirmasi dulu. Cek kotak masuk kamu, lalu masuk dengan Google lagi. " +
      "(Admin: matikan “Confirm email” di pengaturan Auth backend agar langsung masuk.)",
  );
}
