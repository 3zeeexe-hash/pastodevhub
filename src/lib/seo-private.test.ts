import { describe, expect, it } from "vitest";
import { FEED_MIN_INDEX_LENGTH, robotsForPath, robotsTxt } from "./seo";

describe("halaman pribadi: chat, notifikasi, saldo, GOBI WORK", () => {
  it("tidak diindeks dan tidak diikuti", () => {
    for (const p of ["/kerja", "/kerja/kontrak/1", "/saldo", "/notifikasi", "/verifikasi", "/lowongan/saya", "/gobifeed/pesan", "/gobifeed/pesan/abc", "/gobifeed/notifikasi", "/gobifeed/tersimpan"]) {
      expect(robotsForPath(p), p).toBe("noindex, nofollow");
    }
  });
  it("post, forum, dan tagar GobiFeed yang publik tetap diindeks", () => {
    for (const p of ["/gobifeed", "/gobifeed/abc", "/gobifeed/status/abc", "/gobifeed/tag/react", "/lowongan", "/lowongan/abc"]) expect(robotsForPath(p), p).toBeNull();
  });
  it("robots.txt menutup jalur pribadi baru tanpa menutup nama pengguna yang mirip", () => {
    const txt = robotsTxt("https://x.id");
    expect(txt).toContain("Disallow: /gobifeed/pesan$");
    expect(txt).toContain("Disallow: /gobifeed/pesan/");
    expect(txt).toContain("Disallow: /kerja$");
    expect(txt).not.toMatch(/^Disallow: \/gobifeed\s*$/m);
    expect(txt).not.toMatch(/^Disallow: \/kerja\s*$/m);
  });
});

describe("FEED_MIN_INDEX_LENGTH", () => {
  it("adalah batas panjang teks yang masuk akal", () => expect(FEED_MIN_INDEX_LENGTH).toBeGreaterThan(0));
});
