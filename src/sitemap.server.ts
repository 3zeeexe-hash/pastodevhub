// Reads the public rows that belong in the sitemaps. Uses the public (anon) key, so only rows
// that anyone can already see on the site can ever show up here.
import { createClient } from "@supabase/supabase-js";
import { isFeatureOn, type FeatureFlags, type FeatureKey } from "@/lib/features";
import { resolveSiteOrigin } from "@/lib/site-url";
import { SITEMAP_MAX_URLS, SITEMAP_NAMES, buildSitemapIndex, buildUrlset, type SitemapName, type SitemapUrl } from "@/lib/sitemap";

function anon() {
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

type Db = ReturnType<typeof anon>;
// Rows come back untyped from dynamic selects (embedded relations, per-table columns).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const PAGE = 1000; // the API returns at most 1000 rows per request

/** Pages through a query until it runs dry or the sitemap is full. Newest rows come first. */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; out.length < SITEMAP_MAX_URLS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.slice(0, SITEMAP_MAX_URLS);
}

const seg = (s: string) => encodeURIComponent(s);
const https = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u) ? [u] : []);

type Source = {
  feature: FeatureKey | null;
  load: (db: Db) => Promise<SitemapUrl[]>;
};

const SOURCES: Record<Exclude<SitemapName, "pages">, Source> = {
  karya: {
    feature: "karya",
    load: async (db) =>
      (await fetchAll((a, b) => db.from("products").select("id,updated_at,cover_url").eq("is_published", true).order("updated_at", { ascending: false }).order("id").range(a, b))).map((r) => ({
        path: `/karya/${seg(r["id"])}`,
        lastmod: r["updated_at"],
        images: https(r["cover_url"]),
      })),
  },
  jasa: {
    feature: "jasa",
    load: async (db) =>
      (await fetchAll((a, b) => db.from("services").select("id,updated_at,cover_url").eq("is_active", true).order("updated_at", { ascending: false }).order("id").range(a, b))).map((r) => ({
        path: `/jasa/${seg(r["id"])}`,
        lastmod: r["updated_at"],
        images: https(r["cover_url"]),
      })),
  },
  lowongan: {
    feature: "jobs",
    // Only open jobs: a closed job is no longer a page worth sending people to.
    load: async (db) =>
      (await fetchAll((a, b) => db.from("jobs").select("id,updated_at").eq("status", "open").order("updated_at", { ascending: false }).order("id").range(a, b))).map((r) => ({
        path: `/lowongan/${seg(r["id"])}`,
        lastmod: r["updated_at"],
      })),
  },
  diskusi: {
    feature: "discuss",
    load: async (db) =>
      (await fetchAll((a, b) => db.from("posts").select("id,created_at").order("created_at", { ascending: false }).order("id").range(a, b))).map((r) => ({
        path: `/discuss/${seg(r["id"])}`,
        lastmod: r["created_at"],
      })),
  },
  developer: {
    feature: null,
    // Profiles have no "updated" date, so no <lastmod>. Empty profiles are left out as thin pages.
    load: async (db) =>
      (
        await fetchAll((a, b) =>
          db.from("profiles").select("username,created_at").or("account_type.eq.developer,bio.not.is.null,headline.not.is.null").order("created_at", { ascending: false }).order("username").range(a, b),
        )
      )
        .filter((r) => r["username"])
        .map((r) => ({ path: `/${seg(r["username"])}` })),
  },
  repo: {
    feature: "repos",
    // Public, original repositories only. Forks repeat their upstream's code, so they stay out.
    load: async (db) =>
      (
        await fetchAll((a, b) =>
          db
            .from("repositories")
            .select("name,updated_at,owner:profiles!repositories_owner_id_fkey(username)")
            .eq("is_private", false)
            .is("forked_from", null)
            .order("updated_at", { ascending: false })
            .order("id")
            .range(a, b),
        )
      )
        .filter((r) => r["owner"]?.username)
        .map((r) => ({ path: `/${seg(r["owner"].username)}/${seg(r["name"])}`, lastmod: r["updated_at"] })),
  },
  toko: {
    feature: "toko",
    load: async (db) =>
      (await fetchAll((a, b) => db.from("stores").select("updated_at,owner:profiles!stores_owner_id_fkey(username)").order("updated_at", { ascending: false }).order("owner_id").range(a, b)))
        .filter((r) => r["owner"]?.username)
        .map((r) => ({ path: `/toko/${seg(r["owner"].username)}`, lastmod: r["updated_at"] })),
  },
};

