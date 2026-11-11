// Browser-only: Google sign-in popup through the owner's Firebase project.
import type { Auth } from "firebase/auth";
import type { FirebaseWebConfig } from "@/lib/firebase-config";

const MESSAGES: Record<string, string> = {
  "auth/popup-closed-by-user": "Jendela login Google ditutup.",
  "auth/cancelled-popup-request": "Jendela login Google ditutup.",
  "auth/popup-blocked": "Browser memblokir jendela login. Izinkan pop-up lalu coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase (Authentication → Settings → Authorized domains).",
  "auth/operation-not-allowed": "Login Google belum diaktifkan di Firebase (Authentication → Sign-in method → Google).",
  "auth/invalid-api-key": "API key Firebase tidak valid. Periksa config di panel admin.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "API key Firebase tidak valid. Periksa config di panel admin.",
  "auth/network-request-failed": "Koneksi terputus. Periksa internet lalu coba lagi.",
  "auth/user-disabled": "Akun Google ini dinonaktifkan.",
  "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
  "auth/web-storage-unsupported": "Browser memblokir penyimpanan (cookie/storage). Aktifkan lalu coba lagi.",
};

type Prepared = { auth: Auth; mod: typeof import("firebase/auth") };
const prepared = new Map<string, Promise<Prepared>>();

function prepare(config: FirebaseWebConfig): Promise<Prepared> {
  const name = `pastodev-${config.projectId}-${config.apiKey.slice(-6)}`;
  let p = prepared.get(name);
  if (!p) {
    p = (async () => {
      const [{ initializeApp, getApps }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      const app = getApps().find((a) => a.name === name) ?? initializeApp(config, name);
      return { auth: mod.getAuth(app), mod };
    })();
    p.catch(() => prepared.delete(name));
    prepared.set(name, p);
  }
  return p;
}

/**
 * Loads and initialises Firebase ahead of the tap. Browsers (Safari, in-app browsers) only allow
 * the Google popup right after a tap, so nothing slow may happen between the tap and the popup.
 */
export function preloadFirebase(config: FirebaseWebConfig) {
  void prepare(config).catch(() => {});
}

/** Opens the Google popup and returns a Firebase ID token. */
export async function firebaseGoogleIdToken(config: FirebaseWebConfig): Promise<string> {
  try {
    const { auth, mod } = await prepare(config);
    const provider = new mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await mod.signInWithPopup(auth, provider);
    const token = await result.user.getIdToken();
    await mod.signOut(auth).catch(() => {}); // Pastodev keeps its own session; Firebase is only the Google bridge.
    return token;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    console.error("Firebase Google sign-in failed", e);
    throw new Error(MESSAGES[code] ?? `Gagal masuk dengan Google${code ? ` (${code})` : ""}.`);
  }
}
