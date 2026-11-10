import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ServiceCard, SERVICE_SELECT, type ServiceCardData } from "@/components/market-cards";

export const Route = createFileRoute("/studio/jasa/")({ component: MyJasa });

function MyJasa() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["services", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("services").select(SERVICE_SELECT).eq("owner_id", user!.id).order("created_at", { ascending: false })).data ?? []) as unknown as ServiceCardData[],
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Jasa saya</h1>
        <Button asChild><Link to="/studio/jasa/$id" params={{ id: "baru" }}><Plus /> Buka jasa</Link></Button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((s) => (
          <div key={s.id} className="space-y-2">
            <ServiceCard s={s} />
            <Button asChild size="sm" variant="secondary" className="w-full"><Link to="/studio/jasa/$id" params={{ id: s.id }}>Edit</Link></Button>
          </div>
        ))}
      </div>
      {!isLoading && data.length === 0 && <p className="mt-8 text-center text-muted-foreground">Belum ada jasa. Buka jasa seperti pembuatan website, aplikasi, atau desain.</p>}
    </div>
  );
}
