import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import gobiLogo from "@/assets/gobi-logo.svg";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { AccountTypePrompt } from "@/components/account-type-prompt";
import { SiteFooter } from "@/components/site-footer";
import { MobileBottomNav, useMobileNavVisible } from "@/components/mobile-bottom-nav";
import { ChatDock } from "@/components/chat-dock";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementBar, FeatureGate, RoleGate } from "@/components/site-status";
import { siteConfigQuery } from "@/lib/site-config.functions";
import { rootSeoHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">Halaman yang kamu cari tidak ada atau sudah dipindahkan.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

// After a new deploy, an open tab may ask for page code that no longer exists.
// Reload once to pick up the current version instead of showing a blank screen.
const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
function reloadOnceForStaleChunk() {
  if (typeof window === "undefined") return false;
  const key = "pastodev-chunk-reload";
  const last = Number(window.sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 10_000) return false;
  window.sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
  return true;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (STALE_CHUNK_RE.test(String(error instanceof Error ? error.message : error)) && reloadOnceForStaleChunk()) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Halaman gagal dimuat</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ada yang salah di sisi kami. Coba muat ulang atau kembali ke beranda.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
            Ke beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ loaderData, matches }) => {
    // Canonical, robots, og:url and Search Console verification for every page live here, so no page can forget them.
    const seo = rootSeoHead(loaderData, matches[matches.length - 1], matches.length);
    return {
      meta: [
        ...seo.meta,
        { charSet: "utf-8" },
        // viewport-fit=cover supaya menu bawah dan tombol chat bisa memakai env(safe-area-inset-bottom) di iPhone.
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: "GoBi — Komunitas Developer" },
        { name: "description", content: "Rumah kode developer Nusantara: repositori, issue, pull request, dan sinkron dengan GitHub." },
        { name: "author", content: "GoBi" },
        { name: "theme-color", content: "#0d1020" },
        { property: "og:site_name", content: "GoBi" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        ...seo.links,
        { rel: "icon", type: "image/svg+xml", href: gobiLogo },
        { rel: "apple-touch-icon", href: "/favicon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" },
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(siteConfigQuery),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { pathname } = useLocation();
  const adminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  // Beranda ("/") punya header sendiri (GobiHeader di routes/index.tsx), jadi header global disembunyikan di sana agar tidak dobel.
  const homePage = pathname === "/";
  const navVisible = useMobileNavVisible();
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      if (reloadOnceForStaleChunk()) e.preventDefault();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {adminArea ? (
          // The admin dashboard has its own full-screen shell with a sidebar.
          <div className="min-h-screen bg-background font-sans"><Outlet /></div>
        ) : (
          // Ruang di bawah supaya isi dan footer tidak tertutup menu bawah mobile (lg ke atas tidak punya menu bawah).
          <div className={cn("flex min-h-screen flex-col bg-background font-sans", navVisible && "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0")}>
            {!homePage && <SiteHeader />}
            <AnnouncementBar />
            <div className="flex-1">
              {/* Required: nested routes render here. */}
              <FeatureGate><RoleGate><Outlet /></RoleGate></FeatureGate>
            </div>
            <SiteFooter />
          </div>
        )}
        <AccountTypePrompt />
        <MobileBottomNav />
        <ChatDock />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
