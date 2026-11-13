import { useQuery } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { JOB_EXTRA_SELECT, experienceLabel, jobTypeLabel, paymentTypeLabel, workModeLabel, type JobExtra } from "@/lib/jobs";
import { Markdown } from "@/components/markdown";

/** Detail lowongan GOBI WORK (jenis, metode kerja, lokasi, pengalaman, sistem bayar, persyaratan). Kosong jika SQL belum dijalankan. */
export function JobExtras({ jobId }: { jobId: string }) {
  const q = useQuery({
    queryKey: ["job-extras", jobId],
    queryFn: async () => {
      const { data, error } = await looseDb.from("jobs").select(JOB_EXTRA_SELECT).eq("id", jobId).maybeSingle();
      if (error) return null;
      return (data as JobExtra | null) ?? null;
    },
  });
  const x = q.data;
  if (!x) return null;
  const facts: [string, string][] = [
    ["Jenis pekerjaan", jobTypeLabel(x.job_type)],
    ["Metode kerja", workModeLabel(x.work_mode)],
    ["Lokasi", x.location || (x.work_mode === "remote" ? "Remote" : "—")],
    ["Pengalaman", experienceLabel(x.experience_level) || "Semua level"],
    ["Pembayaran", paymentTypeLabel(x.payment_type)],
    ["Kebutuhan", `${x.positions} freelancer`],
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 font-semibold">Rincian pekerjaan</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-secondary/60 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold">{v}</dd></div>
        ))}
      </dl>
      {x.requirements?.trim() && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Persyaratan tambahan</h3>
          <Markdown>{x.requirements}</Markdown>
        </div>
      )}
    </section>
  );
}
