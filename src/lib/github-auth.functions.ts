// Sign in with GitHub, using the GitHub OAuth app the admin set in /admin/integrasi
// (Client ID + Secret, or GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET on the server).
// Works without SUPABASE_SERVICE_ROLE_KEY: the verified GitHub e-mail becomes a Pastodev session through
// src/lib/google-account.server.ts, exactly like Google sign-in.
// Separate from the "connect GitHub" flow in github.functions.ts: login asks only for the profile and
// e-mail, never for repo access, and stores no GitHub token.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const LOGIN_SCOPES = ["read:user", "user:email"];
const NOT_CONFIGURED = "Login GitHub belum diatur admin. Isi Client ID & Secret GitHub di Admin → Integrasi.";

function returnUrl() {
  const request = getRequest();
  if (!request) throw new Error("Login GitHub harus dimulai dari halaman aplikasi.");
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return new URL("/api/oauth/github/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
}

/** Stops sign-in while the admin has switched the GitHub feature off. A failed lookup does not block. */
async function requireGithubFeature() {
  try {
    const { publicDb } = await import("@/lib/server-db.server");
    const { data } = await publicDb().rpc("feature_allowed", { _key: "github" });
    if (data === false) throw new Error("Fitur GitHub sedang dinonaktifkan admin.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Fitur GitHub")) throw e;
  }
}

/** Where the popup should go to ask the person for GitHub consent. The code comes back through /api/oauth/github/return. */
export const startGithubLogin = createServerFn({ method: "POST" }).handler(async () => {
  await requireGithubFeature();
  const { getGithubOAuthConfig } = await import("@/lib/platform-secrets.server");
  const cfg = await getGithubOAuthConfig();
  if (!cfg) throw new Error(NOT_CONFIGURED);
  const state = crypto.randomUUID();
  const authorizationUrl =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(cfg.clientId)}` +
    `&redirect_uri=${encodeURIComponent(returnUrl())}&scope=${encodeURIComponent(LOGIN_SCOPES.join(" "))}&state=${state}`;
  return { authorizationUrl, state };
});

type GithubEmail = { email: string; primary: boolean; verified: boolean };

async function githubGet<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "User-Agent": "Pastodev-App",
    },
  });
  if (!res.ok) {
    console.error(`GitHub request failed [${res.status}] ${path}`);
    return null;
  }
  return (await res.json()) as T;
}

/**
 * Exchanges the GitHub code for the person's verified primary e-mail, then finds or creates the matching
 * Pastodev account and returns a session for the browser. Only an e-mail GitHub has verified is accepted.
 */
export const githubSignIn = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; accountType?: string | undefined }) =>
    z.object({ code: z.string().min(1).max(2000), accountType: z.enum(["client", "developer"]).optional() }).parse(input))
  .handler(async ({ data }) => {
    await requireGithubFeature();
    const { getGithubOAuthConfig } = await import("@/lib/platform-secrets.server");
    const cfg = await getGithubOAuthConfig();
    if (!cfg) throw new Error(NOT_CONFIGURED);

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code: data.code }),
    });
    if (!tokenRes.ok) throw new Error(`Gagal menukar kode GitHub (${tokenRes.status}). Coba masuk lagi.`);
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
    const token = tokenData.access_token;
    if (!token) throw new Error(tokenData.error_description || tokenData.error || "GitHub tidak mengembalikan token. Coba masuk lagi.");

    const me = await githubGet<{ login: string; name: string | null; avatar_url: string | null }>(token, "/user");
    const emails = await githubGet<GithubEmail[]>(token, "/user/emails");
    if (!me || !emails) throw new Error("Gagal membaca akun GitHub. Pastikan izin email diberikan, lalu coba lagi.");
    const verified = emails.filter((e) => e.verified);
    const picked = verified.find((e) => e.primary) ?? verified[0];
    if (!picked) throw new Error("Akun GitHub kamu belum punya email yang terverifikasi. Verifikasi emailnya di GitHub, lalu coba lagi.");

    const { signInGoogleUser } = await import("@/lib/google-account.server");
    return await signInGoogleUser({
      email: picked.email.toLowerCase(),
      name: me.name || me.login,
      ...(me.avatar_url ? { picture: me.avatar_url } : {}),
      accountType: data.accountType === "client" || data.accountType === "developer" ? data.accountType : undefined,
      provider: "github",
    });
  });
