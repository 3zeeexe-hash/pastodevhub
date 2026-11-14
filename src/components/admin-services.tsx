// GOBI SERVICES Fase 3: tab admin untuk moderasi jasa (ringkasan, daftar + detail + keputusan, pengaturan moderasi, audit).
// Semua perubahan lewat fungsi database khusus admin (service_admin_*) yang mewajibkan alasan dan tercatat di audit log.
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { SERVICE_STATUS_LABEL, type ServiceStatus } from "@/lib/services";
import {
  MODERATION_LABEL, moderationActions, moderationEventLabel, moderationReasonError,
  type AdminServiceDetail, type AdminServiceList, type AdminServiceRow, type AdminServiceStats, type ModerationAction,
} from "@/lib/services-admin";
import { serviceRpc, useServiceTaxonomy } from "@/lib/services-db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, Pill, ReasonDialog, Stat, type Ask } from "@/components/work-ui";

const PAGE = 20;
const STATUS_OPTIONS: { value: "all" | ServiceStatus; label: string }[] = [
  { value: "pending_review", label: "Menunggu moderasi" },
  { value: "published", label: "Terbit" },
  { value: "draft", label: "Draft" },
  { value: "rejected", label: "Ditolak" },
  { value: "paused", label: "Dijeda / ditahan" },
  { value: "archived", label: "Arsip" },
  { value: "all", label: "Semua status" },
];

function statusTone(s: ServiceStatus, hold: boolean): "ok" | "warn" | "bad" | "info" {
  if (s === "published") return "ok";
  if (s === "pending_review") return "warn";
  if (s === "rejected" || (s === "paused" && hold)) return "bad";
  return "info";
}
const statusText = (s: ServiceStatus, hold: boolean) => (s === "paused" && hold ? "Ditahan admin" : SERVICE_STATUS_LABEL[s]);

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["svc-admin"] });
  qc.invalidateQueries({ queryKey: ["services"] });
}

/* ---------- Ringkasan ---------- */
export function ServicesOverview() {
  const s = useQuery({ queryKey: ["svc-admin", "stats"], queryFn: () => serviceRpc<AdminServiceStats>("service_admin_stats") });
  return (
    <div className="space-y-3">
      {s.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {s.error && <ErrorState error={s.error} onRetry={() => s.refetch()} />}
      {s.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Penyedia jasa aktif" value={s.data.sellers} />
            <Stat label="Total jasa" value={s.data.services} />
            <Stat label="Jasa terbit" value={s.data.published} />
            <Stat label="Menunggu moderasi" value={s.data.pending_review} />
            <Stat label="Draft" value={s.data.draft} />
            <Stat label="Ditolak" value={s.data.rejected} />
            <Stat label="Dijeda" value={s.data.paused} hint={`${s.data.held_by_admin} ditahan admin`} />
            <Stat label="Diarsipkan" value={s.data.archived} />
          </div>
          <p className="text-xs text-muted-foreground">Statistik pesanan, transaksi, komisi, dan sengketa ditambahkan di fase berikutnya, setelah data pesanan jasa ada.</p>
        </>
      )}
    </div>
  );
}

