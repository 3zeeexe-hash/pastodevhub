// Plain-HTML landing page for the GitHub consent popup.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/github/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code") ?? "";
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        const state = url.searchParams.get("state") ?? "";
        const result = code
          ? { success: true, connectorId: "github", code, state }
          : { success: false, connectorId: "github", error: errorDescription ?? error ?? "OAuth failed" };

        const escapeHtml = (str: string) =>
          str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const safeJson = JSON.stringify(result).replace(/<\//g, "<\\/");

        const html = `<!DOCTYPE html>
<html>
<head><title>Menghubungkan GitHub…</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;background:#0d1020;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p>${result.success ? "GitHub terhubung, menutup jendela…" : "Gagal: " + escapeHtml((result as { error?: string }).error ?? "Unknown error")}</p>
  <script>
    const result = ${safeJson};
    const type = result.success ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed";
    const message = { type, connectorId: "github", code: result.code ?? null, state: result.state ?? null, error: result.error ?? null };
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(message, window.location.origin);
    }
    window.close();
  </script>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      },
    },
  },
});
