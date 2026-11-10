import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProductCard, PRODUCT_SELECT, type ProductCardData } from "@/components/market-cards";

export const Route = createFileRoute("/studio/karya/")({ component: MyKarya });

function MyKarya() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["products", "mine", user?.id],
    enabled: !!user,
    queryFn: async () => ((await supabase.from("products").select(PRODUCT_SELECT).eq("owner_id", user!.id).order("created_at", { ascending: false })).data ?? []) as unknown as ProductCardData[],
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Karya saya</h1>
        <Button asChild><Link to="/studio/karya/$id" params={{ id: "baru" }}><Plus /> Unggah karya</Link></Button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((p) => (
          <div key={p.id} className="space-y-2">
            <ProductCard p={p} />
            <Button asChild size="sm" variant="secondary" className="w-full"><Link to="/studio/karya/$id" params={{ id: p.id }}>Edit</Link></Button>
          </div>
        ))}
      </div>
      {!isLoading && data.length === 0 && <p className="mt-8 text-center text-muted-foreground">Belum ada karya. Unggah source code, template, atau proyekmu — gratis atau berbayar.</p>}
    </div>
  );
}
