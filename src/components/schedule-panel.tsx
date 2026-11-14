import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, CreditCard, Loader2, Lock, PencilLine, Plus, Send, Trash2, X } from "lucide-react";
import { errMsg } from "@/lib/market";
import { fmtDay, fmtTime, rp, workRpc, type ContractRow, type MilestoneRow, type ScheduleSlot, type SlotChange } from "@/lib/work-db";
import { formatDuration, hoursBetween, todayWIB } from "@/lib/work-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill, type Ask } from "@/components/work-ui";
import { cn } from "@/lib/utils";

const CARD = "rounded-2xl bg-card shadow-sm ring-1 ring-border";
type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

const sumHours = (slots: ScheduleSlot[]) => slots.reduce((t, s) => t + Number(s.hours), 0);
const cost = (hours: number, rate: number) => Math.round(hours * rate);

/** Empat langkah alur per jam, dengan langkah aktif disorot supaya jelas apa yang sedang ditunggu. */
function Steps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const steps = ["Client atur hari & jam", "Freelancer setuju atau ajukan ganti jam", "Client bayar total semua jam", "Pengerjaan sesuai jadwal", "Hasil disetujui & dana diteruskan"];
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Alur kerja per jam">
      {steps.map((t, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <li key={t} className={cn("flex items-start gap-2 rounded-xl p-2.5 text-xs ring-1 sm:flex-col sm:gap-1",
            state === "now" ? "bg-primary/15 font-semibold text-foreground ring-primary/50" : state === "done" ? "bg-secondary text-muted-foreground ring-border" : "text-muted-foreground ring-border")}>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", state === "done" ? "bg-emerald-500 text-white" : state === "now" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
              {state === "done" ? <Check className="size-3" /> : n}
            </span>
            <span>{t}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Totals({ slots, rate }: { slots: ScheduleSlot[]; rate: number }) {
  const h = sumHours(slots);
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Sesi</p><p className="font-bold">{slots.length}</p></div>
      <div className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">Total jam</p><p className="font-bold">{formatDuration(h)}</p></div>
      <div className="rounded-xl bg-primary/15 p-3"><p className="text-xs text-muted-foreground">Dibayar di muka</p><p className="font-bold text-orange-ink">{rp(cost(h, rate))}</p></div>
    </div>
  );
}

/** Client menyusun jadwal sebelum mengirim ke freelancer (kontrak masih draft). */
export function ScheduleDraftEditor({ c, slots, busy, run, onCancel }: { c: ContractRow; slots: ScheduleSlot[]; busy: boolean; run: Run; onCancel: () => void }) {
  const today = todayWIB();
  const [f, setF] = useState({ date: today, start: "", end: "" });
  const h = hoursBetween(f.start, f.end);
  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.date || f.date < today) { toast.error("Pilih tanggal hari ini atau setelahnya."); return; }
    if (!f.start || !f.end) { toast.error("Isi jam mulai dan jam selesai."); return; }
    if (h === null) { toast.error("Jam selesai harus setelah jam mulai (di hari yang sama)."); return; }
    run(async () => {
      await workRpc("work_add_slot", { _contract_id: c.id, _date: f.date, _start: f.start, _end: f.end });
      setF({ ...f, start: "", end: "" });
    }, "Sesi ditambahkan");
  }
  const ready = slots.length > 0 && cost(sumHours(slots), c.hourly_rate) >= 1000;
  return (
    <section aria-labelledby="sched" className={cn(CARD, "space-y-4 p-4 ring-primary/40 sm:p-5")}>
      <div>
        <h2 id="sched" className="flex items-center gap-2 text-lg font-extrabold"><CalendarClock className="size-5 text-primary" /> Atur jadwal kerja</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tentukan hari dan jam kerja. Tarif <b>{rp(c.hourly_rate)}/jam</b> (dari penawaran freelancer). Freelancer bisa mengajukan pergantian jam; setelah sepakat, kamu membayar total semua jam di muka.</p>
      </div>
      <Steps current={1} />

      <form onSubmit={add} className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[1fr_130px_130px_auto]">
        <div className="space-y-1.5"><Label htmlFor="sd">Tanggal</Label><Input id="sd" type="date" min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="ss">Jam mulai</Label><Input id="ss" type="time" step={300} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="se">Jam selesai</Label><Input id="se" type="time" step={300} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
        <div className="flex items-end"><Button type="submit" variant="outline" className="w-full rounded-full" disabled={busy}><Plus /> Tambah sesi</Button></div>
        {h !== null && <p className="text-xs text-muted-foreground sm:col-span-4">Durasi sesi: <b>{formatDuration(h)}</b> · {rp(cost(h, c.hourly_rate))}</p>}
      </form>

      {slots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Belum ada sesi. Tambahkan minimal satu hari dan jam kerja.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
              <span className="min-w-0"><b>{fmtDay(s.work_date)}</b> · {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {formatDuration(Number(s.hours))} · {rp(cost(Number(s.hours), c.hourly_rate))}</span>
              <Button size="icon" variant="ghost" aria-label="Hapus sesi" disabled={busy} onClick={() => run(() => workRpc("work_remove_slot", { _slot_id: s.id }))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <Totals slots={slots} rate={c.hourly_rate} />

      <div className="flex flex-wrap gap-2">
        <Button className="rounded-full" disabled={busy || !ready} onClick={() => run(() => workRpc("work_send_schedule_contract", { _contract_id: c.id }), "Jadwal dikirim ke freelancer")}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Kirim jadwal ke freelancer
        </Button>
        <Button variant="outline" className="rounded-full" onClick={onCancel}>Batalkan kontrak</Button>
      </div>
      {!ready && <p className="text-xs text-muted-foreground">Tambahkan sesi agar jadwal bisa dikirim.</p>}
    </section>
  );
}

/** Jadwal setelah dikirim: freelancer boleh mengajukan pergantian jam per sesi, client menjawab, lalu client membayar total. */
export function SchedulePanel({ c, uid, slots, changes, milestone, locked, busy, run, setAsk, onPay }: {
  c: ContractRow; uid: string; slots: ScheduleSlot[]; changes: SlotChange[]; milestone: MilestoneRow | null; locked: boolean;
  busy: boolean; run: Run; setAsk: (a: Ask | null) => void; onPay: () => void;
}) {
  const iClient = c.client_id === uid;
  const iFree = c.freelancer_id === uid;
  const [editing, setEditing] = useState<string | null>(null);
  const pending = changes.filter((x) => x.status === "pending");
  const canChange = iFree && !locked && (c.status === "waiting_approval" || c.status === "active");
  const mStatus = milestone?.status;
  const current: 1 | 2 | 3 | 4 | 5 =
    c.status === "draft" ? 1 : c.status === "waiting_approval" ? 2
    : mStatus === "awaiting_payment" || mStatus === "pending" ? 3
    : mStatus === "approved" || mStatus === "released" ? 5 : 4;
  const hours = sumHours(slots);

  return (
    <section aria-labelledby="schedv" className={cn(CARD, "space-y-4 p-4 sm:p-5")}>
      <h2 id="schedv" className="flex items-center gap-2 text-lg font-extrabold"><CalendarClock className="size-5 text-primary" /> Jadwal kerja per jam</h2>
      <Steps current={current} />
      <Totals slots={slots} rate={c.hourly_rate} />

      {c.status === "waiting_approval" && iFree && (
        <p className="rounded-xl bg-primary/10 p-3 text-sm">Cek jadwal di bawah. Jika ada jam yang tidak cocok, ajukan pergantian jam per sesi dan tunggu client menjawab. Jika sudah cocok, setujui kontrak di bagian persetujuan.</p>
      )}
      {c.status === "waiting_approval" && iClient && (
        <p className="rounded-xl bg-primary/10 p-3 text-sm">Menunggu freelancer menyetujui jadwal{pending.length ? ` — ada ${pending.length} permintaan pergantian jam yang perlu kamu jawab` : ""}.</p>
      )}
      {c.status === "active" && mStatus === "awaiting_payment" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/10 p-3 text-sm">
          <span>{iClient ? <>Jadwal disepakati. Bayar total <b>{rp(milestone?.amount)}</b> ({formatDuration(hours)}) agar pekerjaan dimulai.</> : "Jadwal disepakati. Menunggu client membayar total jam kerja; pekerjaan dimulai setelah pembayaran terverifikasi."}</span>
          {iClient && <Button size="sm" className="rounded-full" disabled={busy} onClick={onPay}><CreditCard /> Bayar {rp(milestone?.amount)}</Button>}
        </div>
      )}
      {locked && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" /> Jadwal terkunci karena sudah ada tagihan atau pembayaran. Perubahan lewat obrolan, atau ajukan sengketa bila ada masalah.</p>}

      <ul className="space-y-2">
        {slots.map((s) => {
          const ch = pending.find((x) => x.slot_id === s.id);
          return (
            <li key={s.id} className="rounded-xl bg-secondary/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{fmtDay(s.work_date)}</b> · {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {formatDuration(Number(s.hours))}</span>
                {canChange && !ch && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(editing === s.id ? null : s.id)}><PencilLine /> Ajukan ganti jam</Button>}
              </div>

              {ch && (
                <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                  <div className="flex flex-wrap items-center gap-2"><Pill tone="warn">Menunggu jawaban client</Pill><span className="text-xs text-muted-foreground">Usulan freelancer</span></div>
                  <p className="mt-1"><b>{fmtDay(ch.new_date)}</b> · {fmtTime(ch.new_start)}–{fmtTime(ch.new_end)}</p>
                  {ch.note && <p className="mt-0.5 text-xs text-muted-foreground">Alasan: {ch.note}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {iClient && (
                      <>
                        <Button size="sm" className="rounded-full" disabled={busy} onClick={() => run(() => workRpc("work_decide_slot_change", { _change_id: ch.id, _accept: true, _note: "" }), "Pergantian jam disetujui")}><Check /> Terima usulan</Button>
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAsk({
                          title: "Tolak usulan jam", label: "Alasan penolakan", min: 3, confirm: "Tolak usulan",
                          onSubmit: async (t) => { await workRpc("work_decide_slot_change", { _change_id: ch.id, _accept: false, _note: t }); toast.success("Usulan ditolak"); run(async () => undefined); },
                        })}><X /> Tolak</Button>
                      </>
                    )}
                    {iFree && ch.requested_by === uid && <Button size="sm" variant="ghost" className="rounded-full" disabled={busy} onClick={() => run(() => workRpc("work_cancel_slot_change", { _change_id: ch.id }), "Pengajuan ditarik")}>Tarik pengajuan</Button>}
                  </div>
                </div>
              )}

              {editing === s.id && canChange && <ChangeForm slot={s} busy={busy} onDone={() => setEditing(null)} run={run} />}
            </li>
          );
        })}
      </ul>

      {changes.some((x) => x.status !== "pending") && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Riwayat pergantian jam ({changes.filter((x) => x.status !== "pending").length})</summary>
          <ul className="mt-2 space-y-1">
            {changes.filter((x) => x.status !== "pending").map((x) => (
              <li key={x.id} className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-xs">
                {fmtDay(x.new_date)} {fmtTime(x.new_start)}–{fmtTime(x.new_end)} · <Pill tone={x.status === "accepted" ? "ok" : x.status === "rejected" ? "bad" : "neutral"}>{x.status === "accepted" ? "Diterima" : x.status === "rejected" ? "Ditolak" : "Ditarik"}</Pill>
                {x.decision_note ? ` · ${x.decision_note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChangeForm({ slot, busy, run, onDone }: { slot: ScheduleSlot; busy: boolean; run: Run; onDone: () => void }) {
  const today = todayWIB();
  const [f, setF] = useState({ date: slot.work_date.slice(0, 10), start: slot.start_time.slice(0, 5), end: slot.end_time.slice(0, 5), note: "" });
  const h = hoursBetween(f.start, f.end);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.date < today) { toast.error("Tanggal tidak boleh di masa lalu."); return; }
    if (h === null) { toast.error("Jam selesai harus setelah jam mulai."); return; }
    if (f.note.trim().length < 3) { toast.error("Isi alasan pergantian jam."); return; }
    run(async () => {
      try { await workRpc("work_request_slot_change", { _slot_id: slot.id, _new_date: f.date, _new_start: f.start, _new_end: f.end, _note: f.note.trim() }); onDone(); }
      catch (err) { toast.error(errMsg(err)); throw err; }
    }, "Pengajuan terkirim ke client");
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-lg border border-dashed border-border bg-card p-3 sm:grid-cols-[1fr_120px_120px]">
      <div className="space-y-1.5"><Label htmlFor={`cd-${slot.id}`}>Tanggal usulan</Label><Input id={`cd-${slot.id}`} type="date" min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`cs-${slot.id}`}>Jam mulai</Label><Input id={`cs-${slot.id}`} type="time" step={300} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor={`ce-${slot.id}`}>Jam selesai</Label><Input id={`ce-${slot.id}`} type="time" step={300} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-3"><Label htmlFor={`cn-${slot.id}`}>Alasan</Label><Textarea id={`cn-${slot.id}`} rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} placeholder="Mis. bentrok dengan pekerjaan lain pada jam itu." /></div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit" size="sm" className="rounded-full" disabled={busy}><Send /> Kirim usulan</Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onDone}>Batal</Button>
        {h !== null && <span className="text-xs text-muted-foreground">Durasi usulan: {formatDuration(h)}</span>}
      </div>
    </form>
  );
}
