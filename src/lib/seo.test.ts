import { describe, expect, it } from "vitest";
import { canonicalUrl, cleanPath, jobPostingLd, robotsForPath, robotsTxt, rootSeoHead, seoHead, siteJsonLd, summarize } from "./seo";

describe("summarize", () => {
  it("strips markdown and keeps short text whole", () => {
    expect(summarize("## Halo **dunia** [link](https://x.y)")).toBe("Halo dunia link");
  });
  it("cuts long text at 155 characters", () => {
    expect(summarize("kata ".repeat(100)).length).toBeLessThanOrEqual(155);
  });
});

describe("seoHead", () => {
  it("only tags absolute https images", () => {
    const head = seoHead({ title: "A", description: "B", type: "product", image: "/local.png" }, { title: "x", description: "y" });
    expect(head.meta.some((m) => m["property"] === "og:image")).toBe(false);
  });
  it("adds a self canonical when a path is given", () => {
    expect(seoHead(null, { title: "x", description: "y" }, "/lowongan").links).toEqual([{ rel: "canonical", href: "/lowongan" }]);
  });
});

describe("jobPostingLd", () => {
  it("marks jobs as remote contract work paid in rupiah", () => {
    const ld = jobPostingLd({ title: "Web toko", description: "Buat web", created_at: "2026-11-01T00:00:00Z", deadline: null, budget_min: 1000000, budget_max: 3000000, client: "ardi", skills: ["React"] });
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect((ld as any).baseSalary.currency).toBe("IDR");
    expect(ld.validThrough).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("seoHead for rows that do not exist", () => {
  it("keeps the fallback text and asks Google not to index", () => {
    const head = seoHead({ title: "", description: "", type: "website", notFound: true }, { title: "Detail karya — Pastodev", description: "Lihat karya." });
    expect(head.meta[0]).toEqual({ title: "Detail karya — Pastodev" });
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex" });
    expect(head.scripts).toEqual([]);
  });
});

describe("robotsForPath", () => {
  it("indexes public pages", () => {
    for (const p of ["/", "/karya", "/karya/abc", "/lowongan/abc", "/discuss/abc", "/budi", "/budi/my-repo", "/toko/budi", "/katalog"]) expect(robotsForPath(p), p).toBeNull();
  });
  it("keeps private and form pages out", () => {
    for (const p of ["/admin", "/auth", "/dashboard", "/settings", "/studio", "/studio/karya/1", "/new", "/import", "/pesanan/1", "/reset-password", "/lowongan/baru"]) expect(robotsForPath(p), p).toBe("noindex, nofollow");
  });
  it("does not swallow usernames that merely start with a private word", () => {
    for (const p of ["/newton", "/administrator", "/authors", "/studio54", "/newton/repo"]) expect(robotsForPath(p), p).toBeNull();
  });
  it("keeps repository sub-pages and search results out but followable", () => {
    for (const p of ["/search", "/budi/my-repo/tree/src", "/budi/my-repo/blob/a.ts", "/budi/my-repo/commits", "/budi/my-repo/issues/3", "/budi/my-repo/pulls"]) expect(robotsForPath(p), p).toBe("noindex, follow");
  });
});

describe("canonicalUrl", () => {
  it("drops query, hash and trailing slash", () => {
    expect(canonicalUrl("https://x.id", "/katalog/?tab=karya#a")).toBe("https://x.id/katalog");
    expect(canonicalUrl("https://x.id", "/")).toBe("https://x.id/");
    expect(cleanPath("")).toBe("/");
  });
});

describe("robotsTxt", () => {
  const txt = robotsTxt("https://x.id");
  it("points to the sitemap index with the real domain", () => expect(txt).toContain("Sitemap: https://x.id/sitemap.xml"));
  it("blocks exact private paths and their children, not look-alike usernames", () => {
    expect(txt).toContain("Disallow: /new$");
    expect(txt).toContain("Disallow: /new/");
    expect(txt).not.toMatch(/^Disallow: \/new\s*$/m); // a bare "/new" would also block /newton
  });
  it("has a single user-agent group so no bot gets a looser rule set", () => expect(txt.match(/^User-agent:/gm)).toHaveLength(1));
});

describe("rootSeoHead", () => {
  const site = { siteUrl: "https://x.id", googleVerification: "tok" };
  it("adds verification, canonical and robots for a normal page", () => {
    const h = rootSeoHead(site, { routeId: "/karya/", pathname: "/karya/" }, 2);
    expect(h.meta).toContainEqual({ name: "google-site-verification", content: "tok" });
    expect(h.links).toContainEqual({ rel: "canonical", href: "https://x.id/karya" });
    expect(h.meta.find((m) => m["name"] === "robots")?.["content"]).toMatch(/^index, follow/);
  });
  it("marks a 404 noindex and never canonicalises it", () => {
    for (const [routeId, count] of [["__root__", 1], ["/$username_/$repo", 2]] as const) {
      const h = rootSeoHead(site, { routeId, pathname: "/foo/bar" }, count);
      expect(h.links).toEqual([]);
      expect(h.meta.find((m) => m["name"] === "robots")?.["content"]).toBe("noindex");
    }
  });
  it("skips verification and canonical when the site address is unknown", () => {
    const h = rootSeoHead({ siteUrl: null, googleVerification: null }, { routeId: "/", pathname: "/" }, 2);
    expect(h.links).toEqual([]);
    expect(h.meta.some((m) => m["name"] === "google-site-verification")).toBe(false);
  });
});

describe("siteJsonLd", () => {
  it("describes the site with a search box and cannot break out of its script tag", () => {
    const raw = siteJsonLd("https://x.id");
    expect(raw).not.toContain("<");
    const ld = JSON.parse(raw);
    expect(ld["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["Organization", "WebSite"]);
    expect(ld["@graph"][1].potentialAction.target.urlTemplate).toBe("https://x.id/search?q={search_term_string}");
  });
});
