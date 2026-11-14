import type { ReactNode } from "react";
import { useRole } from "@/lib/use-role";
import { ROLE_INFO } from "@/lib/roles";
import { SideNavLayout } from "@/components/side-nav-layout";
import { navForRole } from "@/components/nav-data";

// Data menu pindah ke nav-data.ts; diekspor ulang di sini supaya impor lama tetap jalan.
export { DEV_NAV, CLIENT_NAV, navForRole } from "@/components/nav-data";

/** Side menu matching the active role (client dashboard, or the developer/freelancer/personal studio). */
export function AccountSideNav({ children }: { children: ReactNode }) {
  const { role } = useRole();
  return <SideNavLayout title={ROLE_INFO[role].workspaceLabel} nav={navForRole(role)}>{children}</SideNavLayout>;
}
