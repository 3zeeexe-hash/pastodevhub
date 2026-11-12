import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";
import { z } from "zod";
import { timeAgo, useAuth } from "@/lib/auth";
import { DM_NOT_READY, fetchInbox, startConversation } from "@/lib/dm";
import { AvatarMini } from "@/components/avatar-mini";
import { SignInCta } from "@/components/sign-in-cta";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ u: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/discuss/pesan")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Pesan — Pastodev" }, { name: "robots", content: "noindex" }] }),
  component: PesanLayout,
});

/**
 * /discuss/pesan/$id (layar percakapan) adalah anak rute ini. Tanpa <Outlet /> layar percakapan tidak pernah
 * tampil: tombol "Kirim pesan" di profil hanya membawa pengguna ke kotak masuk yang kosong.
 */
function PesanLayout() {
  const { pathname } = useLocation();
  return /^\/discuss\/pesan\/[^/]+/.test(pathname) ? <Outlet /> : <InboxPage />;
}

function InboxPage() {
  const { user, loading } = useAuth();
  const { u } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef<string | null>(null);

  // /discuss/pesan?u=nama membuka (atau membuat) percakapan lalu pindah ke sana.
  useEffect(() => {
    if (!user || !u || started.current === u) return;
    started.current = u;
    startConversation(u)
      .then((id) => navigate({ to: "/discuss/pesan/$id", params: { id }, replace: true }))
      .catch((e: Error) => {
        toast.error(e.message);
        navigate({ to: "/discuss/pesan", search: {}, replace: true });
      });
  }, [user, u, navigate]);

  const inbox = useQuery({
    queryKey: ["dm-inbox", user?.id ?? null],
    queryFn: fetchInbox,
    enabled: !!user && !u,
    refetchInterval: 30_000,
  });
  useEffect(() => { if (inbox.data) void qc.invalidateQueries({ queryKey: ["dm-unread"] }); }, [inbox.data, qc]);

  if (loading) return <main className="mx-auto max-w-2xl px-4 py-12 text-muted-foreground">Memuat…</main>;
  if (!user) return <main className="mx-auto max-w-2xl px-4 py-8"><SignInCta text="Masuk untuk membaca pesanmu." /></main>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2">
        <Link to="/discuss" aria-label="Kembali ke Diskusi" className="rounded-md p-2 text-muted-foreground hover:bg-accent"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-2xl font-bold">Pesan</h1>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Pesan tersimpan sebagai teks biasa dan tidak dienkripsi ujung-ke-ujung. Jangan kirim kata sandi atau token.</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        {u || inbox.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{u ? "Membuka percakapan…" : "Memuat…"}</p>
        ) : inbox.error ? (
          <p role="alert" className="p-6 text-center text-sm text-destructive">
            {inbox.error.message === DM_NOT_READY ? DM_NOT_READY : `Gagal memuat pesan: ${inbox.error.message}`}
          </p>
        ) : !inbox.data?.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Mail className="mx-auto mb-2 size-8" aria-hidden />
            Belum ada percakapan. Buka profil seseorang lalu pilih “Kirim pesan”.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {inbox.data.map((c) => (
              <li key={c.conversation_id}>
                <Link to="/discuss/pesan/$id" params={{ id: c.conversation_id }} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40">
                  <AvatarMini name={c.username} url={c.avatar_url} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cn("truncate", c.unread > 0 ? "font-bold" : "font-semibold")}>{c.display_name || c.username}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">@{c.username}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{timeAgo(c.last_at)}</span>
                    </div>
                    <p className={cn("truncate text-sm", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {c.last_sender === user.id ? "Kamu: " : ""}{c.last_body}
                    </p>
                  </div>
                  {c.unread > 0 && <span className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center font-mono text-xs leading-5 text-primary-foreground">{c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
