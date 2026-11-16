import { describe, expect, it } from "vitest";
import { SITEMAP_NAMES, isSitemapName } from "./sitemap";
import { resolveRequestOrigin } from "./site-url";

const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } });

describe("resolveRequestOrigin", () => {
  it("memakai SITE_URL kalau ada, apa pun isi header", () => {
    expect(resolveRequestOrigin("https://gobi.id", req("http://127.0.0.1:8787/sitemap.xml", { "x-forwarded-host": "evil.test" }))).toBe("https://gobi.id");
  });
  it("membaca host publik dari proxy kalau SITE_URL belum diatur", () => {
    expect(resolveRequestOrigin(undefined, req("http://127.0.0.1:8787/sitemap.xml", { "x-forwarded-host": "gobi.id", "x-forwarded-proto": "https" }))).toBe("https://gobi.id");
    expect(resolveRequestOrigin("", req("http://127.0.0.1:8787/x", { "x-forwarded-host": "a.gobi.id, b.example", "x-forwarded-proto": "http, https" }))).toBe("http://a.gobi.id");
  });
  it("menolak host yang bentuknya tidak wajar dan kembali ke alamat request", () => {
    expect(resolveRequestOrigin(undefined, req("https://app.example.dev/sitemap.xml", { "x-forwarded-host": "a b/c" }))).toBe("https://app.example.dev");
    expect(resolveRequestOrigin(undefined, req("https://app.example.dev/sitemap.xml"))).toBe("https://app.example.dev");
  });
});

describe("sitemap GobiFeed", () => {
  it("mengenal sitemap-gobifeed dan tetap menolak nama asing", () => {
    expect(isSitemapName("gobifeed")).toBe(true);
    expect(isSitemapName("diskusi")).toBe(true);
    expect(isSitemapName("gobifeed/../x")).toBe(false);
    expect(SITEMAP_NAMES[0]).toBe("pages");
  });
});
