// GOBI WORK — admin: tutup kontrak (dari sengketa, laporan, atau kasus). Memanggil work_admin_close_contract (SQL 011).
// Dialog ini menjelaskan akibatnya sebelum admin menekan tombol: milestone mana yang dibatalkan, dana mana yang kembali ke saldo client.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MilestonePill } from "@/components/work-ui";
import { Loading, must } from "@/components/admin-work-extra";
import type { MilestoneStatus } from "@/lib/work";

type Ms = { id: string; position: number; title: string; amount: number; status: MilestoneStatus };
const LIVE = ["funded", "in_progress", "submitted", "revision_requested", "disputed"];

export function CloseContractDialog({ contractId, reportId, onClose }: { contractId: string | null; reportId?: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    enabled: !!contractId,
    queryKey: ["work-admin-close-preview", contractId],
    queryFn: async () => (await must<Ms[]>(looseDb.from("contract_milestones").select("id,position,title,amount,status").eq("contract_id", contractId!).order("position"))) ?? [],
  });
  const ms = q.data ?? [];
  const approved = ms.filter((m) => m.status === "approved");
  const live = ms.filter((m) => LIVE.includes(m.status));
  const unpaid = ms.filter((m) => m.status === "pending" || m.status === "awaiting_payment");
  const refundSum = live.reduce((t, m) => t + m.amount, 0);
  const blocked = approved.length > 0 || (live.length > 0 && !refund);
  const noteOk = note.trim().length >= 5;

  async function submit() {
    if (!contractId || blocked || !noteOk) return;
    setBusy(true);
    try {
      await workRpc("work_admin_close_contract", { _contract_id: contractId, _note: note.trim(), _refund_funded: refund, _report_id: reportId ?? null });
      toast.success("Kontrak ditutup");
      for (const k of ["work-admin-case", "work-admin-cases", "work-admin-disputes", "work-admin-reports", "work-admin-stats"]) qc.invalidateQueries({ queryKey: [k] });
      setNote(""); setRefund(false);
      onClose();
    } catch (e) {
      const m = errMsg(e);
      toast.error(/could not find|schema cache/i.test(m) ? "Fitur ini butuh SQL 011 (docs/sql/gobi-work/011) dijalankan di database." : m);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={!!contractId} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Tutup kontrak</DialogTitle></DialogHeader>
        <Loading q={q} />
        {q.data && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">Kontrak ditandai selesai (bila sudah ada dana yang diteruskan) atau ditutup, sengketa terbuka diselesaikan, dan kedua pihak mendapat notifikasi. Aksi ini tercatat di audit log dan tidak bisa dibatalkan.</p>

            <ul className="space-y-1.5">
              {ms.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2">
                  <span>{m.position}. {m.title} · <b>{rp(m.amount)}</b></span>
                  <MilestonePill status={m.status} />
                </li>
              ))}
              {ms.length === 0 && <li className="text-muted-foreground">Kontrak belum punya milestone.</li>}
            </ul>

            {unpaid.length > 0 && <p className="rounded-xl bg-muted p-3">{unpaid.length} milestone yang belum dibayar akan dibatalkan beserta tagihannya.</p>}

            {approved.length > 0 && (
              <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {approved.length} milestone sudah disetujui client tetapi dananya belum diteruskan. Teruskan dulu ke freelancer di Escrow &amp; saldo, baru tutup kontrak.
              </p>
            )}

            {live.length > 0 && approved.length === 0 && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <p className="font-bold">{live.length} milestone berdana masih berjalan ({rp(refundSum)})</p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                  <span>Kembalikan dana yang masih tertahan ke saldo client dan batalkan milestone ini.</span>
                </label>
                {!refund && <p className="text-xs text-muted-foreground">Tanpa centang ini kontrak tidak bisa ditutup. Alternatif: putuskan sengketa atau teruskan dana ke freelancer lebih dulu.</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cc-note">Alasan penutupan (tercatat di audit)</Label>
              <Textarea id="cc-note" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>Batal</Button>
          <Button variant="destructive" disabled={busy || !q.data || blocked || !noteOk} onClick={submit}>{busy && <Loader2 className="animate-spin" />} Tutup kontrak</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
