// Kelengkapan kontrak sebelum dikirim ke freelancer. Cermin dari public._work_contract_missing di
// docs/sql/gobi-work/009_siapkan_kontrak_setelah_terima.sql; database tetap penentu akhir.
import { todayWIB } from "@/lib/work-deadline";

export const CONTRACT_MIN = { scope: 20, revision: 10, usage: 20, cancellation: 20, payment: 10 } as const;
export const CONTRACT_TEXT_MAX = 4000;

export type ContractTermsView = {
  scope: string | null; revision_terms: string | null; usage_rights: string | null; cancellation_terms: string | null; payment_terms: string | null;
  deadline: string | null; payment_type: string; schedule_mode?: boolean | null;
};

const short = (t: string | null | undefined, min: number) => (t ?? "").trim().length < min;

/** Daftar bagian kontrak yang belum lengkap; kosong berarti kontrak boleh dikirim (dari sisi ketentuan). */
export function contractMissing(c: ContractTermsView, today: string = todayWIB()): string[] {
  const m: string[] = [];
  if (short(c.scope, CONTRACT_MIN.scope)) m.push(`ruang lingkup pekerjaan (minimal ${CONTRACT_MIN.scope} karakter)`);
  if (short(c.revision_terms, CONTRACT_MIN.revision)) m.push(`ketentuan revisi (minimal ${CONTRACT_MIN.revision} karakter)`);
  if (short(c.usage_rights, CONTRACT_MIN.usage)) m.push(`hak penggunaan hasil pekerjaan (minimal ${CONTRACT_MIN.usage} karakter)`);
  if (short(c.cancellation_terms, CONTRACT_MIN.cancellation)) m.push(`ketentuan pembatalan (minimal ${CONTRACT_MIN.cancellation} karakter)`);
  if (short(c.payment_terms, CONTRACT_MIN.payment)) m.push(`ketentuan pembayaran (minimal ${CONTRACT_MIN.payment} karakter)`);
  if (c.payment_type === "fixed" && !c.schedule_mode) {
    const d = c.deadline ? c.deadline.slice(0, 10) : null;
    if (!d) m.push("tanggal selesai");
    else if (d < today) m.push("tanggal selesai (sudah lewat)");
  }
  return m;
}