/* ---------- Daftar jasa + detail ---------- */
export function ServicesList() {
  const taxonomy = useServiceTaxonomy();
  const [status, setStatus] = useState<"all" | ServiceStatus>("pending_review");
  const [category, setCategory] = useState("all");
  const [text, setText] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["svc-admin", "list", status, category, applied, page],
    queryFn: () => serviceRpc<AdminServiceList>("service_admin_list", {
      _status: status === "all" ? null : status, _q: applied || null, _category: category === "all" ? null : category, _limit: PAGE, _offset: page * PAGE,
    }),
  });
  const catLabel = (slug: string | null) => (slug ? taxonomy.data?.categories.find((c) => c.slug === slug)?.label ?? slug : "—");
  const total = q.data?.total ?? 0;

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(text.trim()); setPage(0); }}>
        <div className="w-52">
          <Select value={status} onValueChange={(v) => { setStatus(v as "all" | ServiceStatus); setPage(0); }}>
            <SelectTrigger aria-label="Status jasa"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
            <SelectTrigger aria-label="Kategori"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kategori</SelectItem>
              {(taxonomy.data?.categories ?? []).map((c) => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input className="min-w-40 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari judul atau penjual" aria-label="Cari jasa" maxLength={80} />
        <Button type="submit" variant="secondary"><Search /> Cari</Button>
      </form>

      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.rows.length === 0 && <EmptyState>{status === "pending_review" ? "Tidak ada jasa yang menunggu moderasi." : "Tidak ada jasa pada filter ini."}</EmptyState>}

      <ul className="space-y-2">
        {q.data?.rows.map((s: AdminServiceRow) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center">
            <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-28">
              {s.cover_url && <img src={s.cover_url} alt="" loading="lazy" className="size-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 truncate font-semibold">{s.title}</span><Pill tone={statusTone(s.status, s.admin_hold)}>{statusText(s.status, s.admin_hold)}</Pill></div>
              <p className="text-xs text-muted-foreground">@{s.owner.username} · {catLabel(s.category_slug)} · mulai {formatRupiah(s.price_from, "—")} · dibuat {timeAgo(s.created_at)}</p>
              {s.moderation_note && <p className="line-clamp-2 text-xs text-muted-foreground">Catatan: {s.moderation_note}</p>}
            </div>
            <Button size="sm" variant={s.status === "pending_review" ? "default" : "outline"} onClick={() => setOpenId(s.id)}>{s.status === "pending_review" ? "Tinjau" : "Detail"}</Button>
          </li>
        ))}
      </ul>

      {total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} dari {total}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
        </div>
      )}

      <ServiceDetail serviceId={openId} onClose={() => setOpenId(null)} catLabel={catLabel} />
    </div>
  );
}

