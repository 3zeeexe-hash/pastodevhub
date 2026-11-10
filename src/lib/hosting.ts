// Shared rules for hosted files (HTML pages, shared files, images). Browser-safe.
export type HostKind = "html" | "file" | "image";

export const HOST_KINDS: Record<HostKind, { title: string; maxBytes: number; accept: string; hint: string }> = {
  html: { title: "Hosting HTML", maxBytes: 5 * 1024 * 1024, accept: ".html,.htm,text/html", hint: "Halaman .html, maks 5 MB. Bisa juga ditulis langsung di editor." },
  file: { title: "Berbagi file", maxBytes: 50 * 1024 * 1024, accept: "", hint: "File apa saja (ZIP, PDF, APK…), maks 50 MB." },
  image: { title: "Cloud gambar", maxBytes: 10 * 1024 * 1024, accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif", hint: "PNG, JPG, WebP, GIF, SVG, maks 10 MB per gambar." },
};

/** Same rule as the database: 3–63 chars, lowercase letters, digits and dashes, not starting with a dash. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,62}$/;

export function makeSlug(name: string, random: () => number = Math.random) {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const tail = Array.from({ length: 5 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(random() * 32)]).join("");
  return base.length >= 2 ? `${base}-${tail}` : `f-${tail}`;
}

export function checkHostFile(kind: HostKind, file: { name: string; size: number; type: string }): string | null {
  const cfg = HOST_KINDS[kind];
  if (file.size > cfg.maxBytes) return `${file.name} terlalu besar (maks ${Math.round(cfg.maxBytes / 1024 / 1024)} MB).`;
  if (kind === "image" && !file.type.startsWith("image/")) return `${file.name} bukan gambar.`;
  if (kind === "html" && !/\.html?$/i.test(file.name) && file.type !== "text/html") return `${file.name} bukan file HTML.`;
  return null;
}

export const hostedPath = (slug: string) => `/f/${slug}`;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Headers for serving user content from our own domain. The CSP sandbox gives the page
 * its own isolated origin, so uploaded HTML/SVG can run scripts but can never read the
 * visitor's Pastodev login.
 */
export function hostedHeaders(kind: HostKind, contentType: string, name: string): Record<string, string> {
  const type = kind === "html" ? "text/html; charset=utf-8" : contentType || "application/octet-stream";
  const inline = kind !== "file" || /^(image\/|application\/pdf|text\/plain|video\/|audio\/)/.test(type);
  const safeName = name.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "file";
  return {
    "Content-Type": type,
    "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "Cache-Control": "public, max-age=60",
  };
}
