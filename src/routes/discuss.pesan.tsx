import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Lock, Mail, MessagesSquare, Search } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { DM_NOT_READY, fetchInbox, startConversation } from "@/lib/dm";
import { fetchWorkConversations } from "@/lib/work-chat";
import { listTime } from "@/lib/chat-time";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { WorkChatPane } from "@/components/work-chat-pane";
import { cn } from "@/lib/utils";

type Tab = "biasa" | "kerja";

const searchSchema = z.object({
  /** Username: buka (atau buat) percakapan dengan orang itu. */
  u: z.string().optional().catch(undefined),
  /** Tab daftar: pesan biasa atau pesan kerja. */
  tab: z.enum(["biasa", "kerja"]).optional().catch(undefined),
  /** Id lamaran: buka obrolan kerja itu (tab kerja). */
  application: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/discuss/pesan")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Pesan — GOBI" }, { name: "robots", content: "noindex" }] }),
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
 * Layar pesan ala WhatsApp: kiri daftar percakapan (dua tab: Pesan biasa dan Pesan kerja), kanan isi percakapan.
 * Layar sempit hanya menampilkan satu panel: daftar, atau percakapan yang dibuka (dengan tombol kembali).
 * /discuss/pesan/$id (DM) adalah anak rute ini dan tampil lewat <Outlet />.
 */
