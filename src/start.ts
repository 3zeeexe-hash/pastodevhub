import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Git smart HTTP (clone/pull/push from the terminal) lives at /<user>/<repo>.git/...
const GIT_PATH = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/;
// Opening /<user>/<repo>.git in a browser (no git sub-path) should show the repo page.
const REPO_GIT_WEB = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)\.git\/?$/;
const gitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (GIT_PATH.test(url.pathname)) {
    const { handleGit } = await import("./lib/git/http.server");
    return handleGit(request);
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const m = REPO_GIT_WEB.exec(url.pathname);
    if (m) {
      return new Response(null, {
        status: 302,
        headers: { location: `/${m[1]}/${m[2]}${url.search}` },
      });
    }
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// requestMiddleware runs on every request; functionMiddleware only on server functions, where
// client sendContext is unvalidated input. Append to these arrays, never replace them.
// Enabling Lovable Cloud adds functionMiddleware: [attachSupabaseAuth], the bearer token that
// requireSupabaseAuth server functions need. Add it by hand only if Lovable Cloud or a
// user-managed Supabase project is connected, no middleware here sets Authorization, and the
// project did not intentionally replace it.
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [gitMiddleware, errorMiddleware, csrfMiddleware],
}));
