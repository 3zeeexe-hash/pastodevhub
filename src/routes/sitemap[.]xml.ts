// /sitemap.xml: the index that points Google at every child sitemap (submit this one in Search Console).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { sitemapResponse } = await import("@/lib/sitemap.server");
        return sitemapResponse(request, null);
      },
    },
  },
});
