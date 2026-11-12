import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Lock, Megaphone, PowerOff, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { featureForPath, featureLabel, isFeatureOn } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { ROLE_INFO, capabilityForPath, roleCan, roleFor, workspacePath, accountTypeFor } from "@/lib/roles";
import { useRole } from "@/lib/use-role";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Site-wide message set by the admin. */
export function AnnouncementBar() {
  const { announcement, announcementLevel } = useSiteConfig();
  if (!announcement) return null;
  const warn = announcementLevel === "warning";
  const Icon = warn ? TriangleAlert : Megaphone;
  return (
    <div role="status" className={cn("border-b px-4 py-2 text-sm", warn ? "border-warning/40 bg-warning/15 text-foreground" : "border-primary/30 bg-primary/10 text-foreground")}>
      <p className="mx-auto flex max-w-7xl items-start gap-2"><Icon className={cn("mt-0.5 size-4 shrink-0", warn ? "text-warning" : "text-primary")} /><span className="min-w-0 whitespace-pre-line">{announcement}</span></p>
    </div>
  );
}

/** Shows a "switched off" page instead of a feature's pages while the admin has it off. Admins still see the page. */
export function FeatureGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { flags } = useSiteConfig();
  const { isAdmin } = useAuth();
  const key = featureForPath(pathname);
  if (!key || isFeatureOn(flags, key)) return <>{children}</>;
  if (isAdmin) {
    return (
      <>
        <p className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm">Fitur “{featureLabel(key)}” sedang dinonaktifkan. Kamu melihatnya karena kamu admin.</p>
        {children}
      </>
    );
  }
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <PowerOff className="size-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-bold">Fitur “{featureLabel(key)}” sedang dinonaktifkan</h1>
      <p className="mt-2 text-sm text-muted-foreground">Pengelola Pastodev menonaktifkan fitur ini untuk sementara. Coba lagi nanti.</p>
      <Button asChild className="mt-6"><Link to="/">Ke beranda</Link></Button>
    </main>
  );
}

/**
 * Menutup halaman fitur yang bukan milik peran aktif (mis. Repositori baru untuk Client, Pasang lowongan untuk Developer).
 * Pengguna belum masuk tidak ditahan di sini: halaman itu sendiri menampilkan ajakan masuk.
 */
export function RoleGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  const { role, setRole, switching } = useRole();
  const navigate = useNavigate();
  const cap = capabilityForPath(pathname);
  if (!cap || !user || !profile || !profile.account_type || roleCan(role, cap)) return <>{children}</>;
  const target = roleFor(cap);
  async function switchAndStay() {
    if (await setRole(target)) navigate({ to: pathname });
  }
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <Lock className="size-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-bold">Halaman ini tidak ada di peran {ROLE_INFO[role].title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Fitur ini dipakai oleh peran {ROLE_INFO[target].title}. Kamu bisa berganti peran kapan saja tanpa membuat akun baru.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void switchAndStay()} disabled={switching}>Pakai sebagai {ROLE_INFO[target].title}</Button>
        <Button asChild variant="outline"><Link to={workspacePath(accountTypeFor(role))}>{ROLE_INFO[role].workspaceLabel}</Link></Button>
      </div>
    </main>
  );
}
