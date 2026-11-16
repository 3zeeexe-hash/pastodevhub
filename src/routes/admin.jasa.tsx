import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServicesAudit, ServicesList, ServicesOverview, ServicesSettings } from "@/components/admin-services";
import { ServicesTransactions } from "@/components/admin-service-transactions";

export const Route = createFileRoute("/admin/jasa")({ component: AdminServices });

// Judul dan keterangan halaman datang dari AdminShell (lihat admin-nav.tsx).
function AdminServices() {
  return (
    <Tabs defaultValue="jasa">
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
