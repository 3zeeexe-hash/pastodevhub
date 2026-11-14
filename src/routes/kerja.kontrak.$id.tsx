import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, CreditCard, LifeBuoy, Loader2, Play, Plus, Scale, Send, Star, Trash2, X } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import {
  CONTRACT_SELECT, eventLabel, fmtDate, personName, rp, workRpc,
  type ContractRow, type DisputeRow, type EventRow, type MilestoneRow, type ReviewRow, type RevisionRow, type ScheduleSlot, type SlotChange,
  type SubmissionRow, type TimesheetRow, type WorkOrderRow,
} from "@/lib/work-db";
import { isClient, isFreelancer, milestoneActions, milestonesMatchTotal, timesheetSummary, validAmount, validTimesheetEntry } from "@/lib/work";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/rupiah-input";
import { parseRupiah } from "@/lib/rupiah";
import { isMissingFunction } from "@/lib/job-terms";
import { autoReleaseAt, canRequestRevision, formatDuration, hoursBetween, revisionsLeft, todayWIB } from "@/lib/work-deadline";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GobiLoader } from "@/components/gobi-loader";
import { ContractPill, EmptyState, ErrorState, MilestonePill, Pill, ReasonDialog, ReportButton, useRun, type Ask } from "@/components/work-ui";
import { MilestoneProgress } from "@/components/milestone-progress";
import { SchedulePanel, ScheduleDraftEditor } from "@/components/schedule-panel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kerja/kontrak/$id")({
  head: () => ({ meta: [{ title: "Kontrak — GOBI WORK" }, { name: "robots", content: "noindex" }] }),
  component: ContractPage,
});

// Gaya kartu yang sama dengan beranda.
const CARD = "rounded-2xl bg-card shadow-sm ring-1 ring-border";

type Loaded = {
  c: ContractRow; milestones: MilestoneRow[]; subs: SubmissionRow[]; revs: RevisionRow[];
  sheets: TimesheetRow[]; events: EventRow[]; disputes: DisputeRow[]; reviews: ReviewRow[]; orders: WorkOrderRow[];
  slots: ScheduleSlot[]; changes: SlotChange[];
};

async function loadContract(id: string): Promise<Loaded | null> {
  // Teruskan dana yang sudah melewati batas waktu client (SQL 006). Galat (mis. SQL belum dijalankan) diabaikan.
  try { await looseDb.rpc("work_sweep_due"); } catch { /* tidak kritis */ }
  const head = await looseDb.from("work_contracts").select(CONTRACT_SELECT).eq("id", id).maybeSingle();
  if (head.error) throw new Error(errMsg(head.error));
  if (!head.data) return null;
  const [ms, subs, ts, ev, dp, rv, od, sl, chg] = await Promise.all([
    looseDb.from("contract_milestones").select("*").eq("contract_id", id).order("position"),
    looseDb.from("work_submissions").select("id,milestone_id,note,links,created_at").eq("contract_id", id).order("created_at"),
    looseDb.from("work_timesheets").select("*").eq("contract_id", id).order("work_date", { ascending: false }),
    looseDb.from("work_contract_events").select("*").eq("contract_id", id).order("id", { ascending: false }).limit(60),
    looseDb.from("work_disputes").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
    looseDb.from("work_reviews").select("*").eq("contract_id", id),
    // Kolom work_contract_id ada setelah SQL 002; jika belum, daftar pesanan kosong.
    looseDb.from("orders").select("id,title,amount,status,paid_at,work_milestone_id,created_at").eq("work_contract_id", id).order("created_at", { ascending: false }),
    // Tabel jadwal ada setelah SQL 007; jika belum, dianggap kosong.
    looseDb.from("work_schedule_slots").select("*").eq("contract_id", id).order("work_date").order("start_time"),
    looseDb.from("work_schedule_changes").select("*").eq("contract_id", id).order("created_at", { ascending: false }),
  ]);
  for (const r of [ms, subs, ts, ev, dp, rv]) if (r.error) throw new Error(errMsg(r.error));
  const milestones = (ms.data ?? []) as MilestoneRow[];
  const ids = milestones.map((m) => m.id);
  const rev = ids.length ? await looseDb.from("work_revisions").select("id,milestone_id,note,created_at").in("milestone_id", ids).order("created_at") : { data: [], error: null };
  return {
    c: head.data as unknown as ContractRow, milestones,
    subs: (subs.data ?? []) as SubmissionRow[], revs: (rev.data ?? []) as RevisionRow[],
    sheets: ((ts.data ?? []) as TimesheetRow[]).map((t) => ({ ...t, hours: Number(t.hours) })),
    events: (ev.data ?? []) as EventRow[], disputes: (dp.data ?? []) as DisputeRow[], reviews: (rv.data ?? []) as ReviewRow[],
    orders: od.error ? [] : ((od.data ?? []) as WorkOrderRow[]),
    slots: sl.error ? [] : ((sl.data ?? []) as ScheduleSlot[]).map((s) => ({ ...s, hours: Number(s.hours) })),
    changes: chg.error ? [] : ((chg.data ?? []) as SlotChange[]),
  };
}

