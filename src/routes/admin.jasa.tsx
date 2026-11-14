import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServicesAudit, ServicesList, ServicesOverview, ServicesSettings } from "@/components/admin-services";

export const Route = createFileRoute("/admin/jasa")({ component: AdminServices });

function AdminServices() {
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">GOBI SERVICES</h2>
        <p className="text-sm text-muted-foreground">Moderasi jasa: setujui, tolak, minta perbaikan, atau tahan jasa. Setiap keputusan wajib beralasan (kecuali persetujuan), dikirim ke penjual sebagai notifikasi, dan tercatat di riwayat jasa serta audit log.</p>
      </header>
      <Tabs defaultValue="jasa">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="jasa">Jasa & antrean</TabsTrigger>
          <TabsTrigger value="pengaturan">Pengaturan</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="ringkasan" className="mt-4"><ServicesOverview /></TabsContent>
        <TabsContent value="jasa" className="mt-4"><ServicesList /></TabsContent>
        <TabsContent value="pengaturan" className="mt-4"><ServicesSettings /></TabsContent>
        <TabsContent value="audit" className="mt-4"><ServicesAudit /></TabsContent>
      </Tabs>
    </div>
  );
}
