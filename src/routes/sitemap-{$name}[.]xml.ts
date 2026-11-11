// /sitemap-pages.xml, /sitemap-karya.xml, /sitemap-jasa.xml, /sitemap-lowongan.xml, /sitemap-diskusi.xml,
// /sitemap-developer.xml, /sitemap-repo.xml, /sitemap-toko.xml
import { createFileRoute } from "@tanstack/react-router";
import { isSitemapName } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap-{$name}.xml")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isSitemapName(params.name)) return new Response("Sitemap tidak ditemukan.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        const { sitemapResponse } = await import("@/lib/sitemap.server");
        return sitemapResponse(request, params.name);
      },
    },
  },
});
