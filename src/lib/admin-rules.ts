// Pure rules for the admin sign-in. Shared by the server function and tests.

/** Compares two strings without leaking where they differ. */
export function safeEqual(a: string, b: string) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True only when admin login is configured and both username and password match exactly. */
export function checkAdminCredentials(
  input: { username: string; password: string },
  env: { username?: string | undefined; password?: string | undefined },
) {
  if (!env.username || !env.password) return false;
  const user = safeEqual(input.username.trim().toLowerCase(), env.username.trim().toLowerCase());
  const pass = safeEqual(input.password, env.password);
  return user && pass;
}

/** True when PostgREST says the called database function does not exist (setup SQL not run yet). */
export function isMissingFunctionError(error: { code?: string | undefined; message?: string | undefined } | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message ?? "");
}

/** Internal sign-in email for the admin account (never shown to visitors). */
export function adminEmailFor(username: string, override?: string | undefined) {
  if (override && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(override)) return override.toLowerCase();
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "admin";
  return `${clean}@admin.pastodev.app`;
}
