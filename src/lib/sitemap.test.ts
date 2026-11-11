import { describe, expect, it } from "vitest";
import { SITEMAP_MAX_URLS, buildSitemapIndex, buildUrlset, isSitemapName, lastmodOf } from "./sitemap";
import { normalizeSiteUrl, resolveSiteOrigin, xmlEscape } from "./site-url";

describe("normalizeSiteUrl / resolveSiteOrigin", () => {
  it("reduces any address to its origin", () => {
    expect(normalizeSiteUrl("https://pastodev.com/path/?a=1")).toBe("https://pastodev.com");
    expect(normalizeSiteUrl("pastodev.com")).toBe("https://pastodev.com");
    expect(normalizeSiteUrl("  ")).toBeNull();
    expect(normalizeSiteUrl("javascript:alert(1)")).toBeNull();
  });
  it("prefers SITE_URL, falls back to the request address", () => {
    expect(resolveSiteOrigin("https://pastodev.com", "http://127.0.0.1:3000/x")).toBe("https://pastodev.com");
    expect(resolveSiteOrigin(undefined, "https://app.example.dev/sitemap.xml?x=1")).toBe("https://app.example.dev");
  });
});

describe("xmlEscape", () => {
  it("escapes all five XML special characters", () => expect(xmlEscape(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;"));
});

describe("buildUrlset", () => {
  it("writes loc, valid lastmod and https images, escaping everything", () => {
    const xml = buildUrlset("https://x.id", [
      { path: "/karya/1", lastmod: "2026-11-01T10:00:00+00:00", images: ["https://img.x/a&b.png", "http://insecure/x.png"] },
      { path: "/budi" },
      { path: "/bad-date", lastmod: "not a date" },
    ]);
    expect(xml).toContain("<loc>https://x.id/karya/1</loc>");
    expect(xml).toContain("<lastmod>2026-11-01T10:00:00.000Z</lastmod>");
    expect(xml).toContain("<image:loc>https://img.x/a&amp;b.png</image:loc>");
    expect(xml).not.toContain("insecure");
    expect(xml.match(/<lastmod>/g)).toHaveLength(1); // unknown dates are left out, never invented
  });
  it("is still valid XML with no urls and never exceeds the 50,000 URL limit", () => {
    expect(buildUrlset("https://x.id", [])).toMatch(/<urlset[^>]*>\n<\/urlset>/);
    const many = Array.from({ length: SITEMAP_MAX_URLS + 5 }, (_, i) => ({ path: `/u/${i}` }));
    expect(buildUrlset("https://x.id", many).match(/<url>/g)).toHaveLength(SITEMAP_MAX_URLS);
  });
});

describe("buildSitemapIndex", () => {
  it("lists child sitemaps with their last change", () => {
    const xml = buildSitemapIndex("https://x.id", [{ name: "pages" }, { name: "karya", lastmod: "2026-11-01T00:00:00Z" }]);
    expect(xml).toContain("<loc>https://x.id/sitemap-pages.xml</loc>");
    expect(xml).toContain("<loc>https://x.id/sitemap-karya.xml</loc>\n    <lastmod>2026-11-01T00:00:00.000Z</lastmod>");
  });
});

describe("isSitemapName / lastmodOf", () => {
  it("only accepts known child sitemaps", () => {
    expect(isSitemapName("karya")).toBe(true);
    expect(isSitemapName("../etc")).toBe(false);
  });
  it("normalises dates", () => {
    expect(lastmodOf("2026-11-01")).toBe("2026-11-01T00:00:00.000Z");
    expect(lastmodOf(null)).toBeNull();
  });
});
