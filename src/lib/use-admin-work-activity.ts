// GOBI WORK admin: satu sumber untuk (1) pekerjaan yang menunggu admin dan (2) data baru sejak terakhir dilihat.
// Dipakai sidebar admin, notifikasi toast, dan halaman /admin/kerja, dengan kunci kueri yang sama sehingga hanya satu permintaan.
import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { WORK_SEEN_KEY, readSeen, sumCounts, type WorkFresh, type WorkPending } from "@/lib/admin-work-activity";

const SEEN_EVENT = "gobi-admin-kerja-seen";

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === WORK_SEEN_KEY) cb(); };
  window.addEventListener(SEEN_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(SEEN_EVENT, cb); window.removeEventListener("storage", onStorage); };
}

/** Waktu (ms) terakhir admin menandai pembaruan GOBI WORK sudah dilihat. Server memakai 0 supaya tidak beda saat hidrasi. */
export function useWorkSeen(): number {
  return useSyncExternalStore(subscribe, () => readSeen(storage()), () => 0);
}

/** Menandai semua pembaruan GOBI WORK sudah dilihat (lencana "baru" di sidebar hilang). */
export function markWorkSeen() {
  try { storage()?.setItem(WORK_SEEN_KEY, String(Date.now())); } catch { /* penyimpanan tidak tersedia */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SEEN_EVENT));
}

async function head(table: string, apply?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = looseDb.from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export type WorkActivity = { pending: WorkPending; fresh: WorkFresh; totalPending: number; totalFresh: number };

const REFRESH_MS = 30_000;

export function useAdminWorkActivity(enabled = true) {
  const seen = useWorkSeen();
  return useQuery({
    queryKey: ["admin-work-activity", seen],
    enabled: enabled && seen > 0, // seen = 0 hanya terjadi di server / saat hidrasi
    staleTime: 15_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<WorkActivity> => {
      const since = new Date(seen).toISOString();
      const [reports, disputes, jobs, withdrawals, nApps, nContracts, nReports, nDisputes, nJobs, nWithdrawals] = await Promise.all([
        head("work_reports", (q) => q.in("status", ["open", "reviewing"])),
        head("work_disputes", (q) => q.in("status", ["open", "under_review"])),
        head("jobs", (q) => q.eq("moderation_status", "pending")),
        head("client_withdrawals", (q) => q.eq("status", "requested")),
        head("job_applications", (q) => q.gt("created_at", since)),
        head("work_contracts", (q) => q.gt("created_at", since)),
        head("work_reports", (q) => q.gt("created_at", since)),
        head("work_disputes", (q) => q.gt("created_at", since)),
        head("jobs", (q) => q.gt("created_at", since)),
        head("client_withdrawals", (q) => q.gt("created_at", since)),
      ]);
      const pending: WorkPending = { reports, disputes, jobs, withdrawals };
      const fresh: WorkFresh = { applications: nApps, contracts: nContracts, reports: nReports, disputes: nDisputes, jobs: nJobs, withdrawals: nWithdrawals };
      return { pending, fresh, totalPending: sumCounts(pending), totalFresh: sumCounts(fresh) };
    },
  });
}

/** Segarkan data aktivitas dan ringkasan sekarang juga (tombol "Muat ulang"). */
export function useRefreshWorkAdmin() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["admin-work-activity"] }),
    qc.invalidateQueries({ queryKey: ["admin-badges"] }),
    qc.invalidateQueries({ queryKey: ["work-admin-stats"] }),
    qc.invalidateQueries({ queryKey: ["work-admin-analytics"] }),
    qc.invalidateQueries({ queryKey: ["work-admin-extra"] }),
  ]);
}

/** Menandai sudah dilihat saat admin meninggalkan halaman, bukan saat masuk, supaya kartu "baru" masih terbaca selama di halaman. */
export function useMarkSeenOnLeave() {
  useEffect(() => () => markWorkSeen(), []);
}
