import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Lock, MessagesSquare, Receipt, Search, X } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { DM_NOT_READY, fetchInbox, startConversation } from "@/lib/dm";
import { fetchWorkConversations } from "@/lib/work-chat";
import { fetchOrderConversations } from "@/lib/inbox-data";
import { INBOX_FILTERS, filterInbox, mergeInbox, resolveFilter, unreadByFilter, type InboxFilter, type InboxItem } from "@/lib/inbox";
import { listTime } from "@/lib/chat-time";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { WorkChatPane } from "@/components/work-chat-pane";
import { OrderChatPane } from "@/components/order-chat-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  /** Username: buka (atau buat) pesan pribadi dengan orang itu. */
  u: z.string().optional().catch(undefined),
  /** Saringan daftar: semua, pribadi, kerja, atau pesanan. */
  filter: z.enum(["semua", "pribadi", "kerja", "pesanan"]).optional().catch(undefined),
  /** Parameter lama dari halaman yang dulu punya dua tab; tetap diterima supaya tautan lama jalan. */
  tab: z.enum(["biasa", "kerja"]).optional().catch(undefined),
  /** Id lamaran: buka obrolan kerja itu. */
  application: z.string().optional().catch(undefined),
  /** Id pesanan: buka chat pesanan itu. */
  order: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/gobifeed/pesan")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Pesan — GoBi" }, { name: "robots", content: "noindex" }] }),
  component: PesanLayout,
});

function PesanLayout() {
  const { user, loading } = useAuth();
  if (loading) return <main className="mx-auto max-w-2xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-2xl px-4 py-8"><SignInCta text="Masuk untuk membaca pesanmu." /></main>;
  return <Messenger userId={user.id} />;
}

const unreadBadge = "flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-5 text-primary-foreground";

/**
 * Satu-satunya halaman Pesan: pesan pribadi, obrolan kerja (lamaran), dan chat pesanan jadi SATU daftar yang diurutkan menurut
 * aktivitas terbaru, dengan penyaring Semua / Pribadi / Kerja / Pesanan. Kanan: isi percakapan.
 * Halaman lain (lowongan, lamaran, jasa, pesanan) tidak punya kolom chat sendiri; mereka memakai tombol "Pesan" yang membuka halaman ini.
 * Layar sempit hanya menampilkan satu panel: daftar, atau percakapan yang dibuka (dengan tombol kembali).
 * /gobifeed/pesan/$id (pesan pribadi) adalah anak rute ini dan tampil lewat <Outlet />.
 * Warna mengikuti beranda: biru tua (header), oranye (aksen dan tombol utama), abu-abu (latar), putih (kartu).
 */
