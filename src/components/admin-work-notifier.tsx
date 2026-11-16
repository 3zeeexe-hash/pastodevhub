import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { increases, type WorkFresh, type WorkPending } from "@/lib/admin-work-activity";
import { useAdminWorkActivity } from "@/lib/use-admin-work-activity";

const PENDING_TEXT: Record<keyof WorkPending, { one: string; tab: "laporan" | "sengketa" | "lowongan" | "pencairan" }> = {
  reports: { one: "laporan pekerjaan baru", tab: "laporan" },
  disputes: { one: "sengketa baru", tab: "sengketa" },
  jobs: { one: "lowongan menunggu moderasi", tab: "lowongan" },
  withdrawals: { one: "permintaan pencairan client", tab: "pencairan" },
};
const FRESH_TEXT: Partial<Record<keyof WorkFresh, { one: string; tab: "lamaran" | "kasus" }>> = {
  applications: { one: "lamaran baru", tab: "lamaran" },
  contracts: { one: "kontrak baru", tab: "kasus" },
};

/**
 * Dipasang sekali di kerangka /admin. Setiap kali data diperbarui (otomatis tiap 30 detik) dan ada yang bertambah,
 * munculkan toast dengan tombol "Buka" ke tab yang tepat. Poll pertama hanya menjadi acuan, tidak memunculkan toast.
 */
export function AdminWorkNotifier() {
  const navigate = useNavigate();
  const { data } = useAdminWorkActivity();
  const prev = useRef<{ pending: WorkPending; fresh: WorkFresh } | null>(null);

  useEffect(() => {
    if (!data) return;
    const before = prev.current;
    prev.current = { pending: data.pending, fresh: data.fresh };
    if (!before) return;

    const lines: { text: string; tab: string }[] = [];
    for (const { key, by } of increases(before.pending as unknown as Record<string, number>, data.pending as unknown as Record<string, number>)) {
      const m = PENDING_TEXT[key as keyof WorkPending];
      if (m) lines.push({ text: `${by} ${m.one}`, tab: m.tab });
    }
    for (const { key, by } of increases(before.fresh as unknown as Record<string, number>, data.fresh as unknown as Record<string, number>)) {
      const m = FRESH_TEXT[key as keyof WorkFresh];
      if (m) lines.push({ text: `${by} ${m.one}`, tab: m.tab });
    }
    if (lines.length === 0) return;
    toast.info("Pembaruan GOBI WORK", {
      description: lines.map((l) => l.text).join(" · "),
      action: { label: "Buka", onClick: () => void navigate({ to: "/admin/kerja", search: { tab: (lines[0]?.tab ?? "ringkasan") as never } }) },
      duration: 10_000,
    });
  }, [data, navigate]);

  return null;
}
