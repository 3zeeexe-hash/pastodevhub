import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { rp, workRpc } from "@/lib/work-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/kontrak/baru")({
  validateSearch: (s: Record<string, unknown>) => ({ application: typeof s.application === "string" ? s.application : "" }),
  component: NewContract,
});

type AppInfo = {
  id: string; status: string; bid_amount: number; est_days: number; developer_id: string;
  job: { id: string; title: string; payment_type: string; client_id: string; deadline: string | null } | null;
};

function NewContract() {
  const { application } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ["work-new-contract", application],
    enabled: !!application,
    queryFn: async () => {
      const a = await looseDb.from("job_applications").select("id,status,bid_amount,est_days,developer_id,job:jobs(id,title,payment_type,client_id,deadline)").eq("id", application).maybeSingle();
      if (a.error) throw new Error(errMsg(a.error));
      const c = await looseDb.from("work_contracts").select("id").eq("application_id", application).maybeSingle();
      return { app: (a.data as unknown as AppInfo | null) ?? null, contractId: ((c.data as { id: string } | null)?.id) ?? null };
    },
  });
  const [f, setF] = useState({ scope: "", revision: "", usage: "", cancel: "", payment: "", deadline: "" });
  const [busy, setBusy] = useState(false);

  if (!application) return <EmptyState>Pilih pelamar yang diterima dari halaman lowongan untuk membuat kontrak.</EmptyState>;
  if (info.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (info.error) return <ErrorState error={info.error} onRetry={() => info.refetch()} />;
  const a = info.data?.app;
  if (!a || !a.job) return <EmptyState>Lamaran tidak ditemukan.</EmptyState>;
  if (a.job.client_id !== user?.id) return <EmptyState>Hanya pemilik lowongan yang bisa membuat kontrak.</EmptyState>;
  if (info.data?.contractId) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <p>Kontrak untuk lamaran ini sudah dibuat.</p>
        <Button asChild><Link to="/kerja/kontrak/$id" params={{ id: info.data.contractId }}>Buka kontrak</Link></Button>
      </div>
    );
  }
  if (a.status !== "accepted") return <EmptyState>Terima pelamar dulu sebelum membuat kontrak.</EmptyState>;

  const hourly = a.job.payment_type === "hourly";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.scope.trim().length < 20) { toast.error("Ruang lingkup minimal 20 karakter."); return; }
    if (f.deadline && new Date(f.deadline) < new Date(new Date().toDateString())) { toast.error("Deadline tidak boleh di masa lalu."); return; }
    setBusy(true);
    try {
      const id = await workRpc<string>("work_create_contract", {
        _application_id: application, _scope: f.scope.trim(), _revision_terms: f.revision.trim(), _usage_rights: f.usage.trim(),
        _cancellation_terms: f.cancel.trim(), _payment_terms: f.payment.trim(), _deadline: f.deadline || null,
      });
      toast.success("Kontrak draft dibuat. Atur nilai dan milestone, lalu kirim ke freelancer.");
      navigate({ to: "/kerja/kontrak/$id", params: { id } });
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Link to="/lowongan/$id" params={{ id: a.job.id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Kembali ke lowongan</Link>
      <header>
        <h1 className="text-2xl font-bold">Buat kontrak</h1>
        <p className="mt-1 text-sm text-muted-foreground">{a.job.title} · penawaran {hourly ? `${rp(a.bid_amount)}/jam` : rp(a.bid_amount)}. Nilai dan milestone bisa diatur setelah draft dibuat.</p>
      </header>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1.5"><Label htmlFor="scope">Ruang lingkup pekerjaan *</Label><Textarea id="scope" rows={5} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} maxLength={4000} placeholder="Apa saja yang dikerjakan dan hasil akhirnya." /></div>
        <div className="space-y-1.5"><Label htmlFor="rev">Ketentuan revisi</Label><Textarea id="rev" rows={3} value={f.revision} onChange={(e) => setF({ ...f, revision: e.target.value })} maxLength={4000} placeholder="Contoh: 2 kali revisi per milestone." /></div>
        <div className="space-y-1.5"><Label htmlFor="use">Hak penggunaan hasil pekerjaan</Label><Textarea id="use" rows={3} value={f.usage} onChange={(e) => setF({ ...f, usage: e.target.value })} maxLength={4000} placeholder="Contoh: hak penuh pindah ke client setelah dana diteruskan." /></div>
        <div className="space-y-1.5"><Label htmlFor="can">Ketentuan pembatalan</Label><Textarea id="can" rows={3} value={f.cancel} onChange={(e) => setF({ ...f, cancel: e.target.value })} maxLength={4000} /></div>
        <div className="space-y-1.5"><Label htmlFor="pay">Ketentuan pembayaran</Label><Textarea id="pay" rows={3} value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} maxLength={4000} placeholder="Pembayaran lewat Midtrans; dana ditahan escrow sampai hasil disetujui." /></div>
        <div className="max-w-xs space-y-1.5"><Label htmlFor="dl">Deadline</Label><Input id="dl" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
        <Button disabled={busy}>{busy && <Loader2 className="animate-spin" />} Buat kontrak draft</Button>
      </form>
    </div>
  );
}
