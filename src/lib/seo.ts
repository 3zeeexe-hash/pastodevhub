// Pure SEO helpers: page meta + structured data for Google (safe on server and client).

export const SITE_NAME = "GoBi";
export type SeoInfo = { title: string; description: string; image?: string | undefined; type: "website" | "article" | "product" | "profile"; /** Pre-serialized JSON-LD. */ jsonLd?: string | undefined; noindex?: boolean | undefined; /** The row does not exist (or is not public): keep the fallback title and ask Google not to index it. */ notFound?: boolean | undefined };

/** Plain-text summary for meta descriptions: strips markdown/HTML and cuts at ~155 chars on a word. */
export function summarize(text: string | null | undefined, max = 155) {
  const plain = (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).trim()}…`;
}

const httpsOnly = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : undefined);

/** Builds the head() meta array for a page. */
export function seoHead(info: SeoInfo | null | undefined, fallback: { title: string; description: string }, path?: string) {
  const found = info && !info.notFound ? info : null;
  const title = found?.title ?? fallback.title;
  const description = found?.description || fallback.description;
  const image = httpsOnly(found?.image);
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: found?.type ?? "website" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (path) meta.push({ property: "og:url", content: path });
  if (image) meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  if (info?.noindex || info?.notFound) meta.push({ name: "robots", content: "noindex" });
  return {
    meta,
    links: path ? [{ rel: "canonical", href: path }] : [],
    scripts: found?.jsonLd ? [{ type: "application/ld+json", children: found.jsonLd }] : [],
  };
}

export function jobPostingLd(j: { title: string; description: string; created_at: string; deadline: string | null; budget_min: number | null; budget_max: number | null; client: string; skills: string[] }) {
  const valid = j.deadline ?? new Date(Date.parse(j.created_at) + 30 * 86400000).toISOString();
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description || j.title,
    datePosted: j.created_at,
    validThrough: valid,
    employmentType: "CONTRACTOR",
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: { "@type": "Country", name: "Indonesia" },
    hiringOrganization: { "@type": "Organization", name: j.client || SITE_NAME },
    skills: j.skills.join(", ") || undefined,
    ...(j.budget_min || j.budget_max
      ? { baseSalary: { "@type": "MonetaryAmount", currency: "IDR", value: { "@type": "QuantitativeValue", minValue: j.budget_min ?? j.budget_max, maxValue: j.budget_max ?? j.budget_min, unitText: "PROJECT" } } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Site-wide rules: which pages Google may index, canonical links, robots.txt.
// ---------------------------------------------------------------------------

/** Pages that only make sense when signed in (or are forms). Matched as the exact path or anything below it. */
export const PRIVATE_PREFIXES = ["/admin", "/auth", "/dashboard", "/settings", "/studio", "/new", "/import", "/pesanan", "/reset-password", "/lowongan/baru"];

/** Exact path or a sub-path, so "/new" does not swallow a user called "newton". */
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Path without trailing slash and without query/hash. "/" stays "/". */
export function cleanPath(pathname: string) {
  const p = (pathname.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Value for the robots meta tag, or null when the page may be indexed normally.
 * - private pages: noindex, nofollow
 * - repository sub-pages (files, commits, issues, pull requests…): noindex, follow. Links still get
 *   crawled, but only the repository home page competes in search results.
 * - search results: noindex, follow
 */
export function robotsForPath(pathname: string): string | null {
  const path = cleanPath(pathname);
  if (PRIVATE_PREFIXES.some((p) => under(path, p))) return "noindex, nofollow";
  if (path === "/search") return "noindex, follow";
  const parts = path.split("/").filter(Boolean);
  const reserved = ["karya", "jasa", "lowongan", "discuss", "toko", "f", "api", "explore", "katalog"];
  if (parts.length >= 3 && !reserved.includes(parts[0] ?? "")) return "noindex, follow";
  return null;
}

/** Absolute canonical address of a page: no query string, no trailing slash. */
export function canonicalUrl(origin: string, pathname: string) {
  const path = cleanPath(pathname);
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

/** robots.txt body. Blocks private areas and internal search; everything else stays open. */
export function robotsTxt(origin: string) {
  const lines = ["User-agent: *", "Allow: /"];
  for (const p of PRIVATE_PREFIXES) lines.push(`Disallow: ${p}$`, `Disallow: ${p}/`);
  lines.push(
    "Disallow: /search$", // internal search results are endless thin pages
    "Disallow: /api/",
    "Disallow: /_serverFn/",
    "Disallow: /*.git/", // git clone endpoints, not web pages
  );
  lines.push("", `Sitemap: ${origin}/sitemap.xml`, "");
  return lines.join("\n");
}

/** Layout routes that only ever render a child page. Matching one as the last route means the URL went nowhere. */
const LAYOUT_ONLY_ROUTES = ["/$username_/$repo"];

type SiteInfo = { siteUrl?: string | null | undefined; googleVerification?: string | null | undefined } | null | undefined;

/** Head tags every page gets from the root route: Search Console verification, canonical, robots, og:url. */
export function rootSeoHead(site: SiteInfo, leaf: { routeId?: string | undefined; pathname?: string | undefined } | undefined, matchCount: number) {
  const meta: Record<string, string>[] = [{ property: "og:locale", content: "id_ID" }];
  const links: Record<string, string>[] = [];
  if (site?.googleVerification) meta.push({ name: "google-site-verification", content: site.googleVerification });
  // Nothing owns this address, so it is a 404: either only the root matched, or the match stopped at a layout
  // route that has no page of its own (an unknown path under /<user>/<repo>). Never canonicalise a 404.
  const notFound = (matchCount <= 1 && leaf?.routeId === "__root__") || LAYOUT_ONLY_ROUTES.includes(leaf?.routeId ?? "");
  const path = leaf?.pathname ?? "/";
  const robots = notFound ? "noindex" : robotsForPath(path);
  meta.push({ name: "robots", content: robots ?? "index, follow, max-image-preview:large, max-snippet:-1" });
  if (site?.siteUrl && !notFound) {
    const url = canonicalUrl(site.siteUrl, path);
    meta.push({ property: "og:url", content: url });
    links.push({ rel: "canonical", href: url }, { rel: "alternate", hreflang: "id", href: url }, { rel: "alternate", hreflang: "x-default", href: url });
  }
  return { meta, links };
}

/** WebSite (with the Google sitelinks search box) and Organization data for the home page. */
export function siteJsonLd(origin: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: SITE_NAME,
        url: `${origin}/`,
        logo: `${origin}/favicon.png`,
        description: "Komunitas developer Nusantara: repositori kode, lowongan freelance, karya digital, jasa, dan diskusi.",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: `${origin}/`,
        name: SITE_NAME,
        inLanguage: "id-ID",
        publisher: { "@id": `${origin}/#organization` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
      },
    ],
  }).replace(/</g, "\\u003c");
}
