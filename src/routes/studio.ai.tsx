import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, BookMarked } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { AiSettingsPanel, useAiSettings } from "@/components/ai-settings";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/studio/ai")({ component: StudioAi });

function StudioAi() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useAiSettings();
  const { data = [] } = useQuery({
    queryKey: ["my-repos-ai", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("repositories").select("id,name,description,updated_at").eq("owner_id", user!.id).order("updated_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="size-6 text-primary" /> AI untuk repo</h1>
        <p className="text-sm text-muted-foreground">Hubungkan Gemini atau OpenAI milikmu, lalu chat untuk membangun atau memperbaiki kode di repositori — perubahan dicek dulu sebelum di-commit.</p>
      </div>
      <AiSettingsPanel settings={settings} onSave={setSettings} />
      <section>
        <h2 className="mb-2 font-semibold">Pilih repositori</h2>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada repositori. <Link to="/new" className="text-link hover:underline">Buat repositori</Link> atau <Link to="/import" className="text-link hover:underline">impor dari GitHub</Link>.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <BookMarked className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.description || "Tanpa deskripsi"} · {timeAgo(r.updated_at)}</p>
                </div>
                <Button asChild size="sm"><Link to="/$username/$repo/ai" params={{ username: profile!.username, repo: r.name }}><Bot /> Buka AI</Link></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
