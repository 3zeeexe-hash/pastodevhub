// Browser-only: Google sign-in popup through the owner's Firebase project.
import type { FirebaseWebConfig } from "@/lib/firebase-config";

const MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": "Jendela login Google ditutup.",
  "auth/cancelled-popup-request": "Jendela login Google ditutup.",
  "auth/popup-blocked": "Browser memblokir jendela login. Izinkan pop-up lalu coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase (Authentication → Settings → Authorized domains).",
  "auth/operation-not-allowed": "Login Google belum diaktifkan di Firebase (Authentication → Sign-in method → Google).",
  "auth/invalid-api-key": "API key Firebase tidak valid. Periksa config di panel admin.",
};

/** Opens the Google popup and returns a Firebase ID token. */
export async function firebaseGoogleIdToken(config: FirebaseWebConfig): Promise<string> {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import("firebase/auth");
  const name = `pastodev-${config.projectId}-${config.apiKey.slice(-6)}`;
  const app = getApps().find((a) => a.name === name) ?? initializeApp(config, name);
  const auth = getAuth(app);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, provider);
    const token = await result.user.getIdToken();
    await signOut(auth); // Pastodev keeps its own session; Firebase is only the Google bridge.
    return token;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    throw new Error(MESSAGES[code] ?? "Gagal masuk dengan Google.");
  }
}
