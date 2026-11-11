// XML builders for the sitemaps (pure, no database). The data side lives in sitemap.server.ts.
import { xmlEscape } from "@/lib/site-url";

export const SITEMAP_NAMES = ["pages", "karya", "jasa", "lowongan", "diskusi", "developer", "repo", "toko"] as const;
export type SitemapName = (typeof SITEMAP_NAMES)[number];

export const isSitemapName = (s: string): s is SitemapName => (SITEMAP_NAMES as readonly string[]).includes(s);

/** Google accepts at most 50,000 URLs (and 50 MB) per sitemap file. */
export const SITEMAP_MAX_URLS = 50_000;

export type SitemapUrl = {
  /** Path starting with "/", already URL-encoded. */
  path: string;
  /** ISO date of the last real content change. Left out when unknown, never invented. */
  lastmod?: string | null | undefined;
  /** Absolute https image URLs shown with the page (Google Images). */
  images?: string[] | undefined;
};

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** Valid W3C datetime for <lastmod>, or null when the value is not a usable date. */
export function lastmodOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function buildUrlset(origin: string, urls: SitemapUrl[]): string {
  const rows = urls.slice(0, SITEMAP_MAX_URLS).map((u) => {
    const lastmod = lastmodOf(u.lastmod);
    const images = (u.images ?? []).filter((i) => /^https:\/\//.test(i)).slice(0, 5);
    return [
      "  <url>",
      `    <loc>${xmlEscape(origin + u.path)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
      ...images.map((i) => `    <image:image><image:loc>${xmlEscape(i)}</image:loc></image:image>`),
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `${XML_HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join("\n")}${rows.length ? "\n" : ""}</urlset>\n`;
}

export function buildSitemapIndex(origin: string, items: { name: SitemapName; lastmod?: string | null | undefined }[]): string {
  const rows = items.map((i) => {
    const lastmod = lastmodOf(i.lastmod);
    return `  <sitemap>\n    <loc>${xmlEscape(`${origin}/sitemap-${i.name}.xml`)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </sitemap>`;
  });
  return `${XML_HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}${rows.length ? "\n" : ""}</sitemapindex>\n`;
  }
