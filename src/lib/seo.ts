// Pure SEO helpers: page meta + structured data for Google (safe on server and client).

export const SITE_NAME = "Pastodev";
export type SeoInfo = { title: string; description: string; image?: string | undefined; type: "website" | "article" | "product" | "profile"; /** Pre-serialized JSON-LD. */ jsonLd?: string | undefined; noindex?: boolean | undefined };

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
  const title = info?.title ?? fallback.title;
  const description = info?.description || fallback.description;
  const image = httpsOnly(info?.image);
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: info?.type ?? "website" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (path) meta.push({ property: "og:url", content: path });
  if (image) meta.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  if (info?.noindex) meta.push({ name: "robots", content: "noindex" });
  return {
    meta,
    links: path ? [{ rel: "canonical", href: path }] : [],
    scripts: info?.jsonLd ? [{ type: "application/ld+json", children: info.jsonLd }] : [],
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
