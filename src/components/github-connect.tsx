import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Github } from "lucide-react";
import { disconnectGithub, githubStatus } from "@/lib/github.functions";
import { connectGithub, githubErrorMessage } from "@/lib/github-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function useGithubStatus() {
  const { user } = useAuth();
  const status = useServerFn(githubStatus);
  return useQuery({ queryKey: ["github-status", user?.id], enabled: !!user, queryFn: () => status() });
}

export function GithubConnectCard({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useGithubStatus();
  const disconnect = useServerFn(disconnectGithub);
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setBusy(true);
    try {
      const wasConnected = data?.connected;
      const r = await connectGithub();
      await qc.invalidateQueries({ queryKey: ["github-status"] });
      await qc.invalidateQueries({ queryKey: ["github-repos"] });
      toast.success(wasConnected ? "GitHub terhubung ulang." : `GitHub terhubung${r.login ? ` sebagai @${r.login}` : ""}.`);
    } catch (e) {
      toast.error(githubErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function onDisconnect() {
    if (!confirm("Putuskan koneksi GitHub?")) return;
    setBusy(true);
    try { await disconnect(); await qc.invalidateQueries({ queryKey: ["github-status"] }); toast.success("GitHub diputus."); }
    catch (e) { toast.error(githubErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-3" : "flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4"}>
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary"><Github className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">GitHub</p>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Memeriksa…" : data?.connected && data.reconnect ? "Akses GitHub perlu diperbarui — klik Hubungkan ulang." : data?.connected ? <>Terhubung{data.login ? <> sebagai <b className="text-foreground">@{data.login}</b></> : ""}</> : "Hubungkan untuk impor & ekspor repositori."}
        </p>
      </div>
      {data?.connected ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onConnect} disabled={busy}>Hubungkan ulang</Button>
          <Button size="sm" variant="ghost" onClick={onDisconnect} disabled={busy}>Putuskan</Button>
        </div>
      ) : (
        <Button size="sm" onClick={onConnect} disabled={busy || isLoading}><Github /> Hubungkan GitHub</Button>
      )}
    </div>
  );
}
