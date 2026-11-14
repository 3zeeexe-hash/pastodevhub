// GOBI WORK Fase 6 (lanjutan): moderasi lowongan dengan filter "dilaporkan" dan riwayat, pengguna dengan blokir/verifikasi beralasan,
// dan pengaturan komisi. Semua perubahan lewat fungsi database (admin_set_ban, admin_set_verified, work_admin_*) dan dicatat di audit log.
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { timeAgo, useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { looseDb } from "@/lib/escrow-db";
import { fmtDate, rp, workRpc } from "@/lib/work-db";
import { commissionFor, MAX_COMMISSION_PERCENT, parseCommissionInput } from "@/lib/work-commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Pill, ReasonDialog, type Ask } from "@/components/work-ui";
import { Loading, must, SearchBox } from "@/components/admin-work-extra";

/* ---------- Pengguna: lihat, blokir/buka blokir dengan alasan, centang verifikasi ---------- */
type UserRow = { id: string; username: string; display_name: string | null; account_type: string | null; created_at: string; is_verified?: boolean | null };
const COLS = "id,username,display_name,account_type,created_at";

export function UsersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState("all");
  const [term, setTerm] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-users", role, term],
    queryFn: async () => {
      const t = term.trim().replace(/[%,()*_]/g, "");
      const find = (cols: string) => {
        let qb = looseDb.from("profiles").select(cols).in("account_type", role === "all" ? ["client", "developer"] : [role]).order("created_at", { ascending: false }).limit(100);
        if (t) qb = qb.ilike("username", `%${t}%`);
        return qb;
      };
      let res = await find(`${COLS},is_verified`);
      if (res.error) res = await find(COLS); // kolom verifikasi belum diterapkan di database
      if (res.error) throw new Error(errMsg(res.error));
      const rows = (res.data ?? []) as UserRow[];
      const bans = new Map<string, string>();
      if (rows.length) {
        const b = (await must<{ user_id: string; reason: string | null }[]>(looseDb.from("user_bans").select("user_id,reason").in("user_id", rows.map((r) => r.id)))) ?? [];
        for (const x of b) bans.set(x.user_id, x.reason ?? "");
      }
      return { rows, bans };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-users"] }); qc.invalidateQueries({ queryKey: ["work-admin-audit"] }); };

  function toggleBan(u: UserRow, banned: boolean) {
    setAsk({
      title: banned ? `Buka blokir @${u.username}` : `Blokir @${u.username}`,
      description: banned ? "Akun akan bisa menambah dan mengubah konten lagi." : "Akun yang diblokir tidak bisa menambah atau mengubah konten, termasuk lamaran dan kontrak.",
      label: banned ? "Alasan membuka blokir" : "Alasan memblokir",
      min: 3,
      confirm: banned ? "Buka blokir" : "Blokir",
      onSubmit: async (reason) => {
        await workRpc("admin_set_ban", { _user: u.id, _banned: !banned, _reason: reason });
        await workRpc("admin_log_event", { _action: banned ? "work_user_unban" : "work_user_ban", _target_type: "profile", _target_id: u.id, _note: reason });
        toast.success(banned ? "Blokir dibuka" : "Akun diblokir");
        refresh();
      },
    });
  }
  async function toggleVerified(u: UserRow) {
    try {
      await workRpc("admin_set_verified", { _user: u.id, _verified: !u.is_verified });
      await workRpc("admin_log_event", { _action: u.is_verified ? "work_user_unverify" : "work_user_verify", _target_type: "profile", _target_id: u.id, _note: "" });
      toast.success(u.is_verified ? "Centang biru dicabut" : "Developer diverifikasi");
      refresh();
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger aria-label="Jenis akun"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Client & freelancer</SelectItem><SelectItem value="client">Client</SelectItem><SelectItem value="developer">Freelancer</SelectItem></SelectContent>
        </Select>
        <Input aria-label="Cari username" placeholder="Cari username…" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={40} />
      </div>
      <p className="text-xs text-muted-foreground">Blokir dan buka blokir wajib beralasan dan tercatat di audit log. Pengaturan role admin dan jenis akun ada di <Link to="/admin/pengguna" className="text-primary underline">Pengguna</Link>.</p>
      <Loading q={q} />
      {q.data?.rows.length === 0 && <EmptyState>Tidak ada pengguna yang cocok.</EmptyState>}
      <ul className="space-y-1.5">
        {q.data?.rows.map((u) => {
          const banned = q.data.bans.has(u.id);
          return (
            <li key={u.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to="/$username" params={{ username: u.username }} className="min-w-0 truncate font-medium hover:text-primary">{u.display_name || u.username} <span className="text-xs text-muted-foreground">@{u.username}</span></Link>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Pill tone="info">{u.account_type === "developer" ? "Freelancer" : "Client"}</Pill>
                  {u.is_verified && <Pill tone="ok">terverifikasi</Pill>}
                  {banned && <Pill tone="bad">diblokir</Pill>}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">bergabung {fmtDate(u.created_at)}{banned && q.data.bans.get(u.id) ? ` · alasan: ${q.data.bans.get(u.id)}` : ""}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {u.account_type === "developer" && u.is_verified !== undefined && <Button size="sm" variant="outline" onClick={() => toggleVerified(u)}>{u.is_verified ? "Cabut verifikasi" : "Verifikasi"}</Button>}
                <Button size="sm" variant={banned ? "outline" : "ghost"} className={banned ? "" : "text-destructive"} disabled={u.id === user?.id} onClick={() => toggleBan(u, banned)}>{banned ? "Buka blokir" : "Blokir"}</Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

/* ---------- Moderasi lowongan: filter dilaporkan + riwayat moderasi ---------- */
type JobRow = { id: string; title: string; status: string; moderation_status: string | null; moderation_note: string | null; category: string; created_at: string; client: { username: string } | null };
type Hist = { id: number; admin_label: string | null; action: string; note: string | null; created_at: string };

function JobHistory({ job, onClose }: { job: JobRow | null; onClose: () => void }) {
  const q = useQuery({
    enabled: !!job,
    queryKey: ["work-admin-job-history", job?.id],
    queryFn: async () => (await must<Hist[]>(looseDb.from("admin_audit_log").select("id,admin_label,action,note,created_at").eq("target_type", "job").eq("target_id", job!.id).order("id", { ascending: false }).limit(50))) ?? [],
  });
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Riwayat moderasi</DialogTitle></DialogHeader>
        <p className="text-sm font-medium">{job?.title}</p>
        <Loading q={q} />
        {q.data?.length === 0 && <EmptyState>Belum ada keputusan moderasi untuk lowongan ini.</EmptyState>}
        <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
          {q.data?.map((h) => (
            <li key={h.id} className="rounded-md bg-muted p-2">
              <p className="font-mono text-xs">{h.action}</p>
              <p className="text-xs text-muted-foreground">{h.admin_label ? `@${h.admin_label}` : "admin"} · {timeAgo(h.created_at)}</p>
              {h.note && <p className="mt-0.5">{h.note}</p>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Hanya keputusan moderasi admin yang tercatat. Perubahan isi lowongan oleh pemiliknya belum dicatat oleh sistem.</p>
      </DialogContent>
    </Dialog>
  );
}

export function JobsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [term, setTerm] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [hist, setHist] = useState<JobRow | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-jobs", filter, term],
    queryFn: async () => {
      const t = term.trim().replace(/[%,()*_]/g, "");
      let query = looseDb.from("jobs").select("id,title,status,moderation_status,moderation_note,category,created_at,client:profiles(username)").order("created_at", { ascending: false }).limit(100);
      if (filter === "reported") {
        const reps = (await must<{ target_id: string }[]>(looseDb.from("work_reports").select("target_id").eq("target_type", "job").in("status", ["open", "reviewing"]))) ?? [];
        const ids = [...new Set(reps.map((r) => r.target_id))];
        if (!ids.length) return [] as JobRow[];
        query = query.in("id", ids);
      } else if (filter !== "all") {
        query = query.eq("moderation_status", filter);
      }
      if (t) query = query.or(`title.ilike.%${t}%,category.ilike.%${t}%`);
      return ((await must<unknown[]>(query)) ?? []) as JobRow[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-jobs"] }); qc.invalidateQueries({ queryKey: ["work-admin-stats"] }); qc.invalidateQueries({ queryKey: ["work-admin-audit"] }); };
  async function moderate(id: string, status: string, note = "") {
    try { await workRpc("work_admin_moderate_job", { _job_id: id, _status: status, _note: note }); toast.success("Moderasi disimpan"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <SearchBox value={term} onChange={setTerm} label="Cari lowongan" placeholder="Cari judul atau kategori lowongan…" />
        <div className="w-56">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger aria-label="Filter lowongan"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Menunggu moderasi</SelectItem>
            <SelectItem value="approved">Disetujui</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
            <SelectItem value="reported">Dilaporkan (laporan terbuka)</SelectItem>
            <SelectItem value="all">Semua</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>
      <Loading q={q} />
      {q.data?.length === 0 && <EmptyState>{term.trim() ? "Tidak ada lowongan yang cocok dengan pencarian." : "Tidak ada lowongan pada filter ini."}</EmptyState>}
      <ul className="space-y-2">
        {q.data?.map((j) => (
          <li key={j.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to="/lowongan/$id" params={{ id: j.id }} className="font-semibold hover:text-primary">{j.title}</Link>
              <Pill tone={j.moderation_status === "rejected" ? "bad" : j.moderation_status === "pending" ? "warn" : "ok"}>{j.moderation_status ?? "approved"}</Pill>
            </div>
            <p className="text-xs text-muted-foreground">@{j.client?.username ?? "?"} · {j.category} · {j.status} · {timeAgo(j.created_at)}</p>
            {j.moderation_note && <p className="mt-1 text-xs">Catatan: {j.moderation_note}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {j.moderation_status !== "approved" && <Button size="sm" onClick={() => moderate(j.id, "approved")}>Setujui</Button>}
              {j.moderation_status !== "rejected" && <Button size="sm" variant="outline" onClick={() => setAsk({ title: "Tolak lowongan", label: "Alasan penolakan (dilihat pemilik)", min: 3, confirm: "Tolak", onSubmit: async (t) => { await moderate(j.id, "rejected", t); } })}>Tolak</Button>}
              <Button size="sm" variant="ghost" onClick={() => setHist(j)}>Riwayat</Button>
            </div>
          </li>
        ))}
      </ul>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
      <JobHistory job={hist} onClose={() => setHist(null)} />
    </div>
  );
}

/* ---------- Pengaturan: komisi (berlaku untuk pembayaran GOBI WORK baru) ---------- */
export function SettingsTab() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["work-admin-settings"],
    queryFn: async () => {
      const row = await must<{ value: unknown; updated_at: string }>(looseDb.from("work_settings").select("value,updated_at").eq("key", "commission_percent").maybeSingle());
      const n = row ? Number(row.value) : NaN;
      return { pct: Number.isFinite(n) ? n : null, updatedAt: row?.updated_at ?? null };
    },
  });
  const parsed = parseCommissionInput(input);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["work-admin-settings"] }); qc.invalidateQueries({ queryKey: ["work-admin-audit"] }); };
  const shown = parsed ?? q.data?.pct ?? null;
  return (
    <div className="space-y-4">
      <Loading q={q} />
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Komisi GOBI WORK</h3>
        {q.data && (
          <p className="text-sm">
            {q.data.pct === null
              ? <>Belum diatur: pembayaran GOBI WORK memakai komisi bawaan platform.</>
              : <>Komisi saat ini <b>{q.data.pct}%</b> (diubah {timeAgo(q.data.updatedAt!)}).</>}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-[160px_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="commission">Komisi baru (%)</Label>
            <Input id="commission" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} placeholder="mis. 5" maxLength={5} />
          </div>
          <div className="flex items-end"><Button disabled={parsed === null} onClick={() => setAsk({ title: "Ubah komisi GOBI WORK", description: `Komisi menjadi ${parsed}% untuk pembayaran GOBI WORK baru. Dana yang sudah masuk escrow tidak dihitung ulang.`, label: "Alasan perubahan", min: 3, confirm: "Simpan komisi", onSubmit: async (t) => { await workRpc("work_admin_set_commission", { _percent: parsed, _note: t }); toast.success("Komisi disimpan"); setInput(""); refresh(); } })}>Simpan</Button></div>
          {q.data?.pct != null && <div className="flex items-end"><Button variant="outline" onClick={() => setAsk({ title: "Kembali ke komisi bawaan", label: "Alasan", min: 3, confirm: "Kembalikan", onSubmit: async (t) => { await workRpc("work_admin_clear_commission", { _note: t }); toast.success("Memakai komisi bawaan"); refresh(); } })}>Pakai komisi bawaan</Button></div>}
        </div>
        {input && parsed === null && <p role="alert" className="text-xs text-destructive">Isi angka 0–{MAX_COMMISSION_PERCENT} dengan maksimal 2 desimal.</p>}
        {shown !== null && <p className="text-xs text-muted-foreground">Contoh: proyek {rp(2_000_000)} → komisi {rp(commissionFor(2_000_000, shown))}, freelancer menerima {rp(2_000_000 - commissionFor(2_000_000, shown))} sebelum biaya lain yang berlaku.</p>}
        <p className="text-xs text-muted-foreground">Hanya berlaku untuk pesanan dari kontrak GOBI WORK. Jasa dan karya biasa tetap memakai komisi platform. Perubahan tercatat di audit log.</p>
      </section>
      <section className="rounded-xl border border-border bg-card p-4 text-sm">
        <h3 className="mb-1 font-semibold">Pengaturan lain</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Provider pembayaran (Midtrans): <Link to="/admin/midtrans" className="text-primary underline">/admin/midtrans</Link></li>
          <li>Kategori pekerjaan: tab Kategori di halaman ini</li>
          <li>Fitur Lowongan hidup/mati: <Link to="/admin/fitur" className="text-primary underline">Fitur & pengumuman</Link></li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Batas upload dan teks kebijakan belum ada di sini karena belum ada bagian aplikasi yang membacanya.</p>
      </section>
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}
