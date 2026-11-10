import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, timeAgo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyLine } from "@/components/repo/git-clone";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  return `pdt_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Personal access tokens for git push/pull over HTTPS (like GitHub). */
export function GitTokensCard() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: tokens = [] } = useQuery({
    queryKey: ["git-tokens", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("git_tokens").select("id,name,token_prefix,created_at,last_used_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const token = newToken();
      const { error } = await supabase.from("git_tokens").insert({ user_id: user.id, name: name.trim() || "Terminal", token_hash: await sha256Hex(token), token_prefix: token.slice(0, 8) });
      if (error) throw error;
      setFresh(token);
      setName("");
      qc.invalidateQueries({ queryKey: ["git-tokens"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("git_tokens").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Token dicabut"); qc.invalidateQueries({ queryKey: ["git-tokens"] }); }
  }

  return (
    <div id="token-git" className="scroll-mt-20 rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">Token git (terminal)</p>
          <p className="text-sm text-muted-foreground">Dipakai sebagai kata sandi saat <code className="font-mono">git push</code> / <code className="font-mono">git clone</code> repo private, sama seperti personal access token GitHub.</p>
        </div>
      </div>
      {fresh && (
        <div className="mt-3 space-y-1 rounded-md border border-primary/50 bg-primary/5 p-3">
          <p className="text-sm font-medium">Salin token ini sekarang — tidak akan ditampilkan lagi.</p>
          <CopyLine value={fresh} label="token git" />
          <p className="text-xs text-muted-foreground">Username: <span className="font-mono">{profile?.username}</span> · Password: token di atas. Simpan dengan <code className="font-mono">git config --global credential.helper store</code>.</p>
        </div>
      )}
      <form onSubmit={create} className="mt-3 flex gap-2">
        <Input aria-label="Nama token" placeholder="Nama token, mis. Laptop kerja" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button disabled={busy} className="shrink-0">Buat token</Button>
      </form>
      <ul className="mt-3 divide-y divide-border">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{t.token_prefix}… · dibuat {timeAgo(t.created_at)}{t.last_used_at ? ` · dipakai ${timeAgo(t.last_used_at)}` : " · belum dipakai"}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Cabut token ${t.name}`} onClick={() => remove(t.id)}><Trash2 /></Button>
          </li>
        ))}
        {tokens.length === 0 && <li className="py-2 text-xs text-muted-foreground">Belum ada token.</li>}
      </ul>
    </div>
  );
}
