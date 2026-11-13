// GOBI WORK Fase 6: aturan murni untuk pengaturan komisi (cermin dari 004_gobi_work_settings.sql).

export const MAX_COMMISSION_PERCENT = 30;

/** Membaca isian persen dari admin: angka 0–30, maksimal 2 desimal, koma atau titik. null jika tidak valid. */
export function parseCommissionInput(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= MAX_COMMISSION_PERCENT ? n : null;
}

/** Komisi dalam rupiah, dibulatkan seperti round() di database. */
export function commissionFor(amount: number, percent: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(percent) || amount <= 0 || percent < 0) return 0;
  return Math.round((amount * percent) / 100);
}
