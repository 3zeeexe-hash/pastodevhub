// Hak penggunaan hasil pekerjaan dan ketentuan pembatalan: dua isian wajib saat client memasang lowongan.
// Aturan yang sama dipaksa database lewat docs/sql/gobi-work/008 (trigger pada tabel jobs).

export const LEGAL_TERMS_MIN = 20;
export const LEGAL_TERMS_MAX = 2000;

export type LegalTermsInput = { usageRights: string; cancellationTerms: string };

function check(text: string, label: string): string | undefined {
  const n = text.trim().length;
  if (n === 0) return `${label} wajib diisi.`;
  if (n < LEGAL_TERMS_MIN) return `${label} minimal ${LEGAL_TERMS_MIN} karakter, jelaskan dengan cukup rinci.`;
  if (n > LEGAL_TERMS_MAX) return `${label} maksimal ${LEGAL_TERMS_MAX} karakter.`;
  return undefined;
}

/** Pesan kesalahan per field (usageRights, cancellationTerms); objek kosong berarti valid. */
export function validateLegalTerms(i: LegalTermsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const usage = check(i.usageRights, "Hak penggunaan hasil pekerjaan");
  if (usage) e.usageRights = usage;
  const cancel = check(i.cancellationTerms, "Ketentuan pembatalan");
  if (cancel) e.cancellationTerms = cancel;
  return e;
}
