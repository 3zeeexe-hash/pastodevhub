// Public page metadata for search engines, read with the public (anon) key on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SITE_NAME, jobPostingLd, summarize, type SeoInfo } from "@/lib/seo";

async function anon() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("missing config");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Serialize JSON-LD safely for a <script> tag. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

/** Row missing or not public: the page keeps its fallback title but is marked noindex. */
const NOT_FOUND: SeoInfo = { title: "", description: "", type: "website", notFound: true };

const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export const getSeoInfo = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: "job" | "product" | "service" | "post" | "profile" | "repo" | "store"; id: string; extra?: string | undefined }) =>
    z.object({ kind: z.enum(["job", "product", "service", "post", "profile", "repo", "store"]), id: z.string().min(1).max(100), extra: z.string().max(100).optional() }).parse(input))
  .handler(async ({ data }): Promise<SeoInfo | null> => {
    try {
      const db = await anon();
      const uuid = z.string().uuid().safeParse(data.id).success;
      const profileName = async (id: string) => (await db.from("profiles").select("username,display_name").eq("id", id).maybeSingle()).data;

      if (data.kind === "job" && uuid) {
        const { data: j } = await db.from("jobs").select("title,description,category,skills,budget_min,budget_max,deadline,status,created_at,client_id").eq("id", data.id).maybeSingle();
        if (!j) return NOT_FOUND;
        const client = await profileName(j.client_id);
        const budget = j.budget_min || j.budget_max ? ` Budget ${[j.budget_min, j.budget_max].filter(Boolean).map((n) => rupiah(n as number)).join("–")}.` : "";
        return {
          title: `${j.title} — Lowongan freelance | ${SITE_NAME}`,
          description: summarize(`${j.description}`, 130) + budget,
          type: "article",
          jsonLd: j.status === "open" ? ld(jobPostingLd({ ...j, skills: j.skills ?? [], client: client?.display_name || client?.username || SITE_NAME })) : undefined,
        };
      }
      if ((data.kind === "product" || data.kind === "service") && uuid) {
        const table = data.kind === "product" ? "products" : "services";
        const { data: p } = await db.from(table).select("*").eq("id", data.id).maybeSingle();
        if (!p) return NOT_FOUND;
        const row = p as Record<string, any>;
        const seller = await profileName(row["owner_id"]);
        const price = Number(data.kind === "product" ? row["price"] : row["price_from"]) || 0;
        const label = data.kind === "product" ? "Karya" : "Jasa";
        return {
          title: `${row["title"]} — ${label} oleh ${seller?.username ?? "developer"} | ${SITE_NAME}`,
          description: summarize(row["summary"] || row["description"]) || `${label} dari developer Indonesia di ${SITE_NAME}.`,
          image: row["cover_url"] ?? undefined,
          type: "product",
          jsonLd: ld({
            "@context": "https://schema.org",
            "@type": data.kind === "product" ? "Product" : "Service",
            name: row["title"],
            description: summarize(row["description"] || row["summary"], 500),
            ...(row["cover_url"] ? { image: row["cover_url"] } : {}),
            ...(data.kind === "product"
              ? { brand: { "@type": "Brand", name: seller?.display_name || seller?.username || SITE_NAME }, offers: { "@type": "Offer", priceCurrency: "IDR", price, availability: "https://schema.org/InStock" } }
              : { provider: { "@type": "Person", name: seller?.display_name || seller?.username }, areaServed: "ID", offers: { "@type": "Offer", priceCurrency: "IDR", price } }),
          }),
        };
      }
      if (data.kind === "post" && uuid) {
        const { data: p } = await db.from("posts").select("title,body,created_at,author_id").eq("id", data.id).maybeSingle();
        if (!p) return NOT_FOUND;
        const author = await profileName(p.author_id);
        return {
          title: `${p.title} — Diskusi | ${SITE_NAME}`,
          description: summarize(p.body) || p.title,
          type: "article",
          jsonLd: ld({ "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: p.title, text: summarize(p.body, 500), datePublished: p.created_at, author: { "@type": "Person", name: author?.username ?? "anggota" } }),
        };
      }
      if (data.kind === "profile") {
        const { data: p } = await db.from("profiles").select("username,display_name,bio,headline,avatar_url,skills,location,account_type").eq("username", data.id).maybeSingle();
        if (!p) return NOT_FOUND;
        const name = p.display_name || p.username;
        const role = p.headline || (p.account_type === "developer" ? "Developer" : "Anggota");
        return {
          title: `${name} (@${p.username}) — ${role} | ${SITE_NAME}`,
          description: summarize(p.bio || `${role}${p.skills?.length ? ` · ${p.skills.slice(0, 6).join(", ")}` : ""}${p.location ? ` · ${p.location}` : ""}. Lihat repositori, karya, dan jasa ${name} di ${SITE_NAME}.`),
          image: p.avatar_url ?? undefined,
          type: "profile",
          jsonLd: ld({ "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name, alternateName: p.username, description: p.headline ?? undefined, ...(p.avatar_url ? { image: p.avatar_url } : {}), knowsAbout: p.skills ?? [] } }),
        };
      }
      if (data.kind === "store") {
        const { data: p } = await db.from("profiles").select("id,username,display_name,bio,headline,avatar_url").eq("username", data.id).maybeSingle();
        if (!p) return NOT_FOUND;
        const { data: st } = await db.from("stores").select("title").eq("owner_id", p.id).maybeSingle();
        const name = p.display_name || p.username;
        return {
          title: `${st?.title?.trim() || `Toko ${name}`} — Karya & jasa oleh @${p.username} | ${SITE_NAME}`,
          description: summarize(p.bio || p.headline) || `Karya digital dan jasa developer dari ${name} di ${SITE_NAME}. Beli karya atau pesan jasa langsung.`,
          image: p.avatar_url ?? undefined,
          type: "website",
          jsonLd: ld({ "@context": "https://schema.org", "@type": "ProfilePage", mainEntity: { "@type": "Person", name, alternateName: p.username, ...(p.avatar_url ? { image: p.avatar_url } : {}) } }),
        };
      }
      if (data.kind === "repo" && data.extra) {
        const { data: owner } = await db.from("profiles").select("id,username").eq("username", data.id).maybeSingle();
        if (!owner) return NOT_FOUND;
        const { data: r } = await db.from("repositories").select("name,description,language,topics,updated_at").eq("owner_id", owner.id).eq("name", data.extra).maybeSingle();
        if (!r) return NOT_FOUND;
        return {
          title: `${owner.username}/${r.name}${r.description ? `: ${summarize(r.description, 60)}` : ""} | ${SITE_NAME}`,
          description: summarize(r.description) || `Repositori ${r.name} oleh ${owner.username} di ${SITE_NAME}: kode, issue, dan pull request.`,
          type: "website",
          jsonLd: ld({ "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: r.name, description: r.description ?? undefined, programmingLanguage: r.language ?? undefined, keywords: (r.topics ?? []).join(", ") || undefined, author: { "@type": "Person", name: owner.username }, dateModified: r.updated_at }),
        };
      }
      return NOT_FOUND; // an id that is not even a valid uuid / missing repo name
    } catch (e) {
      console.error("seo info failed", e);
      return null;
    }
  });