/** Fixed pages. Each one only appears while its feature switch is on. */
const STATIC_PAGES: { path: string; feature: FeatureKey | null }[] = [
  { path: "/", feature: null },
  { path: "/explore", feature: null },
  { path: "/katalog", feature: "karya" },
  { path: "/karya", feature: "karya" },
  { path: "/jasa", feature: "jasa" },
  { path: "/lowongan", feature: "jobs" },
  { path: "/discuss", feature: "discuss" },
];

async function loadFlags(db: Db): Promise<FeatureFlags> {
  const { data } = await db.from("feature_flags").select("key,enabled");
  const flags: FeatureFlags = {};
  for (const row of data ?? []) flags[row.key] = row.enabled;
  return flags;
}

/** One child sitemap as XML, or null for an unknown name. Throws when the database cannot be read. */
export async function renderSitemap(name: SitemapName, origin: string): Promise<string> {
  const db = anon();
  const flags = await loadFlags(db);
  if (name === "pages") return buildUrlset(origin, STATIC_PAGES.filter((p) => !p.feature || isFeatureOn(flags, p.feature)).map((p) => ({ path: p.path })));
  const source = SOURCES[name];
  if (source.feature && !isFeatureOn(flags, source.feature)) return buildUrlset(origin, []);
  return buildUrlset(origin, await source.load(db));
}

/** The /sitemap.xml index: one entry per child sitemap that has something in it. */
export async function renderSitemapIndex(origin: string): Promise<string> {
  const db = anon();
  const flags = await loadFlags(db);
  const items: { name: SitemapName; lastmod?: string | null }[] = [{ name: "pages" }];
  // The table name is dynamic, so the query builder is loosely typed here on purpose.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const newest = async (table: string, col: string, apply: (q: any) => any) => {
    const { data } = await apply(db.from(table as any).select(col)).order(col, { ascending: false }).limit(1);
    return ((data as Row[] | null)?.[0]?.[col] as string | undefined) ?? null;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const probes: Record<Exclude<SitemapName, "pages">, () => Promise<string | null>> = {
    karya: () => newest("products", "updated_at", (q) => q.eq("is_published", true)),
    jasa: () => newest("services", "updated_at", (q) => q.eq("is_active", true)),
    lowongan: () => newest("jobs", "updated_at", (q) => q.eq("status", "open")),
    diskusi: () => newest("posts", "created_at", (q) => q),
    developer: () => newest("profiles", "created_at", (q) => q.or("account_type.eq.developer,bio.not.is.null,headline.not.is.null")),
    repo: () => newest("repositories", "updated_at", (q) => q.eq("is_private", false).is("forked_from", null)),
    toko: () => newest("stores", "updated_at", (q) => q),
  };
  await Promise.all(
    SITEMAP_NAMES.filter((n): n is Exclude<SitemapName, "pages"> => n !== "pages").map(async (n) => {
      const feature = SOURCES[n].feature;
      if (feature && !isFeatureOn(flags, feature)) return;
      const lastmod = await probes[n]();
      if (lastmod) items.push({ name: n, lastmod });
    }),
  );
  // Keep the order stable so the index does not shuffle between requests.
  items.sort((a, b) => SITEMAP_NAMES.indexOf(a.name) - SITEMAP_NAMES.indexOf(b.name));
  return buildSitemapIndex(origin, items);
}

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  // Crawlers refetch often; a short browser cache and a longer edge cache keep database reads low.
  "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
};

/** Serves /sitemap.xml (name = null) or /sitemap-<name>.xml. A database failure is a 503 so Google retries later instead of storing an empty sitemap. */
export async function sitemapResponse(request: Request, name: SitemapName | null): Promise<Response> {
  const origin = resolveSiteOrigin(process.env["SITE_URL"], request.url);
  try {
    const body = name ? await renderSitemap(name, origin) : await renderSitemapIndex(origin);
    return new Response(body, { headers: XML_HEADERS });
  } catch (e) {
    console.error("sitemap failed", name, e);
    return new Response("Sitemap sementara tidak tersedia.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" } });
  }
                       }
