import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, MessageCircle, Send, X } from "lucide-react";
import { timeAgo, useAuth } from "@/lib/auth";
import { CHAT_DOCK_EVENT, type ChatDockRequest } from "@/lib/chat-dock";
import { fetchDmUnread, fetchInbox, fetchMessages, fetchPartner, markConversationRead, sendMessage } from "@/lib/dm";
import { MAX_DM_LENGTH, dmBodyError } from "@/lib/feed-rules";
import { isFeatureOn } from "@/lib/features";
import { useSiteConfig } from "@/lib/use-site-config";
import { fetchWorkConversations, otherPartyName, useWorkChatUnread } from "@/lib/use-work-unread";
import { workRpc } from "@/lib/work-db";
import { AvatarMini } from "@/components/avatar-mini";
import { ApplicationThread } from "@/components/application-thread";
import { OrderChat } from "@/components/order-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type View = { kind: "inbox" } | { kind: "order" } | { kind: "work" } | { kind: "dm"; id: string } | { kind: "workthread"; id: string };

// Halaman yang sudah punya layar chat sendiri atau bukan tempat chat.
const HIDDEN = ["/admin", "/auth", "/reset-password", "/discuss/pesan"];
const ORDER_PATH = /^\/pesanan\/([^/]+)\/?$/;
const WORK_PATH = /^\/(lowongan|kerja)(\/|$)/;

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] leading-4 text-primary-foreground">{n > 99 ? "99+" : n}</span>;
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
    >
      {children}
    </button>
  );
}

/**
 * Tombol chat bulat mengambang. Semua obrolan ada di sini, dipisah tab:
 *  - "Pesan": pesan langsung antar pengguna;
 *  - "GOBI Work": obrolan lamaran/lowongan (client dan pelamar);
 *  - "Pesanan ini": chat pesanan, hanya di halaman /pesanan/:id.
 * Di halaman Lowongan dan GOBI WORK, panel langsung membuka tab GOBI Work.
 */
