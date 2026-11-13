import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { looseDb } from "@/lib/escrow-db";
import { useAuth, timeAgo } from "@/lib/auth";
import { errMsg } from "@/lib/market";
import { CONTRACT_SELECT, fmtDate, personName, rp, type ContractRow } from "@/lib/work-db";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContractPill, EmptyState, ErrorState } from "@/components/work-ui";

export const Route = createFileRoute("/kerja/kontrak/")({ component: ContractList });

type Filter = "all" | "active" | "waiting" | "done";
const FILTER: Record<Filter, (s: ContractRow["status"]) => boolean> = {
  all: () => true,
  active: (s) => s === "active" || s === "disputed",
  waiting: (s) => s === "draft" || s === "waiting_approval",
  done: (s) => s === "completed" || s === "cancelled",
};

function ContractList() {
  const { user } = useAuth();
  const uid = user!.id;
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["work-contracts", uid],
    queryFn: async () => {
      const { data, error } = await looseDb.from("work_contracts").select(CONTRACT_SELECT).or(`client_id.eq.${uid},freelancer_id.eq.${uid}`).order("updated_at", { ascending: false }).limit(100);
      if (error) throw new Error(errMsg(error));
      return (data ?? []) as ContractRow[];
    },
  });
  const rows = (q.data ?? []).filter((c) => FILTER[filter](c.status));
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Proyek &amp; kontrak</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kontrak dibuat client dari lamaran yang diterima. Kontrak baru aktif setelah kedua pihak menyetujui.</p>
      </header>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">Semua</TabsTrigger>
          <TabsTrigger value="active">Proyek aktif</TabsTrigger>
          <TabsTrigger value="waiting">Menunggu</TabsTrigger>
          <TabsTrigger value="done">Selesai</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isLoading && <Skeleton className="h-28 rounded-xl" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState>Belum ada kontrak di kategori ini. Terima pelamar dari halaman lowongan lalu pilih "Buat kontrak GOBI WORK".</EmptyState>}
      <ul className="space-y-3">
        {rows.map((c) => {
          const mine = c.client_id === uid ? "client" : "freelancer";
          const other = mine === "client" ? c.freelancer : c.client;
          return (
            <li key={c.id}>
              <Link to="/kerja/kontrak/$id" params={{ id: c.id }} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{c.title}</p>
                  <ContractPill status={c.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kamu sebagai {mine} · {mine === "client" ? "freelancer" : "client"}: {personName(other)} · {c.payment_type === "fixed" ? rp(c.total_amount) : `${rp(c.hourly_rate)}/jam`}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Tenggat {fmtDate(c.deadline)} · diperbarui {timeAgo(c.updated_at)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
