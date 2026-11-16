import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Lock, MessagesSquare, Receipt, Search } from "lucide-react";
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

const unreadBadge = "flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-xs font-semibold leading-5 text-white";

/**
 * Satu-satunya halaman Pesan: pesan pribadi, obrolan kerja (lamaran), dan chat pesanan jadi SATU daftar yang diurutkan menurut
 * aktivitas terbaru, dengan penyaring Semua / Pribadi / Kerja / Pesanan. Kanan: isi percakapan.
 * Halaman lain (lowongan, lamaran, jasa, pesanan) tidak punya kolom chat sendiri; mereka memakai tombol "Pesan" yang membuka halaman ini.
 * Layar sempit hanya menampilkan satu panel: daftar, atau percakapan yang dibuka (dengan tombol kembali).
 * /gobifeed/pesan/$id (pesan pribadi) adalah anak rute ini dan tampil lewat <Outlet />.
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

  const loading = (!u && dm.isLoading) || work.isLoading || orders.isLoading;
  // Satu sumber gagal tidak boleh menyembunyikan yang lain: tampilkan peringatan, sisanya tetap muncul.
  const problems = [
    dm.error ? (dm.error.message === DM_NOT_READY ? DM_NOT_READY : `Pesan pribadi gagal dimuat: ${dm.error.message}`) : null,
    work.error ? `Pesan kerja gagal dimuat: ${work.error.message}` : null,
  ].filter((x): x is string => !!x);

  return (
    <main className="mx-auto w-full max-w-6xl md:px-4 md:py-4">
      <div className="flex h-[calc(100dvh-8.5rem)] min-h-[26rem] overflow-hidden bg-card md:h-[calc(100dvh-7rem)] md:rounded-xl md:border md:border-border md:shadow-sm">
        {/* Panel kiri: daftar percakapan */}
        <aside className={cn("w-full flex-col bg-card md:flex md:w-[380px] md:shrink-0 md:border-r md:border-border", hasActive ? "hidden" : "flex")}>
          <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-3">
            <Link to="/gobifeed" search={{}} aria-label="Kembali ke GobiFeed" className="rounded-full p-2 text-[#54656f] hover:bg-black/5"><ArrowLeft className="size-5" /></Link>
            <h1 className="text-xl font-bold text-[#111b21]">Pesan</h1>
          </div>

          <div className="px-3 py-2">
            <label className="flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-3 py-2">
              <Search className="size-4 shrink-0 text-[#54656f]" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama, lowongan, atau pesan"
                aria-label="Cari percakapan"
                className="w-full bg-transparent text-base text-[#111b21] outline-none placeholder:text-[#667781] md:text-sm"
              />
            </label>
          </div>

          <div role="group" aria-label="Saring percakapan" className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                    on ? "bg-[#d9fdd3] text-[#008069]" : "bg-[#f0f2f5] text-[#54656f] hover:bg-[#e6e8ea]",
                  )}
                >
                  {f.label}
                  {n > 0 && <span className={cn(unreadBadge, "min-w-4 px-1 text-[11px] leading-4")} aria-label={`${n} percakapan belum dibaca`}>{n}</span>}
                </button>
              );
            })}
          </div>

          {problems.map((p) => <p key={p} role="alert" className="mx-3 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{p}</p>)}

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {u ? (
              <ListNote>Membuka percakapan…</ListNote>
            ) : loading && all.length === 0 ? (
              <ListNote>Memuat…</ListNote>
            ) : all.length === 0 ? (
              <ListNote icon={<MessagesSquare className="mx-auto mb-2 size-8" aria-hidden />}>
                Belum ada percakapan. Mulai dari tombol <b>Pesan</b> di profil, jasa, lowongan, lamaran, atau pesanan.
              </ListNote>
            ) : shown.length === 0 ? (
              <ListNote>{q.trim() ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan di saringan ini."}</ListNote>
            ) : (
              <ul>
                {shown.map((item) => (
                  <li key={item.key}>
                    <Row item={item} userId={userId} active={item.kind === "dm" ? dmId === item.id : item.kind === "work" ? application === item.id : order === item.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-start gap-1.5 border-t border-border bg-[#f0f2f5] px-3 py-2 text-[11px] leading-snug text-[#667781]">
            <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
            Pesan tersimpan sebagai teks biasa dan tidak dienkripsi ujung-ke-ujung. Jangan kirim kata sandi atau token.
          </p>
        </aside>

        {/* Panel kanan: isi percakapan */}
        <section className={cn("min-w-0 flex-1 flex-col md:flex", hasActive ? "flex" : "hidden")}>
          {u ? (
            <div className="flex h-full items-center justify-center bg-[#efeae2] text-sm text-[#54656f]">Membuka percakapan…</div>
          ) : dmId ? (
            <Outlet />
          ) : application ? (
            <WorkChatPane key={application} applicationId={application} userId={userId} conv={work.data?.find((c) => c.id === application)} />
          ) : order ? (
            <OrderChatPane key={order} orderId={order} userId={userId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f0f2f5] px-8 text-center">
              <MessagesSquare className="size-16 text-[#54656f]/60" aria-hidden />
              <h2 className="text-2xl font-light text-[#41525d]">GOBI Pesan</h2>
              <p className="max-w-sm text-sm text-[#667781]">Pilih percakapan di sebelah kiri. Pesan pribadi, obrolan lamaran dan pekerjaan, serta chat pesanan semuanya ada di sini.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Satu baris percakapan. Tautannya mengikuti jenisnya; tampilannya sama untuk semua jenis. */
function Row({ item, userId, active }: { item: InboxItem; userId: string; active: boolean }) {
  const cls = cn("flex items-center gap-3 px-3 py-3 hover:bg-[#f5f6f6]", active && "bg-[#f0f2f5]");
  const body = (
    <>
      <AvatarMini name={item.username ?? item.name} url={item.avatarUrl} size={49} />
      <div className="-mb-3 min-w-0 flex-1 border-b border-border/70 pb-3">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold text-[#111b21]">{item.name}</span>
          <span className={cn("ml-auto shrink-0 text-xs", item.unread > 0 ? "font-semibold text-[#00a884]" : "text-[#667781]")}>{listTime(item.lastAt)}</span>
        </div>
        {item.context && (
          <p className="flex items-center gap-1 truncate text-xs font-medium text-[#00a884]">
            {item.kind === "order" ? <Receipt className="size-3 shrink-0" aria-hidden /> : <Briefcase className="size-3 shrink-0" aria-hidden />}
            <span className="truncate">{item.context}</span>
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-sm", item.unread > 0 ? "text-[#111b21]" : "text-[#667781]")}>
            {item.lastBody ? `${item.lastSender === userId ? "Kamu: " : ""}${item.lastBody}` : "Belum ada pesan"}
          </p>
          {item.unread > 0 && <span className={unreadBadge}>{item.unread}</span>}
        </div>
      </div>
    </>
  );
  if (item.kind === "dm") return <Link to="/gobifeed/pesan/$id" params={{ id: item.id }} className={cls}>{body}</Link>;
  if (item.kind === "work") return <Link to="/gobifeed/pesan" search={{ application: item.id }} className={cls}>{body}</Link>;
  return <Link to="/gobifeed/pesan" search={{ order: item.id }} className={cls}>{body}</Link>;
}

function ListNote({ children, icon, tone = "muted" }: { children: React.ReactNode; icon?: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cn("p-8 text-center text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {icon}
      {children}
    </div>
  );
}
