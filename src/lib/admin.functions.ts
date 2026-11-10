// Admin sign-in (username + password from server env) and admin-only platform settings.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminEmailFor, checkAdminCredentials } from "@/lib/admin-rules";

/**
 * Checks the admin username/password against ADMIN_USERNAME / ADMIN_PASSWORD,
 * signs the admin account in on the server (no service-role key needed; see admin-login.server.ts),
 * and returns the session so the browser keeps the admin signed in.
 */
export const prepareAdminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) =>
    z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const env = { username: process.env["ADMIN_USERNAME"], password: process.env["ADMIN_PASSWORD"] };
    if (!env.username || !env.password) throw new Error("Login admin belum diatur di server.");
    if (!checkAdminCredentials(data, env)) {
      await new Promise((r) => setTimeout(r, 800));
      throw new Error("Username atau kata sandi admin salah.");
    }
    const { loginAdmin } = await import("@/lib/admin-login.server");
    return await loginAdmin({
      username: env.username,
      adminPassword: env.password,
      email: adminEmailFor(env.username, process.env["ADMIN_EMAIL"]),
    });
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Khusus admin.");
}

function callbackUrl() {
  const request = getRequest();
  if (!request) return "";
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return new URL("/api/oauth/github/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
}

export const getAdminGithubSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { readGithubSettingsForAdmin } = await import("@/lib/platform-secrets.server");
    return { ...(await readGithubSettingsForAdmin()), callbackUrl: callbackUrl() };
  });

export const saveAdminGithubSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; clientSecret: string }) =>
    z.object({
      clientId: z.string().trim().max(100).regex(/^[A-Za-z0-9._-]*$/, "Client ID tidak valid"),
      clientSecret: z.string().trim().max(200),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { writeGithubSettings } = await import("@/lib/platform-secrets.server");
    await writeGithubSettings(data.clientId, data.clientSecret || null);
    return { ok: true };
  });

export const getAdminFirebaseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { readFirebaseSettings } = await import("@/lib/platform-secrets.server");
    const request = getRequest();
    let origin = "";
    if (request) {
      const url = new URL(request.url);
      const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
      origin = sandboxHost ?? url.host;
    }
    return { ...(await readFirebaseSettings()), siteDomain: origin };
  });

export const saveAdminFirebaseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean; configText: string; serviceAccountJson: string; clear?: boolean | undefined }) =>
    z.object({
      enabled: z.boolean(),
      configText: z.string().max(5000),
      serviceAccountJson: z.string().max(20000),
      clear: z.boolean().optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { parseFirebaseConfig, parseServiceAccount } = await import("@/lib/firebase-config");
    const { readFirebaseSettings, writeFirebaseSettings } = await import("@/lib/platform-secrets.server");
    if (data.clear) {
      await writeFirebaseSettings({ enabled: false, config: null, serviceAccount: null, clear: true });
      return { ok: true };
    }
    const current = await readFirebaseSettings();
    const config = data.configText.trim() ? parseFirebaseConfig(data.configText) : null;
    const sa = data.serviceAccountJson.trim() ? parseServiceAccount(data.serviceAccountJson) : null;
    const projectId = config?.projectId ?? current.projectId;
    if (sa && projectId && sa.projectId !== projectId) throw new Error(`Service account milik project "${sa.projectId}", tapi config web milik "${projectId}".`);
    if (data.enabled && !(config ?? current.config)) throw new Error("Isi config Firebase dulu sebelum mengaktifkan.");
    await writeFirebaseSettings({
      enabled: data.enabled,
      config,
      serviceAccount: sa ? { json: data.serviceAccountJson.trim(), clientEmail: sa.clientEmail } : null,
      clear: false,
    });
    return { ok: true };
  });
