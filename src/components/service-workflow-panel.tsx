import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Clock, ExternalLink, Link2, Send, X } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { looseDb } from "@/lib/escrow-db";
import { errMsg } from "@/lib/market";
import { SERVICE_STAGE_LABEL, type ServiceOrderStage } from "@/lib/services";
import { normalizeReferences, validReferenceUrl, type Reference } from "@/lib/services-checkout";
import { serviceRpc } from "@/lib/services-db";
import {
  MAX_SUBMISSION_ATTACHMENTS, REVISION_NOTE_MAX, SUBMIT_NOTE_MAX, declineErrors, dueState, revisionErrors, submitWorkErrors, workflowPanel,
  type RevisionRow, type SubmissionRow,
} from "@/lib/services-workflow";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReasonDialog, type Ask } from "@/components/work-ui";
import { cn } from "@/lib/utils";

type FlowOrder = { stage: ServiceOrderStage; due_at: string | null; delivery_days: number; revisions_included: number; revisions_used: number; accepted_at: string | null };

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as T[]);
}

function SubmissionView({ s, label }: { s: SubmissionRow; label: string }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label} · {timeAgo(s.created_at)}</p>
      <p className="whitespace-pre-wrap break-words">{s.note}</p>
      <ul className="space-y-1 text-xs">
        {s.demo_url && <li className="flex items-center gap-1.5"><ExternalLink className="size-3.5 shrink-0" /><a href={s.demo_url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-primary hover:underline">Demo: {s.demo_url}</a></li>}
        {s.repo_url && <li className="flex items-center gap-1.5"><Link2 className="size-3.5 shrink-0" /><a href={s.repo_url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-primary hover:underline">Repositori: {s.repo_url}</a></li>}
        {(Array.isArray(s.attachments) ? s.attachments : []).map((a) => (
          <li key={a.url} className="flex items-center gap-1.5"><Link2 className="size-3.5 shrink-0" /><a href={a.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate text-primary hover:underline">{a.name || a.url}</a></li>
        ))}
      </ul>
    </div>
  );
}

/** Lampiran hasil: tautan https atau gambar yang diunggah, maks 5. */
function AttachmentField({ refs, onChange, disabled }: { refs: Reference[]; onChange: (r: Reference[]) => void; disabled?: boolean }) {
  const [link, setLink] = useState("");
  function add() {
    if (!validReferenceUrl(link)) { toast.error("Tautan harus diawali https:// dan tanpa spasi."); return; }
    onChange(normalizeReferences([...refs, { url: link.trim(), name: "" }]));
    setLink("");
  }
  return (
    <div className="space-y-2">
      <Label>Lampiran hasil (opsional, maks {MAX_SUBMISSION_ATTACHMENTS})</Label>
      {refs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {refs.map((r) => (
            <li key={r.url} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1">
              <Link2 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.name || r.url}</span>
              <button type="button" aria-label="Hapus lampiran" onClick={() => onChange(refs.filter((x) => x.url !== r.url))}><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {refs.length < MAX_SUBMISSION_ATTACHMENTS && (
        <>
          <div className="flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (Drive, Figma, file hasil)" disabled={disabled} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <Button type="button" variant="secondary" onClick={add} disabled={disabled || !link.trim()}>Tambah</Button>
          </div>
          <ImageUpload value={null} onChange={(u) => { if (u) onChange(normalizeReferences([...refs, { url: u, name: "Gambar hasil" }])); }} folder="deliveries" label="Unggah gambar hasil" />
        </>
      )}
    </div>
  );
}

/**
 * Alur pengerjaan pesanan paket: penjual menerima/menolak dan mengirim hasil; pembeli memeriksa, menyetujui, atau meminta revisi.
 * Semua aksi memanggil fungsi database (service_*) yang memeriksa peran dan status; tombol di sini hanya mengikuti hasilnya.
 */
export function ServiceWorkflowPanel({ orderId, buyerId, sellerId, isAdmin, onChanged }: {
  orderId: string; buyerId: string; sellerId: string; isAdmin: boolean; onChanged?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [demo, setDemo] = useState("");
  const [repo, setRepo] = useState("");
  const [atts, setAtts] = useState<Reference[]>([]);
  const [revNote, setRevNote] = useState("");

  const q = useQuery({
    queryKey: ["service-workflow", orderId],
    queryFn: async () => {
      const [so, subs, revs] = await Promise.all([
        rows<FlowOrder>(looseDb.from("service_orders").select("stage,due_at,delivery_days,revisions_included,revisions_used,accepted_at").eq("order_id", orderId).limit(1)),
        rows<SubmissionRow>(looseDb.from("service_submissions").select("id,note,demo_url,repo_url,attachments,revision_no,created_at").eq("order_id", orderId).order("created_at")),
        rows<RevisionRow>(looseDb.from("service_revisions").select("id,note,submission_id,created_at").eq("order_id", orderId).order("created_at")),
      ]);
      return { so: so[0] ?? null, subs, revs };
    },
  });

  const d = q.data;
  if (!d?.so) return null;
  const so = d.so;
  const role = user?.id === sellerId ? "seller" : user?.id === buyerId ? "buyer" : isAdmin ? "admin" : null;
  const { panel, waitingFor } = workflowPanel(so.stage, role);
  const latest = d.subs[d.subs.length - 1] ?? null;
  const lastRevision = d.revs[d.revs.length - 1] ?? null;
  const left = Math.max(0, so.revisions_included - so.revisions_used);
  const due = so.accepted_at ? dueState(so.due_at) : null;
  const history = [
    ...d.subs.map((s) => ({ at: s.created_at, kind: "sub" as const, s })),
    ...d.revs.map((r) => ({ at: r.created_at, kind: "rev" as const, r })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function call<T>(fn: string, args: Record<string, unknown>, ok: string): Promise<T | null> {
    setBusy(true);
    try {
      const res = await serviceRpc<T>(fn, args);
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["service-workflow", orderId] });
      await qc.invalidateQueries({ queryKey: ["service-seller-orders"] });
      onChanged?.();
      return res ?? (true as unknown as T);
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    setAsk({
      title: "Tolak pesanan", label: "Alasan (dikirim ke pembeli)", min: 10, confirm: "Tolak dan kembalikan dana",
      onSubmit: async (t) => {
        const errs = declineErrors(t);
        if (errs.length) { toast.error(errs[0]); return; }
        await call("service_decline_order", { _order_id: orderId, _reason: t.trim() }, "Pesanan ditolak. Dana akan dikembalikan melalui admin.");
      },
    });
  }

  async function submitWork(e: React.FormEvent) {
    e.preventDefault();
    const form = { note, demoUrl: demo, repoUrl: repo, attachments: atts };
    const errs = submitWorkErrors(form);
    if (errs.length) { toast.error(errs[0]); return; }
    const ok = await call("service_submit_work", { _order_id: orderId, _note: note.trim(), _demo_url: demo.trim() || null, _repo_url: repo.trim() || null, _attachments: normalizeReferences(atts) }, "Hasil dikirim ke pembeli");
    if (ok) { setNote(""); setDemo(""); setRepo(""); setAtts([]); }
  }

  async function requestRevision(e: React.FormEvent) {
    e.preventDefault();
    const errs = revisionErrors({ note: revNote, used: so.revisions_used, included: so.revisions_included });
    if (errs.length) { toast.error(errs[0]); return; }
    const ok = await call("service_request_revision", { _order_id: orderId, _note: revNote.trim() }, "Revisi diminta");
    if (ok) setRevNote("");
  }

  async function approve() {
    if (!confirm("Setujui hasil dan tandai pesanan selesai? Dana akan diteruskan ke developer.")) return;
    await call("service_approve_work", { _order_id: orderId }, "Hasil disetujui, pesanan selesai");
  }

  const showCard = panel !== "none" || history.length > 0 || !!due;
  if (!showCard) return null;

  return (
    <section className="space-y-4 rounded-lg border border-primary/50 bg-card p-4" aria-label="Alur pengerjaan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Alur pengerjaan</h2>
        <span className="text-sm text-muted-foreground">{SERVICE_STAGE_LABEL[so.stage]}</span>
      </div>

      {due && so.stage !== "completed" && so.stage !== "cancelled" && (
        <p className={cn("flex items-center gap-1.5 text-sm", due.kind === "overdue" ? "text-destructive" : "text-muted-foreground")}>
          <Clock className="size-4" /> {due.label}{so.due_at && ` (${new Date(so.due_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })})`}
          · {left} dari {so.revisions_included} revisi tersisa
        </p>
      )}

      {panel === "waiting" && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Menunggu {waitingFor === "penjual" ? "penjual menerima atau mengerjakan pesanan" : "pembeli memeriksa hasil"}. Kamu bisa memakai chat untuk berkomunikasi.</p>}

      {panel === "decide" && (
        <div className="space-y-3 rounded-md bg-muted p-3 text-sm">
          <p><b>Pesanan ini sudah dibayar.</b> Terima untuk mulai mengerjakan (estimasi {so.delivery_days} hari dihitung sejak kamu menerima), atau tolak dengan alasan. Jika ditolak, dana dibekukan dan dikembalikan ke pembeli oleh admin.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => call("service_accept_order", { _order_id: orderId }, "Pesanan diterima, selamat mengerjakan")}><Check /> Terima pesanan</Button>
            <Button variant="outline" disabled={busy} onClick={decline}><X /> Tolak</Button>
          </div>
        </div>
      )}

      {panel === "submit" && (
        <form onSubmit={submitWork} className="space-y-3">
          {so.stage === "revision_requested" && lastRevision && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"><b>Revisi diminta pembeli:</b> <span className="whitespace-pre-wrap break-words">{lastRevision.note}</span></p>
          )}
          <h3 className="text-sm font-medium">{so.stage === "revision_requested" ? "Kirim hasil revisi" : "Kirim hasil pekerjaan"}</h3>
          <div><Label htmlFor="sw-note">Catatan hasil</Label><Textarea id="sw-note" rows={4} maxLength={SUBMIT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang sudah dikerjakan, cara memakai, hal yang perlu diperhatikan." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sw-demo">Link demo</Label><Input id="sw-demo" value={demo} onChange={(e) => setDemo(e.target.value)} placeholder="https://demo.contoh.id" maxLength={2000} /></div>
            <div><Label htmlFor="sw-repo">Link repositori</Label><Input id="sw-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/…" maxLength={2000} /></div>
          </div>
          <AttachmentField refs={atts} onChange={setAtts} disabled={busy} />
          <Button disabled={busy}><Send /> {busy ? "Mengirim…" : "Kirim hasil"}</Button>
        </form>
      )}

      {panel === "review" && latest && (
        <div className="space-y-3">
          <SubmissionView s={latest} label={latest.revision_no > 0 ? `Hasil revisi ke-${latest.revision_no}` : "Hasil pekerjaan"} />
          <p className="text-sm text-muted-foreground">Periksa hasilnya. <b>Setujui</b> berarti kamu menerima hasil dan dana diteruskan ke developer. Kalau masih ada yang kurang, minta revisi ({left} dari {so.revisions_included} revisi tersisa).</p>
          <Button disabled={busy} onClick={approve}><Check /> Setujui hasil</Button>
          <form onSubmit={requestRevision} className="space-y-2 rounded-md border border-border p-3">
            <Label htmlFor="rv-note">Minta revisi</Label>
            <Textarea id="rv-note" rows={3} maxLength={REVISION_NOTE_MAX} value={revNote} onChange={(e) => setRevNote(e.target.value)} disabled={left <= 0}
              placeholder={left > 0 ? "Jelaskan bagian yang perlu diperbaiki sejelas mungkin." : "Jatah revisi paket sudah habis. Hubungi penjual untuk revisi tambahan."} />
            <Button type="submit" variant="outline" disabled={busy || left <= 0}>Kirim permintaan revisi</Button>
          </form>
        </div>
      )}

      {history.length > 0 && (
        <details className="text-sm" open={panel === "none"}>
          <summary className="cursor-pointer font-medium">Riwayat hasil dan revisi ({history.length})</summary>
          <ul className="mt-2 space-y-2">
            {[...history].reverse().map((h) => h.kind === "sub"
              ? <li key={h.s.id}><SubmissionView s={h.s} label={h.s.revision_no > 0 ? `Hasil revisi ke-${h.s.revision_no}` : "Hasil pekerjaan"} /></li>
              : <li key={h.r.id} className="rounded-md bg-muted p-3 text-xs"><p className="text-muted-foreground">Revisi diminta · {timeAgo(h.r.created_at)}</p><p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{h.r.note}</p></li>)}
          </ul>
        </details>
      )}

      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
