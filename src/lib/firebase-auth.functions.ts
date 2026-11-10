// Google sign-in through the owner's own Firebase project (configured in /admin).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { FirebaseWebConfig } from "@/lib/firebase-config";

/** Public: whether Firebase Google sign-in is on, plus the browser config (API key is public by design). */
export const getFirebasePublicConfig = createServerFn({ method: "GET" }).handler(async (): Promise<{ enabled: boolean; config: FirebaseWebConfig | null }> => {
  try {
    const { readFirebaseSettings } = await import("@/lib/platform-secrets.server");
    const s = await readFirebaseSettings();
    return s.enabled && s.config ? { enabled: true, config: s.config } : { enabled: false, config: null };
  } catch (e) {
    console.error("Reading Firebase settings failed", e);
    return { enabled: false, config: null };
  }
});

/**
 * Verifies a Firebase ID token from Google sign-in, finds or creates the matching
 * Pastodev account by verified email, and returns a session for the browser.
 */
export const firebaseSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: { idToken: string; accountType?: string | undefined }) =>
    z.object({ idToken: z.string().min(100).max(5000), accountType: z.enum(["client", "developer"]).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { readFirebaseSettings } = await import("@/lib/platform-secrets.server");
    const settings = await readFirebaseSettings();
    if (!settings.enabled || !settings.config) throw new Error("Login Google lewat Firebase belum diaktifkan admin.");
    const projectId = settings.config.projectId;

    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
    let payload: Record<string, any>;
    try {
      ({ payload } = await jwtVerify(data.idToken, jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId }));
    } catch {
      throw new Error("Token Google tidak valid atau kedaluwarsa. Coba masuk lagi.");
    }
    const email = typeof payload["email"] === "string" ? payload["email"].toLowerCase() : "";
    if (!email || payload["email_verified"] !== true) throw new Error("Email Google belum terverifikasi.");
    if (payload["firebase"]?.sign_in_provider !== "google.com") throw new Error("Hanya login Google yang didukung.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: typeof payload["name"] === "string" ? payload["name"] : undefined,
        avatar_url: typeof payload["picture"] === "string" ? payload["picture"] : undefined,
        account_type: data.accountType,
        provider: "firebase-google",
      },
    });
    if (createErr && !/already|exists|registered/i.test(createErr.message)) throw new Error(createErr.message);

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link.properties?.hashed_token) throw new Error(linkErr?.message ?? "Gagal membuat sesi.");

    const { createClient } = await import("@supabase/supabase-js");
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
    const { data: verified, error: otpErr } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (otpErr || !verified.session) throw new Error(otpErr?.message ?? "Gagal membuat sesi.");
    return { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
  });