function Messenger({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  const { u, tab, application } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef<string | null>(null);
  const [q, setQ] = useState("");

  const dmId = /^\/discuss\/pesan\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const active: Tab = dmId ? "biasa" : (tab ?? (application ? "kerja" : "biasa"));
  const workOpen = active === "kerja" && !!application;
  const hasActive = !!u || !!dmId || workOpen;

  // /discuss/pesan?u=nama membuka (atau membuat) percakapan lalu pindah ke sana.
  useEffect(() => {
    if (!u || started.current === u) return;
    started.current = u;
    startConversation(u)
      .then((id) => navigate({ to: "/discuss/pesan/$id", params: { id }, replace: true }))
      .catch((e: Error) => {
        toast.error(e.message);
        navigate({ to: "/discuss/pesan", search: {}, replace: true });
      });
  }, [u, navigate]);

  const inbox = useQuery({ queryKey: ["dm-inbox", userId], queryFn: fetchInbox, enabled: !u, refetchInterval: 30_000 });
  const work = useQuery({ queryKey: ["work-convs-v2", userId], queryFn: () => fetchWorkConversations(userId), refetchInterval: 20_000 });
  useEffect(() => { if (inbox.data) void qc.invalidateQueries({ queryKey: ["dm-unread"] }); }, [inbox.data, qc]);

  const needle = q.trim().toLowerCase();
  const dmRows = useMemo(
    () => (inbox.data ?? []).filter((c) => !needle || `${c.display_name ?? ""} ${c.username} ${c.last_body}`.toLowerCase().includes(needle)),
    [inbox.data, needle],
  );
  const workRows = useMemo(
    () => (work.data ?? []).filter((c) => !needle || `${c.otherName} ${c.otherUsername ?? ""} ${c.jobTitle} ${c.lastBody ?? ""}`.toLowerCase().includes(needle)),
    [work.data, needle],
  );
  const dmUnread = inbox.data?.filter((c) => c.unread > 0).length ?? 0;
  const workUnread = work.data?.filter((c) => c.unread > 0).length ?? 0;
  const tabs: { key: Tab; label: string; badge: number }[] = [
    { key: "biasa", label: "Pesan", badge: dmUnread },
    { key: "kerja", label: "Kerja", badge: workUnread },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl md:px-4 md:py-4">
      <div className="flex h-[calc(100dvh-8.5rem)] min-h-[26rem] overflow-hidden bg-card md:h-[calc(100dvh-7rem)] md:rounded-xl md:border md:border-border md:shadow-sm">
        {/* Panel kiri: daftar percakapan */}
        <aside className={cn("w-full flex-col bg-card md:flex md:w-[380px] md:shrink-0 md:border-r md:border-border", hasActive ? "hidden" : "flex")}>
          <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-3">
            <Link to="/discuss" search={{}} aria-label="Kembali ke Diskusi" className="rounded-full p-2 text-[#54656f] hover:bg-black/5"><ArrowLeft className="size-5" /></Link>
            <h1 className="text-xl font-bold text-[#111b21]">Pesan</h1>
          </div>

          <div className="px-3 py-2">
            <label className="flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-3 py-2">
              <Search className="size-4 shrink-0 text-[#54656f]" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari percakapan"
                aria-label="Cari percakapan"
                className="w-full bg-transparent text-base text-[#111b21] outline-none placeholder:text-[#667781] md:text-sm"
              />
            </label>
          </div>

          <div role="tablist" aria-label="Jenis pesan" className="flex border-b border-border">
            {tabs.map((t) => (
              <Link
                key={t.key}
                to="/discuss/pesan"
                search={{ tab: t.key }}
                role="tab"
                aria-selected={active === t.key}
                className={cn("relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors", active === t.key ? "text-[#00a884]" : "text-[#667781] hover:bg-[#f5f6f6]")}
              >
                {t.label}
                {t.badge > 0 && <span className={unreadBadge} aria-label={`${t.badge} percakapan belum dibaca`}>{t.badge}</span>}
                <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[3px] bg-[#00a884] transition-opacity", active === t.key ? "opacity-100" : "opacity-0")} />
              </Link>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {active === "biasa" ? (
              u || inbox.isLoading ? (
                <ListNote>{u ? "Membuka percakapan…" : "Memuat…"}</ListNote>
              ) : inbox.error ? (
                <ListNote tone="error">{inbox.error.message === DM_NOT_READY ? DM_NOT_READY : `Gagal memuat pesan: ${inbox.error.message}`}</ListNote>
              ) : !inbox.data?.length ? (
                <ListNote icon={<Mail className="mx-auto mb-2 size-8" aria-hidden />}>Belum ada percakapan. Buka profil seseorang lalu pilih “Kirim pesan”.</ListNote>
              ) : !dmRows.length ? (
                <ListNote>Tidak ada percakapan yang cocok.</ListNote>
              ) : (
                <ul>
                  {dmRows.map((c) => (
                    <li key={c.conversation_id}>
                      <Link
                        to="/discuss/pesan/$id"
                        params={{ id: c.conversation_id }}
                        className={cn("flex items-center gap-3 px-3 py-3 hover:bg-[#f5f6f6]", dmId === c.conversation_id && "bg-[#f0f2f5]")}
                      >
                        <AvatarMini name={c.username} url={c.avatar_url} size={49} />
                        <div className="min-w-0 flex-1 border-b border-border/70 pb-3 -mb-3">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate font-semibold text-[#111b21]">{c.display_name || c.username}</span>
                            <span className={cn("ml-auto shrink-0 text-xs", c.unread > 0 ? "font-semibold text-[#00a884]" : "text-[#667781]")}>{listTime(c.last_at)}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <p className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "text-[#111b21]" : "text-[#667781]")}>
                              {c.last_sender === userId ? "Kamu: " : ""}{c.last_body}
                            </p>
                            {c.unread > 0 && <span className={unreadBadge}>{c.unread}</span>}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : work.isLoading ? (
              <ListNote>Memuat…</ListNote>
            ) : work.error ? (
              <ListNote tone="error">Gagal memuat pesan kerja: {work.error.message}</ListNote>
            ) : !work.data?.length ? (
              <ListNote icon={<Briefcase className="mx-auto mb-2 size-8" aria-hidden />}>Belum ada pesan kerja. Obrolan muncul setelah ada lamaran pada lowongan.</ListNote>
            ) : !workRows.length ? (
              <ListNote>Tidak ada percakapan yang cocok.</ListNote>
            ) : (
              <ul>
                {workRows.map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/discuss/pesan"
                      search={{ tab: "kerja", application: c.id }}
                      className={cn("flex items-center gap-3 px-3 py-3 hover:bg-[#f5f6f6]", workOpen && application === c.id && "bg-[#f0f2f5]")}
                    >
                      <AvatarMini name={c.otherName} url={c.otherAvatar} size={49} />
                      <div className="min-w-0 flex-1 border-b border-border/70 pb-3 -mb-3">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate font-semibold text-[#111b21]">{c.otherName}</span>
                          <span className={cn("ml-auto shrink-0 text-xs", c.unread > 0 ? "font-semibold text-[#00a884]" : "text-[#667781]")}>{listTime(c.lastAt)}</span>
                        </div>
                        <p className="flex items-center gap-1 truncate text-xs font-medium text-[#00a884]"><Briefcase className="size-3 shrink-0" aria-hidden /><span className="truncate">{c.jobTitle}</span></p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "text-[#111b21]" : "text-[#667781]")}>
                            {c.lastBody ? `${c.lastSender === userId ? "Kamu: " : ""}${c.lastBody}` : "Belum ada pesan"}
                          </p>
                          {c.unread > 0 && <span className={unreadBadge}>{c.unread}</span>}
                        </div>
                      </div>
                    </Link>
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
          ) : workOpen ? (
            <WorkChatPane key={application} applicationId={application!} userId={userId} conv={work.data?.find((c) => c.id === application)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#f0f2f5] px-8 text-center">
              <MessagesSquare className="size-16 text-[#54656f]/60" aria-hidden />
              <h2 className="text-2xl font-light text-[#41525d]">GOBI Pesan</h2>
              <p className="max-w-sm text-sm text-[#667781]">Pilih percakapan di sebelah kiri. Tab Pesan untuk obrolan biasa, tab Kerja untuk obrolan lamaran dan pekerjaan.</p>
            </div>
          )}
        </section>
      </div>
    </main>
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
