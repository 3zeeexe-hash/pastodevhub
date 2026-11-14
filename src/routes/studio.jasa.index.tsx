import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Plus, Star, Wrench } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { timeAgo, useAuth } from "@/lib/auth";
import { errMsg, formatRupiah } from "@/lib/market";
import { SERVICE_STATUS_LABEL, type ServiceStatus } from "@/lib/services";
import { OWNER_ACTION_LABEL, OWNER_ACTION_TARGET, serviceOwnerActions, type OwnerAction } from "@/lib/services-owner";
import { SERVICE_LIST_SELECT, serviceRpc, useSellerProfile, type ServiceListRow } from "@/lib/services-db";
import { SellerActivationCard } from "@/components/service-seller";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/studio/jasa/")({ component: SellerDashboard });

const FILTERS: { key: "all" | ServiceStatus; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Ditinjau" },
  { key: "published", label: "Terbit" },
  { key: "paused", label: "Dijeda" },
  { key: "rejected", label: "Ditolak" },
  { key: "archived", label: "Arsip" },
];
const TONE: Record<ServiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", pending_review: "secondary", published: "default", rejected: "destructive", paused: "secondary", archived: "outline",
};

type NotifRow = { id: number; kind: string; title: string; link: string | null; read_at: string | null; created_at: string };

