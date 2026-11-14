// Aturan kerja sebuah lowongan: kerja langsung atau per jam, tanggal selesai dari client, dan batas revisi.
// Diambil terpisah dari data lowongan utama supaya halaman tetap jalan sebelum docs/sql/gobi-work/006 dijalankan.
import { useQuery } from "@tanstack/react-query";
import { looseDb } from "@/lib/escrow-db";
import { formatRupiah } from "@/lib/market";

export type JobTerms = {
  paymentType: "fixed" | "hourly";
  /** Tanggal selesai dari client ("YYYY-MM-DD"), atau null jika fleksibel. */
  deadline: string | null;
  /** Batas jumlah revisi; null = tanpa batas. */
  revisionLimit: number | null;
};

export const DEFAULT_TERMS: JobTerms = { paymentType: "fixed", deadline: null, revisionLimit: null };

type Raw = { payment_type?: string | null; deadline?: string | null; revision_limit?: number | null };

export function normalizeTerms(r: Raw | null | undefined): JobTerms {
  if (!r) return DEFAULT_TERMS;
  return {
    paymentType: r.payment_type === "hourly" ? "hourly" : "fixed",
    deadline: r.deadline ? String(r.deadline).slice(0, 10) : null,
    revisionLimit: typeof r.revision_limit === "number" && r.revision_limit > 0 ? r.revision_limit : null,
  };
}

export function useJobTerms(jobId: string) {
  return useQuery({
    queryKey: ["job-terms", jobId],
    queryFn: async (): Promise<JobTerms> => {
      let res = await looseDb.from("jobs").select("payment_type,deadline,revision_limit").eq("id", jobId).maybeSingle();
      if (res.error) res = await looseDb.from("jobs").select("payment_type,deadline").eq("id", jobId).maybeSingle();
      if (res.error) return DEFAULT_TERMS;
      return normalizeTerms(res.data as Raw | null);
    },
  });
}

/** True bila galat dari RPC berarti fungsinya belum ada di database (SQL belum dijalankan). */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined) {
  return !!error && (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? ""));
}

/** True bila galat berarti kolom belum ada (SQL belum dijalankan). */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(error.message ?? ""));
}

/** Teks penawaran untuk kartu pelamar: "Rp1.500.000" atau "Nego" bila belum diisi. */
export const bidText = (n: number) => (n > 0 ? formatRupiah(n) : "Nego");
