import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { ApplicationThread } from "@/components/application-thread";
import { ReportButton, EmptyState, ErrorState } from "@/components/work-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kerja/pesan")({
  validateSearch: (s: Record<string, unknown>) => ({ application: typeof s.application === "string" ? s.application : undefined }),
  component: WorkMessages,
});

type Conv = {
  id: string; status: string; developer_id: string; created_at: string;
  job: { id: string; title: string; client_id: string } | null;
  developer: { username: string; display_name: string | null } | null;
};
const SELECT = "id,status,developer_id,created_at,job:jobs!inner(id,title,client_id), developer:profiles!job_applications_developer_id_fkey(username,display_name)";

function WorkMessages() {
  const { application } = Route.useSearch();
  const { user } = useAuth();
  const uid = user!.id;

  const list = useQuery({
    queryKey: ["work-convs", uid],
    queryFn: async () => {
      const [asDev, asClient] = await Promise.all([
        looseDb.from("job_applications").select(SELECT).eq("developer_id", uid).neq("status", "withdrawn"),
        looseDb.from("job_applications").select(SELECT).eq("job.client_id", uid).neq("status", "withdrawn"),
      ]);
      if (asDev.error) throw new Error(errMsg(asDev.error));
      if (asClient.error) throw new Error(errMsg(asClient.error));
      const map = new Map<string, Conv>();
      for (const r of [...(asDev.data ?? []), ...(asClient.data ?? [])] as unknown as Conv[]) map.set(r.id, r);
      const unread: Record<string, number> = {};
      // read_at ada setelah SQL 002; jika belum, penanda belum dibaca tidak ditampilkan.
      const u = await looseDb.from("job_messages").select("application_id").is("read_at", null).neq("sender_id", uid);
      if (!u.error) for (const r of (u.data ?? []) as { application_id: string }[]) unread[r.application_id] = (unread[r.application_id] ?? 0) + 1;
      return { rows: [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)), unread };
    },
  });

  // Menandai pesan lawan bicara sebagai dibaca saat percakapan dibuka (hanya kedua pihak yang diizinkan database).
  useEffect(() => {
    if (application) looseDb.rpc("work_mark_thread_read", { _application_id: application }).then(() => undefined, () => undefined);
  }, [application]);

  const selected = list.data?.rows.find((r) => r.id === application) ?? null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pesan kerja</h1>
      {list.isLoading && <Skeleton className="h-40 rounded-xl" />}
      {list.error && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.rows.length === 0 && <EmptyState>Belum ada percakapan. Obrolan muncul setelah ada lamaran pada lowongan.</EmptyState>}
      {list.data && list.data.rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
          <ul className={cn("space-y-2", selected && "hidden md:block")}>
            {list.data.rows.map((r) => {
              const other = r.developer_id === uid ? "Client" : r.developer?.display_name || r.developer?.username || "Pelamar";
              const n = list.data.unread[r.id] ?? 0;
              return (
                <li key={r.id}>
                  <Link to="/kerja/pesan" search={{ application: r.id }} className={cn("block rounded-xl border bg-card p-3 text-sm transition-colors hover:border-primary/50", r.id === application ? "border-primary" : "border-border")}>
                    <p className="flex items-center justify-between gap-2 font-semibold"><span className="truncate">{r.job?.title ?? "Lowongan"}</span>{n > 0 && <span className="rounded-full bg-red-500 px-1.5 text-xs text-white" aria-label={`${n} pesan belum dibaca`}>{n}</span>}</p>
                    <p className="truncate text-xs text-muted-foreground">{other} · {timeAgo(r.created_at)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <section className={cn("min-w-0", !selected && "hidden md:block")}>
            {selected ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to="/kerja/pesan" search={{ application: undefined }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"><ArrowLeft className="size-4" /> Semua percakapan</Link>
                  {selected.job && <Link to="/lowongan/$id" params={{ id: selected.job.id }} className="text-sm font-semibold hover:text-primary">{selected.job.title}</Link>}
                  <ReportButton targetType="conversation" targetId={selected.id} label="Laporkan percakapan" />
                </div>
                <ApplicationThread applicationId={selected.id} />
              </div>
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground"><MessageSquare className="mr-2 size-4" /> Pilih percakapan.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
