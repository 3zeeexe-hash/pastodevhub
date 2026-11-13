import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GobiLoader } from "@/components/gobi-loader";
import { cn } from "@/lib/utils";

/** Private chat between a client and one applicant. */
export function ApplicationThread({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["job-messages", applicationId],
    refetchInterval: 8000,
    queryFn: async () => (await supabase.from("job_messages").select("id,body,created_at,sender_id, sender:profiles!job_messages_sender_id_fkey(username)").eq("application_id", applicationId).order("created_at")).data ?? [],
  });
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !user) return;
    setBusy(true);
    const { error } = await supabase.from("job_messages").insert({ application_id: applicationId, sender_id: user.id, body: text.slice(0, 4000) });
    setBusy(false);
    if (error) { toast.error("Pesan gagal dikirim."); return; }
    setBody("");
    qc.invalidateQueries({ queryKey: ["job-messages", applicationId] });
  }
  return (
    <div className="rounded-xl border border-border bg-background/50">
      {isLoading ? <GobiLoader compact /> : (
        <ul className="max-h-72 space-y-2 overflow-y-auto p-3">
          {data.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">Belum ada pesan. Mulai obrolan untuk membahas detail pekerjaan.</li>}
          {data.map((m: any) => {
            const mine = m.sender_id === user?.id;
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary text-secondary-foreground")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>@{m.sender?.username} · {timeAgo(m.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tulis pesan…" rows={1} className="min-h-9 flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
        <Button size="icon" disabled={busy || !body.trim()} aria-label="Kirim pesan">{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
      </form>
    </div>
  );
}