function Messenger({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  const { u, filter: filterParam, tab, application, order } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef<string | null>(null);
  const [q, setQ] = useState("");
  // Saringan disimpan di state (bukan di alamat) supaya mengganti saringan tidak menutup percakapan yang sedang dibuka.
  const [filter, setFilter] = useState<InboxFilter>(() => resolveFilter({ filter: filterParam, tab }));
  useEffect(() => { setFilter(resolveFilter({ filter: filterParam, tab })); }, [filterParam, tab]);

  const dmId = /^\/gobifeed\/pesan\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const hasActive = !!u || !!dmId || !!application || !!order;

  // /gobifeed/pesan?u=nama membuka (atau membuat) pesan pribadi lalu pindah ke sana.
  useEffect(() => {
    if (!u || started.current === u) return;
    started.current = u;
    startConversation(u)
      .then((id) => navigate({ to: "/gobifeed/pesan/$id", params: { id }, replace: true }))
      .catch((e: Error) => {
        toast.error(e.message);
        navigate({ to: "/gobifeed/pesan", search: {}, replace: true });
      });
  }, [u, navigate]);

  const dm = useQuery({ queryKey: ["dm-inbox", userId], queryFn: fetchInbox, enabled: !u, refetchInterval: 30_000 });
  const work = useQuery({ queryKey: ["work-convs-v2", userId], queryFn: () => fetchWorkConversations(userId), refetchInterval: 20_000 });
  const orders = useQuery({ queryKey: ["order-convs", userId], queryFn: () => fetchOrderConversations(userId), refetchInterval: 30_000 });
  // Lencana menu menghitung pesan pribadi + kerja, jadi ikut disegarkan saat salah satunya dimuat.
  useEffect(() => { if (dm.data || work.data) void qc.invalidateQueries({ queryKey: ["dm-unread"] }); }, [dm.data, work.data, qc]);

  const all = useMemo(() => mergeInbox(dm.data ?? [], work.data ?? [], orders.data ?? []), [dm.data, work.data, orders.data]);
  const shown = useMemo(() => filterInbox(all, filter, q), [all, filter, q]);
  const unread = useMemo(() => unreadByFilter(all), [all]);
  const unreadConvs = useMemo(() => all.filter((i) => i.unread > 0).length, [all]);

  const loading = (!u && dm.isLoading) || work.isLoading || orders.isLoading;
  // Satu sumber gagal tidak boleh menyembunyikan yang lain: tampilkan peringatan, sisanya tetap muncul.
  const problems = [
    dm.error ? (dm.error.message === DM_NOT_READY ? DM_NOT_READY : `Pesan pribadi gagal dimuat: ${dm.error.message}`) : null,
    work.error ? `Pesan kerja gagal dimuat: ${work.error.message}` : null,
  ].filter((x): x is string => !!x);

  return (
    <main className="mx-auto w-full max-w-6xl md:px-4 md:py-4">
      <div className="flex h-[calc(100dvh-8.5rem)] min-h-[26rem] overflow-hidden bg-card md:h-[calc(100dvh-7rem)] md:rounded-3xl md:border md:border-border md:shadow-[0_24px_60px_-28px_rgba(10,26,69,0.4)]">
        {/* Panel kiri: daftar percakapan */}
        <aside className={cn("w-full min-w-0 flex-col bg-card md:flex md:w-[360px] md:shrink-0 md:border-r md:border-border lg:w-[400px]", hasActive ? "hidden" : "flex")}>
          {/* Kepala biru tua seperti header beranda, dengan kolom cari di dalamnya */}
          <div className="relative overflow-hidden bg-header-gradient px-4 pb-4 pt-3 text-header-foreground">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-primary/30 blur-3xl" />
            <div className="relative flex items-center gap-2">
              <Link to="/gobifeed" search={{}} aria-label="Kembali ke GobiFeed" className="-ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white">
                <ArrowLeft className="size-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight">Pesan</h1>
                <p className="truncate text-xs text-white/70">
                  {all.length === 0 ? "Pribadi, kerja, dan pesanan" : `${all.length} percakapan${unreadConvs > 0 ? ` · ${unreadConvs} belum dibaca` : ""}`}
                </p>
              </div>
            </div>
            <label className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-foreground shadow-sm ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-primary">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama, lowongan, atau pesan"
                aria-label="Cari percakapan"
                className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
              {q && (
                <button type="button" aria-label="Hapus pencarian" onClick={() => setQ("")} className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </div>

          <div role="group" aria-label="Saring percakapan" className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {INBOX_FILTERS.map((f) => {
              const on = filter === f.key;
              const n = unread[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-secondary-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                  {n > 0 && (
                    <span className={cn("flex min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-4", on ? "bg-navy text-white" : "bg-primary text-primary-foreground")} aria-label={`${n} percakapan belum dibaca`}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>

          {problems.map((p) => <p key={p} role="alert" className="mx-3 mb-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{p}</p>)}

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {u ? (
              <ListNote>Membuka percakapan…</ListNote>
            ) : loading && all.length === 0 ? (
              <ListSkeleton />
            ) : all.length === 0 ? (
              <ListNote icon={<span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><MessagesSquare className="size-7" aria-hidden /></span>}>
                Belum ada percakapan. Mulai dari tombol <b>Pesan</b> di profil, jasa, lowongan, lamaran, atau pesanan.
              </ListNote>
            ) : shown.length === 0 ? (
              <ListNote>{q.trim() ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan di saringan ini."}</ListNote>
            ) : (
              <ul className="space-y-0.5 p-2">
                {shown.map((item) => (
                  <li key={item.key}>
                    <Row item={item} userId={userId} active={item.kind === "dm" ? dmId === item.id : item.kind === "work" ? application === item.id : order === item.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-start gap-1.5 border-t border-border bg-secondary/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
            Pesan tersimpan sebagai teks biasa dan tidak dienkripsi ujung-ke-ujung. Jangan kirim kata sandi atau token.
          </p>
        </aside>

        {/* Panel kanan: isi percakapan */}
        <section className={cn("min-w-0 flex-1 flex-col md:flex", hasActive ? "flex" : "hidden")}>
          {u ? (
            <div className="flex h-full items-center justify-center bg-grey-50 text-sm text-muted-foreground">Membuka percakapan…</div>
          ) : dmId ? (
            <Outlet />
          ) : application ? (
            <WorkChatPane key={application} applicationId={application} userId={userId} conv={work.data?.find((c) => c.id === application)} />
          ) : order ? (
            <OrderChatPane key={order} orderId={order} userId={userId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-grey-50 px-8 text-center">
              <span className="grid size-20 place-items-center rounded-3xl bg-sun text-primary-foreground shadow-glow"><MessagesSquare className="size-10" aria-hidden /></span>
              <h2 className="text-2xl font-bold text-navy">GOBI Pesan</h2>
              <p className="max-w-sm text-sm text-muted-foreground">Pilih percakapan di sebelah kiri. Pesan pribadi, obrolan lamaran dan pekerjaan, serta chat pesanan semuanya ada di sini.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Satu baris percakapan. Tautannya mengikuti jenisnya; tampilannya sama untuk semua jenis. */
function Row({ item, userId, active }: { item: InboxItem; userId: string; active: boolean }) {
  const unread = item.unread > 0;
  const cls = cn("flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors", active ? "bg-accent ring-1 ring-primary/40" : "hover:bg-secondary/70");
  const body = (
    <>
      <AvatarMini name={item.username ?? item.name} url={item.avatarUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("truncate text-foreground", unread ? "font-bold" : "font-semibold")}>{item.name}</span>
          <span className={cn("ml-auto shrink-0 text-xs", unread ? "font-semibold text-orange-ink" : "text-muted-foreground")}>{listTime(item.lastAt)}</span>
        </div>
        {item.context && (
          <p className="flex items-center gap-1 truncate text-xs font-medium text-orange-ink">
            {item.kind === "order" ? <Receipt className="size-3 shrink-0" aria-hidden /> : <Briefcase className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{item.context}</span>
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {item.lastBody ? `${item.lastSender === userId ? "Kamu: " : ""}${item.lastBody}` : "Belum ada pesan"}
          </p>
          {unread && <span className={unreadBadge}>{item.unread}</span>}
        </div>
      </div>
    </>
  );
  if (item.kind === "dm") return <Link to="/gobifeed/pesan/$id" params={{ id: item.id }} className={cls}>{body}</Link>;
  if (item.kind === "work") return <Link to="/gobifeed/pesan" search={{ application: item.id }} className={cls}>{body}</Link>;
  return <Link to="/gobifeed/pesan" search={{ order: item.id }} className={cls}>{body}</Link>;
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Memuat percakapan">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListNote({ children, icon, tone = "muted" }: { children: React.ReactNode; icon?: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cn("p-8 text-center text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {icon}
      {children}
    </div>
  );
}