export function ChatDock() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const { flags } = useSiteConfig();
  const dmOn = isFeatureOn(flags, "discuss");
  const jobsOn = isFeatureOn(flags, "jobs");
  const orderId = ORDER_PATH.exec(pathname)?.[1] ?? null;
  const onWorkPage = WORK_PATH.test(pathname);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "inbox" });

  // Kunci kuerinya sama dengan menu kiri beranda, jadi cache dipakai bersama.
  const unread = useQuery({
    queryKey: ["dm-unread", user?.id ?? null],
    queryFn: () => fetchDmUnread(user?.id),
    enabled: !!user && dmOn,
    refetchInterval: 60_000,
  });
  const workUnread = useWorkChatUnread(jobsOn);

  const fallback: View = orderId ? { kind: "order" } : onWorkPage && jobsOn ? { kind: "work" } : dmOn ? { kind: "inbox" } : { kind: "work" };
  const valid = (v: View) => (v.kind === "order" ? !!orderId : v.kind === "work" || v.kind === "workthread" ? jobsOn : dmOn);
  const current = valid(view) ? view : fallback;

  // Panel ditutup saat pindah halaman supaya tidak menutupi halaman baru.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<ChatDockRequest>).detail ?? {};
      if (d.applicationId && jobsOn) setView({ kind: "workthread", id: d.applicationId });
      else if (d.conversationId && dmOn) setView({ kind: "dm", id: d.conversationId });
      else if (d.view === "work" && jobsOn) setView({ kind: "work" });
      else if (d.view === "inbox" && dmOn) setView({ kind: "inbox" });
      else setView(orderId ? { kind: "order" } : onWorkPage && jobsOn ? { kind: "work" } : dmOn ? { kind: "inbox" } : { kind: "work" });
      setOpen(true);
    };
    window.addEventListener(CHAT_DOCK_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_DOCK_EVENT, onOpen);
  }, [orderId, dmOn, jobsOn, onWorkPage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hidden = HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!user || !profile || hidden || (!dmOn && !jobsOn && !orderId)) return null;

  const dmBadge = dmOn ? (unread.data ?? 0) : 0;
  const workBadge = jobsOn ? (workUnread.data ?? 0) : 0;
  const badge = dmBadge + workBadge;
  const toggle = () => {
    if (!open) setView(fallback);
    setOpen((o) => !o);
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat"
          className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-50 flex h-[min(32rem,calc(100dvh-12rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:inset-x-auto lg:bottom-24 lg:right-6 lg:h-[min(34rem,calc(100dvh-8rem))] lg:w-96"
        >
          {current.kind === "dm" ? (
            <DmThread id={current.id} userId={user.id} onBack={() => setView({ kind: "inbox" })} onClose={() => setOpen(false)} />
          ) : current.kind === "workthread" ? (
            <WorkThread id={current.id} userId={user.id} onBack={() => setView({ kind: "work" })} onClose={() => setOpen(false)} />
          ) : (
            <>
              <header className="flex items-center gap-1 border-b border-border p-2">
                <div role="tablist" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {dmOn && <TabBtn active={current.kind === "inbox"} onClick={() => setView({ kind: "inbox" })}>Pesan <Badge n={dmBadge} /></TabBtn>}
                  {jobsOn && <TabBtn active={current.kind === "work"} onClick={() => setView({ kind: "work" })}>GOBI Work <Badge n={workBadge} /></TabBtn>}
                  {orderId && <TabBtn active={current.kind === "order"} onClick={() => setView({ kind: "order" })}>Pesanan ini</TabBtn>}
                </div>
                <button type="button" aria-label="Tutup chat" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
              </header>
              <div className="min-h-0 flex-1">
                {current.kind === "order" && orderId
                  ? <OrderChat orderId={orderId} userId={user.id} />
                  : current.kind === "work"
                    ? <WorkInbox userId={user.id} onOpen={(id) => setView({ kind: "workthread", id })} onNavigate={() => setOpen(false)} />
                    : <Inbox userId={user.id} onOpen={(id) => setView({ kind: "dm", id })} onNavigate={() => setOpen(false)} />}
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "Tutup chat" : "Buka chat"}
        aria-expanded={open}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && badge > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-background bg-destructive px-1 text-center font-mono text-[10px] leading-4 text-white">{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    </>
  );
}

function Inbox({ userId, onOpen, onNavigate }: { userId: string; onOpen: (id: string) => void; onNavigate: () => void }) {
  const q = useQuery({ queryKey: ["dm-inbox", userId], queryFn: fetchInbox, refetchInterval: 15_000 });
  if (q.isLoading) return <p className="p-6 text-center text-sm text-muted-foreground">Memuat…</p>;
  if (q.isError) return <p role="alert" className="p-6 text-center text-sm text-destructive">{(q.error as Error).message}</p>;
  const list = q.data ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      {list.length === 0 ? (
        <p className="flex-1 p-6 text-center text-sm text-muted-foreground">Belum ada percakapan. Buka profil atau halaman jasa seseorang, lalu tekan tombol chat.</p>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {list.map((c) => (
            <li key={c.conversation_id}>
              <button type="button" onClick={() => onOpen(c.conversation_id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40">
                <AvatarMini name={c.username} url={c.avatar_url} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread ? "font-bold" : "font-medium")}>{c.display_name || c.username}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last_at)}</span>
                  </span>
                  <span className={cn("block truncate text-xs", c.unread ? "text-foreground" : "text-muted-foreground")}>{c.last_body}</span>
                </span>
                {c.unread > 0 && <Badge n={c.unread} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/discuss/pesan" search={{}} onClick={onNavigate} className="border-t border-border px-4 py-2.5 text-center text-xs font-medium text-link hover:bg-accent/40">Buka halaman pesan</Link>
    </div>
  );
}

/** Tab GOBI Work: daftar obrolan lamaran. Pemilik lowongan melihat pelamar, pelamar melihat lowongan yang dilamar. */
function WorkInbox({ userId, onOpen, onNavigate }: { userId: string; onOpen: (id: string) => void; onNavigate: () => void }) {
  const q = useQuery({ queryKey: ["work-convs", userId], queryFn: () => fetchWorkConversations(userId), refetchInterval: 15_000 });
  if (q.isLoading) return <p className="p-6 text-center text-sm text-muted-foreground">Memuat…</p>;
  if (q.isError) return <p role="alert" className="p-6 text-center text-sm text-destructive">{(q.error as Error).message}</p>;
  const rows = q.data?.rows ?? [];
  const unread = q.data?.unread ?? {};
  return (
    <div className="flex h-full min-h-0 flex-col">
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Briefcase className="size-8 text-primary" />
          <p>Belum ada obrolan kerja. Obrolan terbuka otomatis setelah ada lamaran pada sebuah lowongan.</p>
          <Link to="/lowongan" onClick={onNavigate} className="font-semibold text-primary hover:underline">Cari lowongan</Link>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((r) => {
            const n = unread[r.id] ?? 0;
            const other = otherPartyName(r, userId);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Briefcase className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", n ? "font-bold" : "font-medium")}>{r.job?.title ?? "Lowongan"}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(r.created_at)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{r.developer_id === userId ? "Kamu melamar · " : "Pelamar · "}{other}</span>
                  </span>
                  {n > 0 && <Badge n={n} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/kerja/lamaran" onClick={onNavigate} className="border-t border-border px-4 py-2.5 text-center text-xs font-medium text-link hover:bg-accent/40">Kelola lamaran dan lowongan</Link>
    </div>
  );
}

function WorkThread({ id, userId, onBack, onClose }: { id: string; userId: string; onBack: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const convs = useQuery({ queryKey: ["work-convs", userId], queryFn: () => fetchWorkConversations(userId) });
  const conv = convs.data?.rows.find((r) => r.id === id);
  const markRead = () => {
    workRpc("work_mark_thread_read", { _application_id: id })
      .then(() => Promise.all(["work-chat-unread", "work-convs", "work-notifs", "work-unread-notifs"].map((k) => qc.invalidateQueries({ queryKey: [k] }))))
      .catch(() => {});
  };
  return (
    <>
      <header className="flex items-center gap-2 border-b border-border p-2">
        <button type="button" aria-label="Kembali ke daftar obrolan kerja" onClick={onBack} className="rounded-full p-2 text-muted-foreground hover:bg-accent"><ArrowLeft className="size-4" /></button>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Briefcase className="size-4" /></span>
        <div className="min-w-0 flex-1">
          {conv?.job ? (
            <Link to="/lowongan/$id" params={{ id: conv.job.id }} onClick={onClose} className="block truncate text-sm font-semibold leading-tight hover:text-primary">{conv.job.title}</Link>
          ) : (
            <p className="truncate text-sm font-semibold leading-tight">{convs.isLoading ? "Memuat…" : "Obrolan kerja"}</p>
          )}
          {conv && <p className="truncate text-[11px] text-muted-foreground">{conv.developer_id === userId ? "Kamu melamar · " : "Pelamar · "}{otherPartyName(conv, userId)}</p>}
        </div>
        <button type="button" aria-label="Tutup chat" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
      </header>
      <div className="min-h-0 flex-1"><ApplicationThread applicationId={id} fill onRead={markRead} /></div>
    </>
  );
}

function DmThread({ id, userId, onBack, onClose }: { id: string; userId: string; onBack: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const partner = useQuery({ queryKey: ["dm-partner", id], queryFn: () => fetchPartner(id, userId) });
  const messages = useQuery({ queryKey: ["dm-messages", id], queryFn: () => fetchMessages(id), refetchInterval: 8_000 });

  const lastId = messages.data?.[messages.data.length - 1]?.id;
  useEffect(() => {
    if (!lastId) return;
    markConversationRead(userId, id)
      .then(() => Promise.all([qc.invalidateQueries({ queryKey: ["dm-unread"] }), qc.invalidateQueries({ queryKey: ["dm-inbox"] })]))
      .catch(() => {});
  }, [userId, id, lastId, qc]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId]);

  const send = useMutation({
    mutationFn: () => sendMessage(userId, id, body),
    onSuccess: async () => { setBody(""); await qc.invalidateQueries({ queryKey: ["dm-messages", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const err = dmBodyError(body);
  const submit = () => { if (!err && !send.isPending) send.mutate(); };
  const p = partner.data;
  const failed = messages.error ?? partner.error;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border p-2">
        <button type="button" aria-label="Kembali ke daftar pesan" onClick={onBack} className="rounded-full p-2 text-muted-foreground hover:bg-accent"><ArrowLeft className="size-4" /></button>
        {p ? (
          <Link to="/$username" params={{ username: p.username }} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2">
            <AvatarMini name={p.username} url={p.avatar_url} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{p.display_name || p.username}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">@{p.username}</span>
            </span>
          </Link>
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">{partner.isLoading ? "Memuat…" : "Percakapan"}</p>
        )}
        <button type="button" aria-label="Tutup chat" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {failed ? (
          <p role="alert" className="text-center text-sm text-destructive">{failed.message}</p>
        ) : messages.isLoading ? (
          <p className="text-center text-sm text-muted-foreground">Memuat…</p>
        ) : !messages.data?.length ? (
          <p className="text-center text-sm text-muted-foreground">Belum ada pesan. Mulai percakapan di bawah.</p>
        ) : (
          messages.data.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{timeAgo(m.created_at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-border p-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          rows={1}
          maxLength={MAX_DM_LENGTH}
          placeholder="Tulis pesan…"
          aria-label="Isi pesan"
          className="min-h-9 resize-none"
        />
        <Button type="submit" size="icon" disabled={!!err || send.isPending} aria-label="Kirim pesan"><Send /></Button>
      </form>
    </>
  );
}
