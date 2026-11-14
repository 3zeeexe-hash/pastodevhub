// Aturan murni untuk tenggat, batas revisi, pelepasan dana otomatis, dan jam kerja.
// Cermin dari docs/sql/gobi-work/006_kerja_langsung_tenggat_revisi.sql — database tetap penentu akhir.
// Zona waktu aturan: Asia/Jakarta (WIB, UTC+7, tanpa DST).

const WIB_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Tanggal hari ini di WIB sebagai "YYYY-MM-DD". */
export function todayWIB(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Menambah hari pada tanggal "YYYY-MM-DD". */
export function addDaysISO(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isISODate = (s: string) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

/**
 * Batas client menanggapi hasil kerja: akhir hari (WIB) sehari setelah tenggat,
 * dan tidak kurang dari 24 jam sejak hasil terakhir dikirim (agar pengiriman telat tetap diberi waktu memeriksa).
 */
export function autoReleaseAt(deadline: string, lastSubmittedAt: Date | string | null): Date {
  // Awal hari tenggat+2 di WIB = akhir hari tenggat+1.
  const dayEnd = new Date(Date.parse(addDaysISO(deadline, 2) + "T00:00:00Z") - WIB_OFFSET_MS);
  if (!lastSubmittedAt) return dayEnd;
  const sub = new Date(lastSubmittedAt).getTime();
  return new Date(Math.max(dayEnd.getTime(), sub + DAY_MS));
}

/** Dana otomatis diteruskan hanya jika hasil sudah dikirim, client belum menyetujui/meminta revisi, dan batas waktu terlewat. */
export function isAutoReleaseDue(
  m: { status: string; deadline: string | null },
  lastSubmittedAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (m.status !== "submitted" || !m.deadline || !lastSubmittedAt) return false;
  return now.getTime() >= autoReleaseAt(m.deadline, lastSubmittedAt).getTime();
}

/** Sisa jatah revisi; null berarti tanpa batas. */
export function revisionsLeft(limit: number | null | undefined, used: number): number | null {
  if (limit === null || limit === undefined) return null;
  return Math.max(0, limit - Math.max(0, used));
}

export const canRequestRevision = (limit: number | null | undefined, used: number) => {
  const left = revisionsLeft(limit, used);
  return left === null || left > 0;
};

/** Pesan kesalahan untuk tanggal selesai yang diusulkan freelancer; string kosong jika valid. */
export function finishDateError(date: string, jobDeadline: string | null, required: boolean, today: string = todayWIB()): string {
  if (!date) return required ? "Pilih tanggal selesai pekerjaan." : "";
  if (!isISODate(date)) return "Format tanggal tidak valid.";
  if (date < today) return "Tanggal selesai tidak boleh di masa lalu.";
  if (jobDeadline && date > jobDeadline) return "Tanggal selesai tidak boleh melewati tanggal yang ditentukan client.";
  return "";
}

/** "09:30" -> 570 menit; null jika format salah. */
export function timeToMinutes(t: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Jam kerja dari jam mulai dan selesai (hari yang sama), dibulatkan 2 desimal; null jika tidak valid. */
export function hoursBetween(start: string, end: string): number | null {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null || b <= a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

/** "2 jam 30 menit" untuk tampilan jam kerja. */
export function formatDuration(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const mnt = total % 60;
  if (h && mnt) return `${h} jam ${mnt} menit`;
  return h ? `${h} jam` : `${mnt} menit`;
}
