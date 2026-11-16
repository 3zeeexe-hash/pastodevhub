import { describe, expect, it } from "vitest";
import { feedHostRedirect, isFeedHost } from "@/lib/feed-host";

describe("isFeedHost", () => {
  it("mengenali subdomain feed", () => {
    expect(isFeedHost("feed.goobi.my.id")).toBe(true);
    expect(isFeedHost("FEED.goobi.my.id")).toBe(true);
    expect(isFeedHost("feed.localhost")).toBe(true);
  });
  it("menolak host lain", () => {
    expect(isFeedHost("goobi.my.id")).toBe(false);
    expect(isFeedHost("www.goobi.my.id")).toBe(false);
    expect(isFeedHost("feedback.goobi.my.id")).toBe(false);
    expect(isFeedHost("feed")).toBe(false);
    expect(isFeedHost("")).toBe(false);
    expect(isFeedHost(null)).toBe(false);
  });
});

describe("feedHostRedirect", () => {
  it("mengalihkan akar subdomain ke /gobifeed", () => {
    expect(feedHostRedirect(new URL("https://feed.goobi.my.id/"))).toBe("https://feed.goobi.my.id/gobifeed");
  });
  it("membawa query string", () => {
    expect(feedHostRedirect(new URL("https://feed.goobi.my.id/?tab=tren"))).toBe("https://feed.goobi.my.id/gobifeed?tab=tren");
  });
  it("tidak menyentuh path lain", () => {
    expect(feedHostRedirect(new URL("https://feed.goobi.my.id/gobifeed"))).toBeNull();
    expect(feedHostRedirect(new URL("https://feed.goobi.my.id/gobifeed/pesan"))).toBeNull();
    expect(feedHostRedirect(new URL("https://feed.goobi.my.id/auth"))).toBeNull();
  });
  it("tidak menyentuh situs utama", () => {
    expect(feedHostRedirect(new URL("https://goobi.my.id/"))).toBeNull();
  });
});