type Ctx = {
  c: ContractRow; uid: string; busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  setAsk: (a: Ask | null) => void;
  openOrder: (orderId: string) => void;
};

function ContractPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["work-contract", id], queryFn: () => loadContract(id), enabled: !!user });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-contract", id] }); qc.invalidateQueries({ queryKey: ["work-contracts"] }); qc.invalidateQueries({ queryKey: ["work-stats"] }); };
  const { busy, run } = useRun(refresh);
  const [ask, setAsk] = useState<Ask | null>(null);

  if (loading || q.isLoading) return <GobiLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  if (!d) return <EmptyState>Kontrak tidak ditemukan atau bukan milikmu.</EmptyState>;
  const { c } = d;
  const uid = user!.id;
  const iClient = isClient(c, uid);
  const iFree = isFreelancer(c, uid);
  const party = iClient || iFree;
  const sched = !!c.schedule_mode;
  const ctx: Ctx = { c, uid, busy, run, setAsk, openOrder: (orderId) => navigate({ to: "/pesanan/$id", params: { id: orderId } }) };
  const myReview = d.reviews.find((r) => r.reviewer_id === uid);
  const openDispute = d.disputes.some((x) => x.status !== "resolved");
  const pendingChanges = d.changes.some((x) => x.status === "pending");
  // Jadwal terkunci bila milestone sudah dibayar/berjalan atau sudah ada tagihan aktif (sama dengan aturan di database).
  const scheduleLocked = d.milestones.some((m) => !["pending", "awaiting_payment", "cancelled"].includes(m.status))
    || d.orders.some((o) => !["cancelled", "declined"].includes(o.status));
  const scheduleMilestone = d.milestones[0] ?? null;
  const other = iClient ? c.freelancer : c.client;

  const cancelAsk = (): Ask => ({
    title: "Batalkan kontrak", description: "Kontrak yang sudah punya dana atau pekerjaan berjalan tidak bisa dibatalkan; ajukan sengketa.",
    label: "Alasan pembatalan", min: 3, confirm: "Batalkan kontrak",
    onSubmit: async (t) => { await workRpc("work_cancel_contract", { _contract_id: c.id, _reason: t }); toast.success("Kontrak dibatalkan"); refresh(); },
  });
  const disputeAsk = (milestoneId: string | null): Ask => ({
    title: "Ajukan sengketa", description: "Dana milestone dibekukan sampai admin memutuskan berdasarkan ketentuan kontrak.",
    label: "Jelaskan masalahnya", min: 20, confirm: "Ajukan sengketa",
    onSubmit: async (t) => { await workRpc("work_open_dispute", { _contract_id: c.id, _milestone_id: milestoneId, _reason: t, _evidence: [] }); toast.success("Sengketa diajukan"); refresh(); },
  });
  ctx.setAsk = setAsk;

  return (
    <div className="space-y-6">
      <Link to="/kerja/kontrak" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Semua kontrak</Link>

      <header className="relative overflow-hidden rounded-3xl bg-header-gradient p-5 text-white shadow-md sm:p-6">
        <div className="pointer-events-none absolute -left-12 bottom-0 size-40 rounded-full bg-primary/30 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <ContractPill status={c.status} />
            <Pill tone="brand">{sched ? "Per jam (terjadwal)" : c.payment_type === "fixed" ? "Kerja langsung" : "Per jam"}</Pill>
            <span className="text-xs text-white/70">Versi {c.version}</span>
          </div>
          <h1 className="mt-2 break-words text-2xl font-extrabold">{c.title}</h1>
          <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm md:grid-cols-4">
            <Info label="Client" value={personName(c.client)} />
            <Info label="Freelancer" value={personName(c.freelancer)} />
            {sched
              ? <><Info label="Tarif per jam" value={rp(c.hourly_rate)} /><Info label="Total dibayar di muka" value={c.total_amount > 0 ? rp(c.total_amount) : "Belum dihitung"} /></>
              : <Info label={c.payment_type === "fixed" ? "Nilai kontrak" : "Tarif per jam"} value={c.payment_type === "fixed" ? rp(c.total_amount) : rp(c.hourly_rate)} />}
            <Info label="Selesai paling lambat" value={c.deadline ? fmtDate(c.deadline) : "Fleksibel"} />
            {c.payment_type === "fixed" && <Info label="Batas revisi" value={c.revision_limit ? `${c.revisions_used ?? 0} dari ${c.revision_limit} kali dipakai` : "Tanpa batas"} />}
          </div>
          <p className="mt-3 text-xs text-white/75">
            Persetujuan client: {c.client_approved_at ? fmtDate(c.client_approved_at) : "belum"} · freelancer: {c.freelancer_approved_at ? fmtDate(c.freelancer_approved_at) : "belum"}. Kontrak hanya aktif setelah keduanya tercatat.
          </p>
          {!party && <p className="mt-3 rounded-lg bg-white/10 p-2 text-xs text-white/80">Kamu melihat kontrak ini sebagai admin (hanya baca).</p>}
        </div>
      </header>

      <Terms c={c} />

      {party && c.status === "draft" && iClient && (sched
        ? <ScheduleDraftEditor c={c} slots={d.slots} busy={busy} run={run} onCancel={() => setAsk(cancelAsk())} />
        : <DraftEditor ctx={ctx} milestones={d.milestones} onCancel={() => setAsk(cancelAsk())} />)}
      {party && c.status === "draft" && iFree && <p className={cn(CARD, "p-4 text-sm text-muted-foreground")}>{sched ? "Client sedang menyusun jadwal hari dan jam kerja. Kamu akan diberi tahu saat jadwal dikirim; di sana kamu bisa menyetujui atau mengajukan pergantian jam." : "Client sedang menyiapkan kontrak. Kamu akan diberi tahu saat kontrak dikirim."}</p>}

      {party && sched && c.status !== "draft" && (
        <SchedulePanel
          c={c} uid={uid} slots={d.slots} changes={d.changes} milestone={scheduleMilestone} locked={scheduleLocked}
          busy={busy} run={run} setAsk={setAsk}
          onPay={() => scheduleMilestone && run(async () => { const oid = await workRpc<string>("work_create_order_from_milestone", { _milestone_id: scheduleMilestone.id }); ctx.openOrder(oid); })}
        />
      )}

      {party && c.status === "waiting_approval" && (
        <section className={cn(CARD, "p-5 ring-primary/40")}>
          <h2 className="font-extrabold">Menunggu persetujuan freelancer</h2>
          {iFree ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Baca ketentuan di atas. Dengan menyetujui, kontrak aktif dan client bisa mulai membayar{sched ? " total jam kerja" : " milestone"}.</p>
              {sched && pendingChanges && <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">Kamu masih punya pengajuan pergantian jam yang belum dijawab client. Tunggu jawabannya, atau tarik pengajuan, sebelum menyetujui.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="rounded-full" disabled={busy || (sched && pendingChanges)} onClick={() => run(() => workRpc("work_respond_contract", { _contract_id: c.id, _accept: true, _note: "" }), "Kontrak disetujui dan aktif")}><Check /> Setujui kontrak</Button>
                <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => setAsk({
                  title: "Minta perubahan kontrak", label: "Perubahan yang kamu minta", min: 3, confirm: "Kirim ke client",
                  onSubmit: async (t) => { await workRpc("work_respond_contract", { _contract_id: c.id, _accept: false, _note: t }); toast.success("Kontrak dikembalikan ke client"); refresh(); },
                })}><X /> Minta perubahan</Button>
              </div>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Menunggu freelancer menyetujui.</p>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAsk(cancelAsk())}>Batalkan kontrak</Button>
            </div>
          )}
        </section>
      )}

      {c.payment_type === "fixed" && c.status !== "draft" && (
        <section aria-labelledby="ms" className="space-y-3">
          <h2 id="ms" className="text-lg font-extrabold">{sched ? "Pembayaran & hasil kerja" : "Milestone"}</h2>
          {d.milestones.length === 0 && <EmptyState>Belum ada milestone.</EmptyState>}
          <MilestoneProgress milestones={d.milestones} />
          {d.milestones.map((m) => (
            <MilestoneCard key={m.id} m={m} ctx={ctx} subs={d.subs.filter((s) => s.milestone_id === m.id)} revs={d.revs.filter((r) => r.milestone_id === m.id)}
              onDispute={() => setAsk(disputeAsk(m.id))} />
          ))}
        </section>
      )}

      {c.payment_type === "hourly" && c.status !== "draft" && <HourlyPanel ctx={ctx} sheets={d.sheets} orders={d.orders} />}

      {party && c.status === "active" && (
        <div className="flex flex-wrap gap-2">
          {!openDispute && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAsk(disputeAsk(null))}><Scale /> Ajukan sengketa kontrak</Button>}
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAsk(cancelAsk())}>Batalkan kontrak</Button>
        </div>
      )}

      {d.disputes.length > 0 && (
        <section aria-labelledby="dp" className="space-y-2">
          <h2 id="dp" className="text-lg font-extrabold">Sengketa</h2>
          {d.disputes.map((x) => (
            <div key={x.id} className={cn(CARD, "p-4 text-sm")}>
              <div className="flex flex-wrap items-center gap-2"><Pill tone={x.status === "resolved" ? "ok" : "bad"}>{x.status === "resolved" ? "Diputuskan" : "Diproses admin"}</Pill><span className="text-xs text-muted-foreground">{timeAgo(x.created_at)}</span></div>
              <p className="mt-2 whitespace-pre-wrap">{x.reason}</p>
              {x.decision && <p className="mt-2 rounded-lg bg-muted p-2"><b>Keputusan:</b> {DECISION[x.decision] ?? x.decision}. {x.decision_note}</p>}
            </div>
          ))}
        </section>
      )}

      {party && c.status === "completed" && (
        <ReviewBox c={c} uid={uid} mine={myReview} all={d.reviews} onDone={refresh} />
      )}

      <section aria-labelledby="ev" className={cn(CARD, "p-4 sm:p-5")}>
        <h2 id="ev" className="mb-2 text-lg font-extrabold">Riwayat kontrak</h2>
        <ol className="space-y-1.5 border-l-2 border-primary/40 pl-4 text-sm">
          {d.events.map((e) => (
            <li key={e.id}><span>{eventLabel(e.event)}</span> <span className="text-xs text-muted-foreground">· {timeAgo(e.created_at)}</span></li>
          ))}
        </ol>
      </section>

      {party && (
        <section aria-labelledby="help" className={cn(CARD, "space-y-3 p-4 sm:p-5")}>
          <h2 id="help" className="flex items-center gap-2 text-lg font-extrabold"><LifeBuoy className="size-5 text-primary" /> Ada masalah?</h2>
          <p className="text-sm text-muted-foreground">
            Pekerjaan tidak diselesaikan, pihak lain tidak merespons, atau dana tertahan? Berdua kamu bisa melapor ke admin. Laporan dibaca admin bersama riwayat kontrak, pembayaran, dan obrolan. Untuk dana yang sedang ditahan di milestone, gunakan sengketa agar admin bisa memutuskan.
          </p>
          <div className="flex flex-wrap gap-2">
            <ReportButton targetType="contract" targetId={c.id} label="Laporkan kontrak ini" defaultReason={iFree ? "funds_held" : "not_completed"} className="rounded-full" />
            {other?.username && <ReportButton targetType="profile" targetId={other.username} label={`Laporkan ${iClient ? "freelancer" : "client"}`} className="rounded-full" />}
            {c.status === "active" && !openDispute && <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAsk(disputeAsk(null))}><Scale /> Ajukan sengketa</Button>}
          </div>
        </section>
      )}
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

