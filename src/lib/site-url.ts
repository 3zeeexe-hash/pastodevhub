// Which address the site is served from. Used for sitemap, robots.txt, canonical links and og:url.
// Pure helpers, safe on server and client.

/** "https://pastodev.com/anything" -> "https://pastodev.com". Returns null when it is not an http(s) address. */
export function normalizeSiteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The public origin of the site. `SITE_URL` (the real domain) wins; without it the address the
 * request came in on is used, which is already correct on a single-domain deploy.
 */
export function resolveSiteOrigin(configured: string | null | undefined, requestUrl: string): string {
  return normalizeSiteUrl(configured) ?? new URL(requestUrl).origin;
}

/**
 * Same as resolveSiteOrigin, but for a server that sits behind a proxy: without `SITE_URL`, the public host is read from
 * X-Forwarded-Host / X-Forwarded-Proto (the request URL then only holds the internal address). Set `SITE_URL` on the server
 * so the sitemap and canonical links never depend on headers a visitor can send.
 */
export function resolveRequestOrigin(configured: string | null | undefined, request: { url: string; headers: { get(name: string): string | null } }): string {
  const fromEnv = normalizeSiteUrl(configured);
  if (fromEnv) return fromEnv;
  const first = (v: string | null) => (v ?? "").split(",")[0]?.trim() ?? "";
  const host = first(request.headers.get("x-forwarded-host"));
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
    const proto = first(request.headers.get("x-forwarded-proto")).toLowerCase() === "http" ? "http" : "https";
    const origin = normalizeSiteUrl(`${proto}://${host}`);
    if (origin) return origin;
  }
  return new URL(request.url).origin;
}

/** Escapes text for an XML element or attribute. */
export function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
