// Subdomain GobiFeed (mis. feed.goobi.my.id): alamat akarnya langsung membuka linimasa GobiFeed.
// Fungsi murni, aman dipakai di server maupun klien.

/** True kalau label pertama hostname adalah "feed" (feed.goobi.my.id, feed.localhost). Host tanpa titik tidak dihitung. */
export function isFeedHost(hostname: string | null | undefined): boolean {
  const host = (hostname ?? "").trim().toLowerCase();
  return host.includes(".") && host.split(".")[0] === "feed";
}

/**
 * Alamat tujuan kalau permintaan ke subdomain feed harus dialihkan, selain itu null.
 * Hanya akar ("/") yang dialihkan ke /gobifeed; query string (mis. ?tab=tren) ikut dibawa. Path lain, termasuk /auth, /search,
 * dan semua /gobifeed/..., tetap dilayani apa adanya.
 */
export function feedHostRedirect(url: URL): string | null {
  if (!isFeedHost(url.hostname) || url.pathname !== "/") return null;
  return new URL(`/gobifeed${url.search}`, url).toString();
}
