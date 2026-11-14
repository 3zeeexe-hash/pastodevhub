import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { timeAgo } from "@/lib/auth";
import { errMsg, safeUrl } from "@/lib/market";
import { AvatarMini } from "@/components/avatar-mini";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAskAdmin } from "@/lib/admin-ask";
import { GobiLoader } from "@/components/gobi-loader";

export const Route = createFileRoute("/admin/verifikasi")({
  head: () => ({ meta: [{ title: "Verifikasi developer — Admin Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: VerificationQueuePage,
});

type Status = "pending" | "approved" | "rejected";
const TABS: [Status, string][] = [["pending", "Menunggu"], ["approved", "Disetujui"], ["rejected", "Ditolak"]];

type ReqRow = {
  id: string;
  user_id: string;
  message: string;
  proof_url: string | null;
  status: Status;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  user: { username: string; display_name: string | null; avatar_url: string | null; headline: string | null; skills: string[] | null } | null;
};

// The verification tables are not in the generated types until the database change is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function VerificationQueuePage() {
  const ask = useAskAdmin();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-verifications", status],
    queryFn: async () => {
      const { data, error } = await sb
        .from("verification_requests")
        .select("id,user_id,message,proof_url,status,admin_note,created_at,reviewed_at, user:profiles!verification_requests_user_id_fkey(username,display_name,avatar_url,headline,skills)")
        .eq("status", status)
        .order("created_at", { ascending: status === "pending" })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ReqRow[];
    },
  });

  async function review(r: ReqRow, approve: boolean) {
    let note = "";
    if (!approve) {
      const res = await ask({ title: "Tolak pengajuan ini?", description: "Developer akan melihat alasan penolakan.", confirmLabel: "Tolak pengajuan", destructive: true, reason: { label: "Alasan penolakan (dibaca developer)" } });
      if (!res) return;
      note = res.reason;
    }
    setBusy(r.id);
    const { error } = await sb.rpc("admin_review_verification", { _request: r.id, _approve: approve, _note: note });
    setBusy(null);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(approve ? "Developer diverifikasi" : "Pengajuan ditolak");
    qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
    qc.invalidateQueries({ queryKey: ["verified-usernames"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map(([s, label]) => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={cn("border-b-2 px-3 py-2 text-sm", status === s ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{label}</button>
        ))}
      </div>
      {isLoading && <GobiLoader />}
      {isError && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Tabel pengajuan verifikasi belum ada di database. Terapkan perubahan database dari <code className="font-mono">docs/sql/0004_verifikasi_developer.sql</code> lewat Lovable dulu.
        </p>
      )}
      <ul className="space-y-3">
        {data?.map((r) => {
          const proof = safeUrl(r.proof_url);
          return (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <AvatarMini name={r.user?.username ?? "?"} url={r.user?.avatar_url} size={44} />
                <div className="min-w-0 flex-1">
                  {r.user ? (
                    <Link to="/$username" params={{ username: r.user.username }} className="font-semibold hover:underline">{r.user.display_name || r.user.username}</Link>
                  ) : <span className="font-semibold">Akun dihapus</span>}
                  {r.user && <span className="ml-2 font-mono text-xs text-muted-foreground">@{r.user.username}</span>}
                  {r.user?.headline && <p className="text-sm text-muted-foreground">{r.user.headline}</p>}
                  {(r.user?.skills?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">{r.user!.skills!.slice(0, 6).map((s) => <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{s}</span>)}</div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{r.message}</p>
              {proof && <a href={proof} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 break-all text-sm text-link hover:underline"><ExternalLink className="size-3.5 shrink-0" /> {proof}</a>}
              {r.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => review(r, true)}>Setujui & beri centang</Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => review(r, false)}>Tolak</Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {r.status === "approved" ? "Disetujui" : "Ditolak"}{r.reviewed_at ? ` ${timeAgo(r.reviewed_at)}` : ""}{r.admin_note ? ` · Catatan: ${r.admin_note}` : ""}
                </p>
              )}
            </li>
          );
        })}
        {data && data.length === 0 && <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Tidak ada pengajuan.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Mau mencabut centang yang sudah diberikan? Buka Pengguna, pilih akunnya, lalu “Cabut centang biru”.</p>
    </div>
  );
}
