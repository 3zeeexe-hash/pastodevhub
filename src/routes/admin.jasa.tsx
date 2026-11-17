import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServicesAudit, ServicesList, ServicesOverview, ServicesSettings } from "@/components/admin-services";
import { ServicesTransactions } from "@/components/admin-service-transactions";

// Tab dipilih lewat ?tab= supaya tiap menu GOBI SERVICE di sidebar admin (lihat admin-nav.tsx) bisa menuju tab-nya langsung.
// Tanpa ?tab=, yang terbuka adalah "jasa" (daftar + antrean moderasi), sama seperti sebelumnya.
const TAB_KEYS = ["ringkasan", "jasa", "transaksi", "pengaturan", "audit"] as const;
type TabKey = (typeof TAB_KEYS)[number];
const searchSchema = z.object({ tab: z.enum(TAB_KEYS).optional().catch(undefined) });

export const Route = createFileRoute("/admin/jasa")({ validateSearch: searchSchema, component: AdminServices });

// Judul dan keterangan halaman datang dari AdminShell (lihat admin-nav.tsx).
function AdminServices() {
  const { tab = "jasa" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (t: string) => void navigate({ search: { tab: (TAB_KEYS as readonly string[]).includes(t) ? (t as TabKey) : "jasa" }, replace: true });
  return (
    <Tabs value={tab} onValueChange={go}>
      <TabsList className="h-auto flex-wrap justify-start">
        <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
        <TabsTrigger value="jasa">Jasa & antrean</TabsTrigger>
        <TabsTrigger value="transaksi">Transaksi</TabsTrigger>
        <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>
      <TabsContent value="ringkasan" className="mt-4"><ServicesOverview /></TabsContent>
      <TabsContent value="jasa" className="mt-4"><ServicesList /></TabsContent>
      <TabsContent value="transaksi" className="mt-4"><ServicesTransactions /></TabsContent>
      <TabsContent value="pengaturan" className="mt-4"><ServicesSettings /></TabsContent>
      <TabsContent value="audit" className="mt-4"><ServicesAudit /></TabsContent>
    </Tabs>
  );
}
