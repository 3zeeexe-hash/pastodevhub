// Peninjauan admin dan kuota posisi lowongan. Aturannya sama dengan docs/sql/gobi-work/005_lowongan_tinjau_dan_kuota.sql;
// database tetap penentu akhir.

export type ModerationStatus = "pending" | "approved" | "rejected";

export const MODERATION_LABEL: Record<ModerationStatus, string> = {
  pending: "Menunggu peninjauan",
  approved: "Disetujui",
  rejected: "Ditolak admin",
};

/** Lowongan lama atau database tanpa kolom peninjauan dianggap sudah disetujui. */
export function normalizeModeration(v: unknown): ModerationStatus {
  return v === "pending" || v === "rejected" ? v : "approved";
}

/** Jumlah posisi yang masih bisa diisi; tidak pernah negatif dan minimal 1 posisi bila data kosong. */
export function slotsLeft(positions: number | null | undefined, accepted: number) {
  const total = Math.max(1, Math.floor(positions ?? 1));
  return Math.max(0, total - Math.max(0, Math.floor(accepted)));
}

export type RespondSummary = { accepted: number; positions: number; filled: boolean };

/** Pesan setelah client menerima pelamar, sesuai sisa posisi. */
export function acceptedMessage(left: number) {
  return left > 0
    ? `Developer diterima. Lowongan tetap dibuka, sisa ${left} posisi.`
    : "Developer diterima. Semua posisi sudah terisi, lowongan ditutup untuk lamaran baru.";
}