const DECISION: Record<string, string> = { favor_client: "dimenangkan client", favor_freelancer: "dimenangkan freelancer", split: "dana dibagi", dismissed: "sengketa ditolak, pekerjaan berlanjut" };

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-white/70">{label}</p><p className="truncate font-bold">{value}</p></div>;
}

function Terms({ c }: { c: ContractRow }) {
  const rows: [string, string][] = [
    ["Ruang lingkup pekerjaan", c.scope], ["Ketentuan revisi", c.revision_terms], ["Hak penggunaan hasil pekerjaan", c.usage_rights],
    ["Ketentuan pembatalan", c.cancellation_terms], ["Ketentuan pembayaran", c.payment_terms],
  ];
  return (
    <section aria-label="Ketentuan kontrak" className={cn(CARD, "divide-y divide-border")}>
      {rows.map(([t, v], i) => (
        <details key={t} open={i === 0} className="group p-4">
          <summary className="cursor-pointer select-none text-sm font-bold">{t}</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{v?.trim() || "Tidak diisi."}</p>
        </details>
      ))}
    </section>
  );
}

function DraftEditor({ ctx, milestones, onCancel }: { ctx: Ctx; milestones: MilestoneRow[]; onCancel: () => void }) {
  const { c, busy, run } = ctx;
  const [amount, setAmount] = useState(String(c.payment_type === "fixed" ? c.total_amount : c.hourly_rate)); // digit saja
  const [m, setM] = useState({ title: "", desc: "", amount: "", deadline: "" });
  const fixed = c.payment_type === "fixed";
  const sum = milestones.reduce((s, x) => s + x.amount, 0);
  const ready = fixed ? milestonesMatchTotal(c.total_amount, milestones) : validAmount(c.hourly_rate);
  function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    const a = parseRupiah(m.amount);
    if (m.title.trim().length < 3) { toast.error("Nama milestone minimal 3 huruf."); return; }
    if (!validAmount(a)) { toast.error("Nilai milestone tidak valid."); return; }
    run(async () => {
      await workRpc("work_add_milestone", { _contract_id: c.id, _title: m.title.trim(), _description: m.desc.trim(), _amount: a, _deadline: m.deadline || null });
      setM({ title: "", desc: "", amount: "", deadline: "" });
    }, "Milestone ditambahkan");
  }
  return (
    <section aria-labelledby="draft" className={cn(CARD, "space-y-4 p-5 ring-primary/40")}>
      <h2 id="draft" className="font-extrabold">Siapkan kontrak</h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5"><Label htmlFor="amt">{fixed ? "Nilai kontrak" : "Tarif per jam"}</Label><RupiahInput id="amt" value={amount} onValueChange={setAmount} /></div>
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => {
          const a = parseRupiah(amount);
          if (!validAmount(a)) { toast.error("Nilai tidak valid."); return; }
          run(() => workRpc("work_set_contract_amount", { _contract_id: c.id, _amount: a }), "Nilai disimpan");
        }}>Simpan nilai</Button>
      </div>

      {fixed && (
        <>
          <div>
            <p className="text-sm font-medium">Milestone ({milestones.length})</p>
            <ul className="mt-2 space-y-2">
              {milestones.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{x.position}. {x.title} · <b>{rp(x.amount)}</b>{x.deadline ? ` · ${fmtDate(x.deadline)}` : ""}</span>
                  <Button size="icon" variant="ghost" aria-label={`Hapus ${x.title}`} disabled={busy} onClick={() => run(() => workRpc("work_remove_milestone", { _milestone_id: x.id }))}><Trash2 /></Button>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-xs ${sum === c.total_amount ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              Total milestone {rp(sum)} dari nilai kontrak {rp(c.total_amount)}{sum === c.total_amount ? " — cocok." : " — harus sama persis sebelum dikirim."}
            </p>
          </div>
          <form onSubmit={addMilestone} className="grid gap-2 rounded-xl border border-dashed border-border p-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="mt">Nama milestone</Label><Input id="mt" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} maxLength={120} /></div>
            <div className="space-y-1.5"><Label htmlFor="ma">Nilai</Label><RupiahInput id="ma" value={m.amount} onValueChange={(v) => setM({ ...m, amount: v })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="md">Deskripsi</Label><Textarea id="md" rows={2} value={m.desc} onChange={(e) => setM({ ...m, desc: e.target.value })} maxLength={4000} /></div>
            <div className="space-y-1.5"><Label htmlFor="mdl">Tanggal selesai</Label><Input id="mdl" type="date" value={m.deadline} onChange={(e) => setM({ ...m, deadline: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" variant="outline" className="rounded-full" disabled={busy}><Plus /> Tambah milestone</Button></div>
          </form>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" disabled={busy || !ready} onClick={() => run(() => workRpc("work_send_contract", { _contract_id: c.id }), "Kontrak dikirim ke freelancer")}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Kirim ke freelancer</Button>
        <Button variant="outline" className="rounded-full" onClick={onCancel}>Batalkan kontrak</Button>
      </div>
      {!ready && <p className="text-xs text-muted-foreground">{fixed ? "Tambahkan milestone yang totalnya sama dengan nilai kontrak." : "Isi tarif per jam."}</p>}
    </section>
  );
}

function MilestoneCard({ m, ctx, subs, revs, onDispute }: { m: MilestoneRow; ctx: Ctx; subs: SubmissionRow[]; revs: RevisionRow[]; onDispute: () => void }) {
  const { c, uid, busy, run, setAsk, openOrder } = ctx;
  const act = milestoneActions(c, m, uid);
  const [showForm, setShowForm] = useState(false);
  const party = isClient(c, uid) || isFreelancer(c, uid);
  const canDispute = party && c.status === "active" && ["funded", "in_progress", "submitted", "revision_requested", "approved"].includes(m.status);
  const last = subs[subs.length - 1];
  const left = revisionsLeft(c.revision_limit, c.revisions_used ?? 0);
  const mayRevise = canRequestRevision(c.revision_limit, c.revisions_used ?? 0);
  const releaseAt = m.status === "submitted" && m.deadline && c.payment_type === "fixed" ? autoReleaseAt(m.deadline, last?.created_at ?? null) : null;
  const fmtDateTime = (d: Date) => d.toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <article className={cn(CARD, "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{m.position}. {m.title}</p>
          <p className="text-sm text-muted-foreground">{rp(m.amount)}{m.deadline ? ` · selesai paling lambat ${fmtDate(m.deadline)}` : ""}</p>
        </div>
        <MilestonePill status={m.status} />
      </div>
      {m.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{m.description}</p>}

      {last && (
        <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Hasil terakhir · {timeAgo(last.created_at)}{subs.length > 1 ? ` · pengiriman ke-${subs.length}` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap">{last.note}</p>
          {last.links.length > 0 && <ul className="mt-1 space-y-0.5">{last.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline">{l}</a></li>)}</ul>}
        </div>
      )}
      {revs.length > 0 && (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Riwayat revisi ({revs.length})</p>
          {revs.map((r) => <p key={r.id} className="rounded-lg bg-amber-500/10 px-2 py-1">{r.note} <span className="text-xs text-muted-foreground">· {timeAgo(r.created_at)}</span></p>)}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {act.pay && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(async () => { const oid = await workRpc<string>("work_create_order_from_milestone", { _milestone_id: m.id }); openOrder(oid); })}><CreditCard /> Bayar milestone</Button>}
        {m.order_id && party && <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/pesanan/$id" params={{ id: m.order_id }}>Lihat pembayaran</Link></Button>}
        {act.start && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(() => workRpc("work_start_milestone", { _milestone_id: m.id }), "Milestone dimulai")}><Play /> Mulai kerjakan</Button>}
        {act.submit && <Button size="sm" className="rounded-full" variant={showForm ? "outline" : "default"} onClick={() => setShowForm(!showForm)}><Send /> {m.status === "revision_requested" ? "Kirim revisi" : "Kirim hasil"}</Button>}
        {act.approve && (
          <Button size="sm" className="rounded-full" disabled={busy} onClick={() => { if (confirm("Setujui hasil ini? Setelah disetujui, dana siap diteruskan admin ke freelancer.")) run(() => workRpc("work_approve_milestone", { _milestone_id: m.id }), "Hasil disetujui"); }}><Check /> Setujui hasil</Button>
        )}
        {act.requestRevision && (
          <Button size="sm" variant="outline" className="rounded-full" disabled={busy || !mayRevise} title={mayRevise ? undefined : "Jatah revisi sudah habis"} onClick={() => setAsk({
            title: "Minta revisi", label: "Apa yang perlu diperbaiki?", min: 5, confirm: "Kirim permintaan revisi",
            onSubmit: async (t) => { await workRpc("work_request_revision", { _milestone_id: m.id, _note: t }); toast.success("Revisi diminta"); ctx.run(async () => undefined); },
          })}>Minta revisi</Button>
        )}
        {canDispute && <Button size="sm" variant="ghost" className="rounded-full" onClick={onDispute}><Scale /> Sengketa</Button>}
      </div>
      {releaseAt && (
        <p className="mt-2 rounded-xl bg-primary/10 p-2 text-xs">
          {isClient(c, uid)
            ? <>Setujui atau minta revisi sebelum <b>{fmtDateTime(releaseAt)}</b>. Setelah itu hasil dianggap disetujui dan dana otomatis diteruskan ke freelancer.</>
            : <>Jika client tidak menanggapi sampai <b>{fmtDateTime(releaseAt)}</b>, hasil dianggap disetujui dan dana otomatis masuk ke saldomu.</>}
          {c.revision_limit ? <> {left === 0 ? "Jatah revisi sudah habis." : `Sisa revisi: ${left} kali.`}</> : null}
        </p>
      )}
      {m.deadline && ["funded", "in_progress", "revision_requested"].includes(m.status) && c.payment_type === "fixed" && isFreelancer(c, uid) && (
        <p className="mt-2 text-xs text-muted-foreground">Kirim hasil sebelum akhir hari {fmtDate(m.deadline)} agar client punya waktu memeriksa.{c.revision_limit ? ` Sisa revisi: ${left} kali.` : ""}</p>
      )}
      {m.status === "awaiting_payment" && !act.pay && <p className="mt-2 text-xs text-muted-foreground">Menunggu client membayar lewat Midtrans. Pekerjaan dimulai setelah pembayaran terverifikasi.</p>}
      {m.status === "approved" && <p className="mt-2 text-xs text-muted-foreground">{m.auto_approved_at ? "Disetujui otomatis karena client tidak menanggapi sampai batas waktu. Dana langsung diteruskan ke saldo freelancer." : "Disetujui. Dana langsung diteruskan ke saldo freelancer; jika belum berubah menjadi \"Dana diteruskan\", admin sedang memeriksa dananya."}</p>}
      {showForm && act.submit && <SubmitForm milestoneId={m.id} onDone={() => { setShowForm(false); run(async () => undefined); }} />}
    </article>
  );
}

function SubmitForm({ milestoneId, onDone }: { milestoneId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = links.split("\n").map((l) => l.trim()).filter(Boolean);
    if (note.trim().length < 10) { toast.error("Jelaskan hasil pekerjaan minimal 10 karakter."); return; }
    if (list.length > 10) { toast.error("Maksimal 10 tautan."); return; }
    if (list.some((l) => !/^https?:\/\//i.test(l))) { toast.error("Tautan harus diawali http:// atau https://"); return; }
    setBusy(true);
    try {
      await workRpc("work_submit_milestone", { _milestone_id: milestoneId, _note: note.trim(), _links: list, _attachments: [] });
      toast.success("Hasil dikirim ke client");
      onDone();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-dashed border-border p-3">
      <div className="space-y-1.5"><Label htmlFor={`n-${milestoneId}`}>Catatan hasil pekerjaan</Label><Textarea id={`n-${milestoneId}`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} /></div>
      <div className="space-y-1.5"><Label htmlFor={`l-${milestoneId}`}>Tautan hasil (satu per baris: repo, demo, Drive)</Label><Textarea id={`l-${milestoneId}`} rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://" /></div>
      <Button className="rounded-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Kirim hasil</Button>
    </form>
  );
}

function HourlyInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-bold">{value}</p></div>;
}

function HourlyPanel({ ctx, sheets, orders }: { ctx: Ctx; sheets: TimesheetRow[]; orders: WorkOrderRow[] }) {
  const { c, uid, busy, run, setAsk, openOrder } = ctx;
  const iClient = isClient(c, uid); const iFree = isFreelancer(c, uid);
  const sum = timesheetSummary(sheets, c.hourly_rate);
  const unbilled = sheets.filter((s) => s.status === "approved" && !s.billed_order_id);
  const unbilledHours = unbilled.reduce((t, s) => t + s.hours, 0);
  const today = todayWIB();
  const [f, setF] = useState({ date: today, start: "", end: "", note: "" });
  const active = c.status === "active";
  const h = hoursBetween(f.start, f.end);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.start || !f.end) { toast.error("Isi jam mulai dan jam selesai."); return; }
    if (h === null) { toast.error("Jam selesai harus setelah jam mulai (hari yang sama)."); return; }
    if (!validTimesheetEntry(new Date(f.date + "T00:00:00"), h)) { toast.error("Tanggal tidak valid (maksimal 60 hari ke belakang, tidak di masa depan)."); return; }
    if (c.deadline && f.date > c.deadline) { toast.error("Tanggal kerja melewati tanggal selesai kontrak."); return; }
    if (f.note.trim().length < 5) { toast.error("Catat pekerjaan yang dilakukan."); return; }
    run(async () => {
      try {
        await workRpc("work_submit_timesheet_range", { _contract_id: c.id, _work_date: f.date, _start: f.start, _end: f.end, _note: f.note.trim() });
      } catch (err) {
        // SQL 006 belum dijalankan: catat sebagai jumlah jam seperti sebelumnya.
        if (!isMissingFunction({ message: err instanceof Error ? err.message : "" })) throw err;
        await workRpc("work_submit_timesheet", { _contract_id: c.id, _work_date: f.date, _hours: h, _note: f.note.trim() });
      }
      setF({ ...f, start: "", end: "", note: "" });
    }, "Jam kerja dikirim");
  }
  return (
    <section aria-labelledby="hr" className="space-y-4">
      <h2 id="hr" className="text-lg font-extrabold">Jam kerja &amp; tagihan</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HourlyInfo label="Jam disetujui" value={`${sum.approvedHours} jam`} />
        <HourlyInfo label="Menunggu keputusan" value={`${sum.pendingHours} jam`} />
        <HourlyInfo label="Total dapat ditagih" value={rp(sum.billable)} />
        <HourlyInfo label="Belum ditagih" value={`${unbilledHours} jam · ${rp(Math.round(unbilledHours * c.hourly_rate))}`} />
      </div>

      {iFree && active && (
        <form onSubmit={submit} className={cn(CARD, "grid gap-2 p-4 md:grid-cols-[160px_110px_110px_1fr_auto]")}>
          <div className="space-y-1.5"><Label htmlFor="td">Tanggal</Label><Input id="td" type="date" value={f.date} max={c.deadline && c.deadline < today ? c.deadline : today} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ts">Jam mulai</Label><Input id="ts" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="te">Jam selesai</Label><Input id="te" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="tn">Catatan pekerjaan</Label><Input id="tn" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={2000} /></div>
          <div className="flex items-end"><Button className="rounded-full" disabled={busy}>Kirim</Button></div>
          {h !== null && <p className="text-xs text-muted-foreground md:col-span-5">Durasi: <b>{formatDuration(h)}</b>{c.hourly_rate ? ` · ${rp(Math.round(h * c.hourly_rate))} bila disetujui` : ""}</p>}
        </form>
      )}

      {sheets.length === 0 ? <EmptyState>Belum ada catatan jam kerja.</EmptyState> : (
        <ul className="space-y-2">
          {sheets.map((s) => (
            <li key={s.id} className={cn(CARD, "p-3 text-sm")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{fmtDate(s.work_date)} · {s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)} · ` : ""}{formatDuration(s.hours)}</span>
                <Pill tone={s.status === "approved" ? "ok" : s.status === "rejected" ? "bad" : "warn"}>{s.status === "approved" ? (s.billed_order_id ? "Disetujui · ditagih" : "Disetujui") : s.status === "rejected" ? "Ditolak" : "Menunggu"}</Pill>
              </div>
              <p className="mt-1 text-muted-foreground">{s.note}</p>
              {s.decision_note && <p className="mt-1 text-xs">Catatan client: {s.decision_note}</p>}
              {iClient && s.status === "submitted" && active && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(() => workRpc("work_decide_timesheet", { _timesheet_id: s.id, _approve: true, _note: "" }), "Jam disetujui")}><Check /> Setujui</Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAsk({
                    title: "Tolak jam kerja", label: "Alasan penolakan", min: 3, confirm: "Tolak",
                    onSubmit: async (t) => { await workRpc("work_decide_timesheet", { _timesheet_id: s.id, _approve: false, _note: t }); toast.success("Jam ditolak"); run(async () => undefined); },
                  })}><X /> Tolak</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {iClient && (c.status === "active" || c.status === "completed") && (
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" disabled={busy || unbilledHours <= 0} onClick={() => run(async () => { const oid = await workRpc<string>("work_create_order_from_timesheets", { _contract_id: c.id }); openOrder(oid); })}><CreditCard /> Tagih jam disetujui</Button>
          {active && <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => { if (confirm("Selesaikan kontrak per jam ini? Pastikan semua jam sudah diputuskan dan ditagih.")) run(() => workRpc("work_complete_hourly_contract", { _contract_id: c.id }), "Kontrak diselesaikan"); }}>Selesaikan kontrak</Button>}
        </div>
      )}

      {orders.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Tagihan</p>
          <ul className="space-y-1.5">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
                <span>{rp(o.amount)} · {o.paid_at ? "sudah dibayar" : "menunggu pembayaran"}</span>
                <Button asChild size="sm" variant="outline" className="rounded-full"><Link to="/pesanan/$id" params={{ id: o.id }}>Buka</Link></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReviewBox({ c, uid, mine, all, onDone }: { c: ContractRow; uid: string; mine?: ReviewRow; all: ReviewRow[]; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await workRpc("work_leave_review", { _contract_id: c.id, _rating: rating, _comment: comment.trim() }); toast.success("Ulasan terkirim"); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="rv" className={cn(CARD, "space-y-3 p-5")}>
      <h2 id="rv" className="font-extrabold">Ulasan</h2>
      {all.map((r) => (
        <p key={r.id} className="rounded-lg bg-secondary/60 p-2 text-sm">
          <span className="mr-2 inline-flex items-center gap-0.5 text-amber-500">{r.rating}<Star className="size-3.5 fill-current" /></span>
          {r.reviewer_id === uid ? "Ulasanmu: " : "Ulasan untukmu: "}{r.comment || "(tanpa komentar)"}
        </p>
      ))}
      {!mine && (
        <div className="space-y-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} bintang`} onClick={() => setRating(n)}>
                <Star className={`size-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Bagaimana pengalaman bekerja sama?" />
          <Button className="rounded-full" disabled={busy} onClick={send}>{busy && <Loader2 className="animate-spin" />} Kirim ulasan</Button>
        </div>
      )}
    </section>
  );
}