function Notifications({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["service-notifications", userId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await looseDb.from("service_notifications").select("id,kind,title,link,read_at,created_at").order("id", { ascending: false }).limit(10);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as NotifRow[];
    },
  });
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  if (q.error || !q.data || q.data.length === 0) return null;
  async function markRead() {
    try { await serviceRpc("service_mark_notifications_read"); await qc.invalidateQueries({ queryKey: ["service-notifications"] }); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <section className="rounded-lg border border-border bg-card p-3 text-sm" aria-label="Notifikasi jasa">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Bell className="size-4" /> Notifikasi{unread > 0 && <Badge>{unread} baru</Badge>}</h2>
        {unread > 0 && <Button size="sm" variant="ghost" onClick={markRead}>Tandai dibaca</Button>}
      </div>
      <ul className="mt-2 space-y-1.5">
        {q.data.map((n) => (
          <li key={n.id} className={n.read_at ? "text-muted-foreground" : "font-medium"}>
            {n.link ? <a href={n.link} className="hover:text-primary">{n.title}</a> : n.title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{timeAgo(n.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SellerDashboard() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const seller = useSellerProfile(user?.id);
  const [filter, setFilter] = useState<"all" | ServiceStatus>("all");
  const [editProfile, setEditProfile] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["services", "mine-v2", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await looseDb.from("services").select(SERVICE_LIST_SELECT).eq("owner_id", user!.id).order("created_at", { ascending: false });
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as ServiceListRow[];
    },
  });

  const rows = list.data ?? [];
  const count = (s: ServiceStatus) => rows.filter((r) => r.status === s).length;
  const reviews = rows.reduce((n, r) => n + r.rating_count, 0);
  const avg = reviews ? rows.reduce((n, r) => n + r.rating_avg * r.rating_count, 0) / reviews : 0;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  async function run(id: string, action: OwnerAction) {
    if (action === "delete" && !confirm("Hapus draft ini? Tindakan ini tidak bisa dibatalkan.")) return;
    if (action === "archive" && !confirm("Arsipkan jasa ini? Jasa tidak akan tampil di marketplace.")) return;
    setBusyId(id);
    try {
      if (action === "delete") { await serviceRpc("service_delete_draft", { _id: id }); toast.success("Draft dihapus"); }
      else if (action === "submit") {
        const st = await serviceRpc<string>("service_submit", { _id: id });
        toast.success(st === "published" ? "Jasa terbit" : "Jasa diajukan, menunggu moderasi admin");
      } else {
        const to = OWNER_ACTION_TARGET[action];
        if (!to) return;
        await serviceRpc("service_set_status", { _id: id, _to: to });
        toast.success("Status jasa diperbarui");
      }
      await qc.invalidateQueries({ queryKey: ["services"] });
      await qc.invalidateQueries({ queryKey: ["service-edit"] });
      await qc.invalidateQueries({ queryKey: ["service-notifications"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusyId(null); }
  }

  if (!user || !profile || seller.isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (seller.error) return <Alert variant="destructive"><AlertDescription>Fitur GOBI SERVICES belum siap: {errMsg(seller.error)}. Pastikan SQL 001 sampai 003 sudah diterapkan.</AlertDescription></Alert>;

  const active = !!seller.data?.is_active && !seller.data.suspended_at;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Jasa saya</h1>
        {active && <Button asChild><Link to="/studio/jasa/$id" params={{ id: "baru" }}><Plus /> Buat jasa</Link></Button>}
      </div>

      {!active && <SellerActivationCard seller={seller.data ?? null} accountType={profile.account_type} />}

      {active && <Notifications userId={user.id} />}

      {active && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0"><b>Penyedia jasa aktif</b>{seller.data?.tagline && <span className="text-muted-foreground"> · {seller.data.tagline}</span>}</span>
            <Button size="sm" variant="ghost" onClick={() => setEditProfile((v) => !v)}>{editProfile ? "Tutup" : "Ubah profil"}</Button>
          </div>
          {editProfile && <div className="mt-3"><SellerActivationCard seller={seller.data ?? null} accountType={profile.account_type} onDone={() => setEditProfile(false)} /></div>}
        </div>
      )}

      {active && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Total jasa", rows.length], ["Terbit", count("published")], ["Ditinjau", count("pending_review")], ["Draft", count("draft")]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>
            ))}
          </div>
          {reviews > 0 && <p className="flex items-center gap-1 text-sm text-muted-foreground"><Star className="size-4 fill-primary text-primary" /> {avg.toFixed(1)} dari {reviews} ulasan</p>}

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "secondary"} className="shrink-0" onClick={() => setFilter(f.key)}>
                {f.label}{f.key !== "all" && ` (${count(f.key)})`}
              </Button>
            ))}
          </div>

          {list.isLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
          {list.error && <Alert variant="destructive"><AlertDescription>{errMsg(list.error)}</AlertDescription></Alert>}
          {!list.isLoading && !list.error && shown.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">{rows.length === 0 ? "Belum ada jasa. Buat jasa pertamamu: website, aplikasi, desain, dan lainnya." : "Tidak ada jasa dengan status ini."}</p>
          )}

          <div className="space-y-3">
            {shown.map((s) => {
              const actions = serviceOwnerActions({ status: s.status, adminHold: s.admin_hold });
              return (
                <div key={s.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row">
                  <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md bg-muted sm:w-40">
                    {s.cover_url ? <img src={s.cover_url} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Wrench className="size-8 text-muted-foreground" /></div>}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 truncate font-semibold">{s.title}</h3>
                      <Badge variant={TONE[s.status]}>{s.status === "paused" && s.admin_hold ? "Ditahan admin" : SERVICE_STATUS_LABEL[s.status]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Mulai {formatRupiah(s.price_from, "—")} · {s.delivery_days} hari{s.orders_completed > 0 && ` · ${s.orders_completed} selesai`}</p>
                    {s.status === "rejected" && s.moderation_note && <p className="text-sm text-destructive">Alasan penolakan: {s.moderation_note}</p>}
                    {s.status === "draft" && s.moderation_note && <p className="text-sm text-destructive">Perbaikan diminta admin: {s.moderation_note}</p>}
                    {s.status === "paused" && s.admin_hold && s.moderation_note && <p className="text-sm text-destructive">Alasan penahanan: {s.moderation_note}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {actions.map((a) => a === "edit" ? (
                        <Button key={a} asChild size="sm" variant="secondary"><Link to="/studio/jasa/$id" params={{ id: s.id }}>{OWNER_ACTION_LABEL[a]}</Link></Button>
                      ) : (
                        <Button key={a} size="sm" variant={a === "submit" ? "default" : "ghost"} disabled={busyId === s.id} onClick={() => run(s.id, a)}>{OWNER_ACTION_LABEL[a]}</Button>
                      ))}
                      {s.status === "published" && <Button asChild size="sm" variant="ghost"><Link to="/jasa/$id" params={{ id: s.id }}>Lihat</Link></Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
