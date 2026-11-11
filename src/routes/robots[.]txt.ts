// /robots.txt, built per request so the Sitemap line always carries the real domain.
// Delete public/robots.txt: a static file there would shadow this route.
import { createFileRoute } from "@tanstack/react-router";
import { resolveSiteOrigin } from "@/lib/site-url";
import { robotsTxt } from "@/lib/seo";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(robotsTxt(resolveSiteOrigin(process.env["SITE_URL"], request.url)), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
        }),
    },
  },
});
