// Public link for hosted HTML pages, shared files and images: /f/<slug>
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hostedHeaders, SLUG_RE, type HostKind } from "@/lib/hosting";

const notFound = () =>
  new Response("<!doctype html><meta charset=utf-8><title>Tidak ditemukan</title><body style='font-family:system-ui;padding:3rem'>File tidak ditemukan atau sudah dihapus.</body>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

export const Route = createFileRoute("/f/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug.toLowerCase();
        if (!SLUG_RE.test(slug)) return notFound();
        const { data: row } = await supabase.from("hosted_files").select("kind,name,storage_path,content_type").eq("slug", slug).maybeSingle();
        if (!row) return notFound();
        const { data: blob, error } = await supabase.storage.from("hosting").download(row.storage_path);
        if (error || !blob) return notFound();
        await supabase.rpc("count_hosted_view", { _slug: slug });
        return new Response(blob, { headers: hostedHeaders(row.kind as HostKind, row.content_type, row.name) });
      },
    },
  },
});
