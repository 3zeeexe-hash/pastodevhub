// Format waktu ala WhatsApp: jam di gelembung, "Kemarin"/nama hari di daftar, dan label tanggal pemisah di dalam percakapan.
const DAY_MS = 86_400_000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Selisih hari kalender antara hari ini dan tanggal itu (0 = hari ini, 1 = kemarin). */
const daysAgo = (iso: string) => Math.round((midnight(new Date()) - midnight(new Date(iso))) / DAY_MS);

/** "14:05" */
export function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
}

/** Waktu di sisi kanan daftar percakapan: jam (hari ini), "Kemarin", nama hari (minggu ini), lalu tanggal. */
export function listTime(iso: string) {
  const n = daysAgo(iso);
  if (n <= 0) return clockTime(iso);
  if (n === 1) return "Kemarin";
  if (n < 7) return new Date(iso).toLocaleDateString("id-ID", { weekday: "long" });
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Label pemisah hari di dalam percakapan. */
export function dayLabel(iso: string) {
  const n = daysAgo(iso);
  if (n <= 0) return "Hari ini";
  if (n === 1) return "Kemarin";
  if (n < 7) return new Date(iso).toLocaleDateString("id-ID", { weekday: "long" });
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export const isSameDay = (a: string, b: string) => daysAgo(a) === daysAgo(b);
