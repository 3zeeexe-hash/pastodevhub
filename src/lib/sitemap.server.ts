// Reads the public rows that belong in the sitemaps. Uses the public (anon) key, so only rows
// that anyone can already see on the site can ever show up here.
import { isFeatureOn, type FeatureFlags, type FeatureKey } from "@/lib/features";
import { PublicDbConfigError, publicAnon } from "@/lib/public-db.server";
import { FEED_MIN_INDEX_LENGTH } from "@/lib/seo";
import { resolveRequestOrigin } from "@/lib/site-url";
import { SITEMAP_MAX_URLS, SITEMAP_NAMES, buildSitemapIndex, buildUrlset, type SitemapName, type SitemapUrl } from "@/lib/sitemap";

type Db = ReturnType<typeof publicAnon>;
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
  /** When true, a failing query gives an empty sitemap instead of a 503 (table may not be readable yet). */
  soft?: boolean;
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
        path: `/gobifeed/${seg(r["id"])}`,
        lastmod: r["created_at"],
      })),
  },
  gobifeed: {
    feature: "discuss",
    soft: true,
    // Timeline posts with real text. Replies and reposts repeat other content, and one-liners are too thin to rank.
    load: async (db) =>
      (
        await fetchAll((a, b) =>
          db.from("feed_posts").select("id,body,created_at").in("kind", ["post", "quote"]).order("created_at", { ascending: false }).order("id").range(a, b),
        )
      )
        .filter((r) => typeof r["body"] === "string" && r["body"].trim().length >= FEED_MIN_INDEX_LENGTH)
        .map((r) => ({ path: `/gobifeed/status/${seg(r["id"])}`, lastmod: r["created_at"] })),
  },
  developer: {
    feature: null,
    // Every account with a username gets its page listed, so each profile can be found on Google.
    // Profiles have no "updated" date, so no <lastmod>.
    load: async (db) =>
      (await fetchAll((a, b) => db.from("profiles").select("username,created_at").order("created_at", { ascending: false }).order("username").range(a, b)))
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
  { path: "/gobifeed", feature: "discuss" },
];

/** `ok` is false when the switches could not be read (database down or table unreadable). */
async function loadFlags(db: Db): Promise<{ flags: FeatureFlags; ok: boolean }> {
  const { data, error } = await db.from("feature_flags").select("key,enabled");
  const flags: FeatureFlags = {};
  for (const row of data ?? []) flags[row.key] = row.enabled;
  return { flags, ok: !error };
}

/** One child sitemap as XML. Throws when the database cannot be read. */
export async function renderSitemap(name: SitemapName, origin: string): Promise<string> {
  const db = publicAnon();
  const { flags } = await loadFlags(db);
  if (name === "pages") return buildUrlset(origin, STATIC_PAGES.filter((p) => !p.feature || isFeatureOn(flags, p.feature)).map((p) => ({ path: p.path })));
  const source = SOURCES[name];
  if (source.feature && !isFeatureOn(flags, source.feature)) return buildUrlset(origin, []);
  try {
    return buildUrlset(origin, await source.load(db));
  } catch (e) {
    if (!source.soft) throw e;
    console.error("sitemap source unreadable", name, e);
    return buildUrlset(origin, []);
  }
}

/**
 * The /sitemap.xml index: one entry per child sitemap that has something in it.
 * The index itself must never fail because of the database: when the database cannot be read at all, every child is listed
 * without <lastmod> (each child then reports its own error and Google retries it), so Search Console can always read this file.
 */
export async function renderSitemapIndex(origin: string): Promise<string> {
  const children = SITEMAP_NAMES.filter((n): n is Exclude<SitemapName, "pages"> => n !== "pages");
  const items: { name: SitemapName; lastmod?: string | null }[] = [{ name: "pages" }];

  let db: Db | null = null;
  let flags: FeatureFlags = {};
  let readable = false;
  try {
    db = publicAnon();
    const loaded = await loadFlags(db);
    flags = loaded.flags;
    readable = loaded.ok;
  } catch (e) {
    console.error("sitemap index: database not readable", e);
  }
  if (!db || !readable) {
    for (const n of children) items.push({ name: n });
    return buildSitemapIndex(origin, items);
  }
  const database = db;

  // The table name is dynamic, so the query builder is loosely typed here on purpose.
  // undefined = could not read (leave the child out), null = no rows (nothing to list), string = newest change.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const newest = async (table: string, col: string, apply: (q: any) => any): Promise<string | null | undefined> => {
    try {
      const { data, error } = await apply(database.from(table as any).select(col)).order(col, { ascending: false }).limit(1);
      if (error) return undefined;
      return ((data as Row[] | null)?.[0]?.[col] as string | undefined) ?? null;
    } catch {
      return undefined;
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const probes: Record<Exclude<SitemapName, "pages">, () => Promise<string | null | undefined>> = {
    karya: () => newest("products", "updated_at", (q) => q.eq("is_published", true)),
    jasa: () => newest("services", "updated_at", (q) => q.eq("is_active", true)),
    lowongan: () => newest("jobs", "updated_at", (q) => q.eq("status", "open")),
    diskusi: () => newest("posts", "created_at", (q) => q),
    gobifeed: () => newest("feed_posts", "created_at", (q) => q.in("kind", ["post", "quote"])),
    developer: () => newest("profiles", "created_at", (q) => q),
    repo: () => newest("repositories", "updated_at", (q) => q.eq("is_private", false).is("forked_from", null)),
    toko: () => newest("stores", "updated_at", (q) => q),
  };
  await Promise.all(
    children.map(async (n) => {
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

/**
 * Serves /sitemap.xml (name = null) or /sitemap-<name>.xml. A database failure is a 503 so Google retries later instead of
 * storing an empty sitemap. The body and the X-Sitemap-Error header say whether the cause is the server config or the database.
 */
export async function sitemapResponse(request: Request, name: SitemapName | null): Promise<Response> {
  try {
    const origin = resolveRequestOrigin(process.env["SITE_URL"], request);
    const body = name ? await renderSitemap(name, origin) : await renderSitemapIndex(origin);
    return new Response(body, { headers: XML_HEADERS });
  } catch (e) {
    console.error("sitemap failed", name, e);
    const reason = e instanceof PublicDbConfigError ? "config" : "database";
    return new Response(`Sitemap sementara tidak tersedia (${reason}).`, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300", "Cache-Control": "no-store", "X-Sitemap-Error": reason },
    });
  }
}
