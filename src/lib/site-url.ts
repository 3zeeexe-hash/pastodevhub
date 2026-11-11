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

/** Escapes text for an XML element or attribute. */
export function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
