// Google sign-in through the owner's own Firebase project (configured in /admin or by env vars).
// Works without SUPABASE_SERVICE_ROLE_KEY: see src/lib/google-account.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { FirebaseWebConfig } from "@/lib/firebase-config";

/** Public: whether Firebase Google sign-in is on, plus the browser config (API key is public by design). */
export const getFirebasePublicConfig = createServerFn({ method: "GET" }).handler(async (): Promise<{ enabled: boolean; config: FirebaseWebConfig | null }> => {
  try {
    const { getFirebaseWebConfig } = await import("@/lib/platform-secrets.server");
    const s = await getFirebaseWebConfig();
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
    const { getFirebaseWebConfig } = await import("@/lib/platform-secrets.server");
    const settings = await getFirebaseWebConfig();
    if (!settings.enabled || !settings.config) throw new Error("Login Google lewat Firebase belum diaktifkan admin.");
    const projectId = settings.config.projectId;

    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
    let payload: Record<string, any>;
    try {
      ({ payload } = await jwtVerify(data.idToken, jwks, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId }));
    } catch (e) {
      console.error("Firebase ID token verification failed", e);
      throw new Error("Token Google tidak valid atau kedaluwarsa. Coba masuk lagi.");
    }
    const email = typeof payload["email"] === "string" ? payload["email"].toLowerCase() : "";
    if (!email || payload["email_verified"] !== true) throw new Error("Email Google belum terverifikasi.");
    if (payload["firebase"]?.sign_in_provider !== "google.com") throw new Error("Hanya login Google yang didukung.");

    const { signInGoogleUser } = await import("@/lib/google-account.server");
    return await signInGoogleUser({
      email,
      name: typeof payload["name"] === "string" ? payload["name"] : undefined,
      picture: typeof payload["picture"] === "string" ? payload["picture"] : undefined,
      accountType: data.accountType,
    });
  });
