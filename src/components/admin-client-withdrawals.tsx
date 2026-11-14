// GOBI WORK — admin: penarikan saldo client. Admin mentransfer manual ke rekening, lalu menandai "sudah ditransfer" (atau menolak: saldo kembali).
// Membutuhkan docs/sql/gobi-work/011_saldo_client_sengketa_otomatis.sql.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { workRpc } from "@/lib/work-db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Pill, ReasonDialog, type Ask } from "@/components/work-ui";
import { Loading, must } from "@/components/admin-work-extra";

type Row = { id: string; client_id: string; amount: number; bank_name: string; account_number: string; account_name: string; status: string; admin_note: string | null; created_at: string; processed_at: string | null };
type Prof = { id: string; username: string; display_name: string | null };
const LABEL: Record<string, string> = { requested: "Menunggu transfer", paid: "Sudah ditransfer", rejected: "Ditolak" };
const TONE: Record<string, "warn" | "ok" | "bad"> = { requested: "warn", paid: "ok", rejected: "bad" };

export function ClientWithdrawalsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("requested");
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-client-withdrawals"],
    queryFn: async () => {
      const rows = (await must<Row[]>(looseDb.from("client_withdrawals").select("*").order("created_at", { ascending: false }).limit(200))) ?? [];
      const ids = [...new Set(rows.map((r) => r.client_id))];
      const profs = ids.length ? ((await must<Prof[]>(looseDb.from("profiles").select("id,username,display_name").in("id", ids))) ?? []) : [];
      return { rows, profs: Object.fromEntries(profs.map((p) => [p.id, p])) as Record<string, Prof> };
    },
  });
  const count = (s: string) => (q.data?.rows ?? []).filter((r) => s === "all" || r.status === s).length;
  const shown = (q.data?.rows ?? []).filter((r) => status === "all" || r.status === status);

  async function act(id: string, action: "paid" | "rejected", note = "") {
    try {
      await workRpc("admin_process_client_withdrawal", { _id: id, _action: action, _note: note });
      toast.success(action === "paid" ? "Ditandai sudah ditransfer" : "Penarikan ditolak, saldo kembali ke client");
      qc.invalidateQueries({ queryKey: ["work-admin-client-withdrawals"] });
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-extrabold">Penarikan saldo client</h3>
        <p className="text-sm text-muted-foreground">Saldo client berasal dari dana yang dikembalikan (sengketa dimenangkan client, refund admin, kontrak ditutup). Transfer manual ke rekening di bawah, lalu tandai sudah ditransfer.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status penarikan client">
        {([["requested", "Menunggu"], ["paid", "Ditransfer"], ["rejected", "Ditolak"], ["all", "Semua"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={status === k} onClick={() => setStatus(k)}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition", status === k ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70")}>
            {l} <span className="rounded-full bg-black/10 px-1.5 text-[11px]">{count(k)}</span>
          </button>
        ))}
      </div>
      <Loading q={q} />
      {q.data && shown.length === 0 && <EmptyState>Tidak ada penarikan pada status ini.</EmptyState>}
      <ul className="space-y-2">
        {q.data && shown.map((r) => {
          const p = q.data.profs[r.client_id];
          return (
            <li key={r.id} className="space-y-2 rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-extrabold">{formatRupiah(r.amount)}</span>
                <Pill tone={TONE[r.status] ?? "info"}>{LABEL[r.status] ?? r.status}</Pill>
              </div>
              <p>{p ? `${p.display_name || p.username} (@${p.username})` : "Client"} · {timeAgo(r.created_at)}</p>
              <p className="rounded-xl bg-secondary/60 p-3 font-mono text-xs">{r.bank_name} · {r.account_number} · a.n. {r.account_name}</p>
              {r.admin_note && <p className="rounded-xl bg-muted p-2 text-xs">Catatan: {r.admin_note}</p>}
              {r.status === "requested" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-full" onClick={() => { if (confirm(`Sudah mentransfer ${formatRupiah(r.amount)} ke ${r.bank_name} ${r.account_number}?`)) void act(r.id, "paid"); }}>Tandai sudah ditransfer</Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setAsk({ title: "Tolak penarikan", label: "Alasan (dilihat client)", min: 3, confirm: "Tolak penarikan", onSubmit: async (t) => { await act(r.id, "rejected", t); } })}>Tolak</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