function ServiceDetail({ serviceId, onClose, catLabel }: { serviceId: string | null; onClose: () => void; catLabel: (s: string | null) => string }) {
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    enabled: !!serviceId,
    queryKey: ["svc-admin", "detail", serviceId],
    queryFn: () => serviceRpc<AdminServiceDetail>("service_admin_detail", { _id: serviceId }),
  });
  const d = q.data;

  async function run(action: ModerationAction, note: string) {
    const err = moderationReasonError(action, note);
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      await serviceRpc<string>("service_admin_moderate", { _service_id: serviceId, _action: action, _note: note.trim() });
      toast.success(`${MODERATION_LABEL[action]}: tersimpan`);
      invalidateAll(qc);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  function act(a: ModerationAction) {
    if (a === "approve") {
      if (confirm("Setujui dan terbitkan jasa ini?")) void run("approve", "");
      return;
    }
    setAsk({ title: MODERATION_LABEL[a], label: "Alasan (terkirim ke penjual dan tercatat di audit)", min: 10, confirm: MODERATION_LABEL[a], onSubmit: async (t) => { await run(a, t); } });
  }

  const actions = d ? moderationActions({ status: d.service.status, adminHold: d.service.admin_hold }) : [];
  const incomplete = (d?.readiness.length ?? 0) > 0;

  return (
    <Dialog open={!!serviceId} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Detail jasa</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-40 rounded-xl" />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {d && (
          <div className="space-y-4 text-sm">
            <section className="space-y-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{d.service.title}</h3><Pill tone={statusTone(d.service.status, d.service.admin_hold)}>{statusText(d.service.status, d.service.admin_hold)}</Pill></div>
              <p className="text-xs text-muted-foreground">
                Penjual @{d.owner?.username ?? "?"}{d.owner?.display_name ? ` (${d.owner.display_name})` : ""}{d.seller?.tagline ? ` · ${d.seller.tagline}` : ""}
                {d.seller?.suspended_at ? " · profil penyedia dibatasi" : ""} · {catLabel(d.service.category_slug)} · dibuat {timeAgo(d.service.created_at)}
              </p>
              {d.reports_open > 0 && <p className="text-xs font-medium text-destructive">{d.reports_open} laporan terbuka untuk jasa ini</p>}
              {d.service.moderation_note && <p className="rounded-md bg-muted p-2 text-xs">Catatan moderasi saat ini: {d.service.moderation_note}</p>}
            </section>

            {incomplete && (
              <section className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <p className="font-medium text-destructive">Jasa belum lengkap, tidak bisa disetujui:</p>
                <ul className="list-disc pl-5">{d.readiness.map((r) => <li key={r}>{r}</li>)}</ul>
              </section>
            )}

            {d.service.cover_url && <img src={d.service.cover_url} alt="" className="aspect-video w-full rounded-md object-cover" />}
            {d.gallery.some((g) => g.url) && <div className="grid grid-cols-4 gap-2">{d.gallery.filter((g) => g.url).map((g) => <img key={g.id} src={g.url as string} alt={g.caption} loading="lazy" className="aspect-video rounded object-cover" />)}</div>}

            {d.service.summary && <p className="font-medium">{d.service.summary}</p>}
            <p className="whitespace-pre-wrap break-words">{d.service.description || <span className="text-muted-foreground">Deskripsi kosong.</span>}</p>
            {d.service.skills.length > 0 && <div className="flex flex-wrap gap-1.5">{d.service.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</div>}

            <section className="space-y-2">
              <h4 className="font-semibold">Paket</h4>
              {d.packages.length === 0 && <p className="text-xs text-muted-foreground">Belum ada paket.</p>}
              <div className="grid gap-2 sm:grid-cols-3">
                {d.packages.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border p-3">
                    <p className="text-xs uppercase text-muted-foreground">{p.tier}</p>
                    <p className="font-semibold">{p.name}</p>
                    <p className="font-bold text-primary">{formatRupiah(p.price, "—")}</p>
                    <p className="text-xs text-muted-foreground">{p.delivery_days} hari · {p.revisions} revisi{p.work_limit ? ` · ${p.work_limit}` : ""}</p>
                    {p.description && <p className="mt-1 text-xs">{p.description}</p>}
                    <ul className="mt-1 list-disc pl-4 text-xs">{(p.features ?? []).map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>

            {d.addons.length > 0 && (
              <section><h4 className="font-semibold">Add-on</h4>
                <ul className="mt-1 space-y-0.5 text-xs">{d.addons.map((a) => <li key={a.id}>{a.name} — {formatRupiah(a.price, "—")}{a.extra_days > 0 ? ` · +${a.extra_days} hari` : ""}{a.extra_revisions > 0 ? ` · +${a.extra_revisions} revisi` : ""}</li>)}</ul>
              </section>
            )}
            {(d.service.buyer_requirements || d.service.revision_terms || d.service.scope_limits) && (
              <section className="space-y-1 text-xs">
                {d.service.buyer_requirements && <p><b>Syarat dari pembeli:</b> {d.service.buyer_requirements}</p>}
                {d.service.revision_terms && <p><b>Ketentuan revisi:</b> {d.service.revision_terms}</p>}
                {d.service.scope_limits && <p><b>Batas ruang lingkup:</b> {d.service.scope_limits}</p>}
              </section>
            )}
            {d.faqs.length > 0 && <section><h4 className="font-semibold">FAQ</h4><ul className="mt-1 space-y-1 text-xs">{d.faqs.map((f) => <li key={f.id}><b>{f.question}</b> {f.answer}</li>)}</ul></section>}

            <section>
              <h4 className="font-semibold">Riwayat status</h4>
              {d.events.length === 0 && <p className="text-xs text-muted-foreground">Belum ada riwayat.</p>}
              <ul className="mt-1 space-y-1 text-xs">
                {d.events.map((e) => (
                  <li key={e.id} className="rounded-md bg-muted p-2">
                    <span className="font-medium">{moderationEventLabel(e)}</span> <span className="text-muted-foreground">· {e.actor ? `@${e.actor}` : "sistem"} · {timeAgo(e.created_at)}</span>
                    {e.note && <p className="mt-0.5 whitespace-pre-wrap">{e.note}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {actions.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada aksi moderasi untuk status ini.</p>}
              {actions.map((a) => (
                <Button key={a} size="sm" variant={a === "approve" ? "default" : a === "reject" || a === "hold" ? "destructive" : "outline"} disabled={busy || (a === "approve" && incomplete)} onClick={() => act(a)}>
                  {busy && <Loader2 className="animate-spin" />} {MODERATION_LABEL[a]}
                </Button>
              ))}
              {d.service.status === "published" && <Button asChild size="sm" variant="ghost"><Link to="/jasa/$id" params={{ id: d.service.id }}>Lihat halaman publik</Link></Button>}
            </div>
          </div>
        )}
        <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Pengaturan moderasi ---------- */
export function ServicesSettings() {
  const qc = useQueryClient();
  const [ask, setAsk] = useState<Ask | null>(null);
  const q = useQuery({
    queryKey: ["svc-admin", "setting-moderation"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("service_settings").select("value").eq("key", "require_moderation").maybeSingle();
      if (error) throw new Error(errMsg(error));
      return data?.value === true;
    },
  });
  function toggle(next: boolean) {
    setAsk({
      title: next ? "Wajibkan moderasi jasa" : "Matikan moderasi jasa", label: "Alasan perubahan (tercatat di audit)", min: 5, confirm: "Simpan",
      onSubmit: async (t) => {
        try {
          await serviceRpc("service_admin_set_setting", { _key: "require_moderation", _value: next, _note: t.trim() });
          toast.success(next ? "Moderasi diwajibkan" : "Moderasi dimatikan");
          qc.invalidateQueries({ queryKey: ["svc-admin"] });
          qc.invalidateQueries({ queryKey: ["service-config"] });
        } catch (e) { toast.error(errMsg(e)); }
      },
    });
  }
  return (
    <div className="max-w-xl space-y-3">
      {q.isLoading && <Skeleton className="h-20 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data !== undefined && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="font-medium">Wajib moderasi sebelum jasa terbit</span>
            <Switch checked={q.data} onCheckedChange={toggle} aria-label="Wajib moderasi sebelum jasa terbit" />
          </label>
          <p className="text-sm text-muted-foreground">
            {q.data
              ? "Aktif: jasa baru dan jasa terbit yang diubah judul, deskripsi, atau kategorinya masuk antrean moderasi dan baru tampil setelah disetujui."
              : "Nonaktif: jasa yang lengkap langsung terbit tanpa tinjauan admin (moderasi otomatis). Admin tetap bisa menahan jasa kapan saja."}
          </p>
        </div>
      )}
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

/* ---------- Audit ---------- */
type AuditRow = { id: number; admin_label: string | null; action: string; target_type: string | null; target_id: string | null; note: string | null; created_at: string };
export function ServicesAudit() {
  const q = useQuery({
    queryKey: ["svc-admin", "audit"],
    queryFn: async () => {
      const { data, error } = await looseDb.from("admin_audit_log").select("id,admin_label,action,target_type,target_id,note,created_at").ilike("action", "service%").order("id", { ascending: false }).limit(200);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as AuditRow[];
    },
  });
  return (
    <div className="space-y-2">
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState>Belum ada catatan audit jasa.</EmptyState>}
      <ul className="space-y-1.5">
        {q.data?.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted-foreground">{a.admin_label ? `@${a.admin_label}` : "admin"} · {timeAgo(a.created_at)}</span></div>
            {(a.target_type || a.note) && <p className="mt-0.5 break-words text-xs text-muted-foreground">{a.target_type}{a.target_id ? ` ${a.target_id}` : ""}{a.note ? ` — ${a.note}` : ""}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
