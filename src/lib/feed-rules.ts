// Aturan murni Linimasa Diskusi (Fase 3-4): polling, pencarian, pesan langsung, laporan.
// Tidak menyentuh database, jadi bisa dipakai klien dan dites langsung.

// ---------- Polling ----------

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_OPTION_MAX = 40;
export const POLL_DURATIONS = [
  { hours: 1, label: "1 jam" },
  { hours: 24, label: "1 hari" },
  { hours: 72, label: "3 hari" },
  { hours: 168, label: "7 hari" },
] as const;

/** Pilihan polling tanpa spasi di tepi dan tanpa yang kosong. */
export function cleanPollOptions(options: readonly string[]): string[] {
  return options.map((o) => o.trim()).filter((o) => o.length > 0);
}

/** Pesan kesalahan untuk polling yang belum valid, atau null kalau sudah boleh dikirim. */
export function validatePoll(body: string, options: readonly string[], hours: number, maxBody = 500): string | null {
  if (body.trim().length === 0) return "Tulis pertanyaan polling dulu.";
  if (body.length > maxBody) return `Pertanyaan maksimal ${maxBody} karakter.`;
  const clean = cleanPollOptions(options);
  if (clean.length < POLL_MIN_OPTIONS) return `Isi minimal ${POLL_MIN_OPTIONS} pilihan.`;
  if (clean.length > POLL_MAX_OPTIONS) return `Maksimal ${POLL_MAX_OPTIONS} pilihan.`;
  if (clean.some((o) => o.length > POLL_OPTION_MAX)) return `Satu pilihan maksimal ${POLL_OPTION_MAX} karakter.`;
  const seen = new Set(clean.map((o) => o.toLowerCase()));
  if (seen.size !== clean.length) return "Pilihan tidak boleh sama.";
  if (!POLL_DURATIONS.some((d) => d.hours === hours)) return "Durasi polling tidak valid.";
  return null;
}

/** Persentase per pilihan, dibulatkan dengan sisa terbesar supaya jumlahnya tepat 100 (atau semua 0 kalau belum ada suara). */
export function pollPercents(counts: readonly number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map((x) => Math.floor(x));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

export function isPollOpen(endsAt: string, now = Date.now()): boolean {
  return Date.parse(endsAt) > now;
}

/** "3 jam lagi", "12 menit lagi", atau "Berakhir". */
export function pollTimeLeft(endsAt: string, now = Date.now()): string {
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return "Berakhir";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} menit lagi`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lagi`;
  return `${Math.floor(hours / 24)} hari lagi`;
}

// ---------- Pencarian ----------

/**
 * Kata kunci pencarian: huruf kecil, hanya huruf/angka/_/-, minimal satu huruf atau angka, tanpa duplikat, maksimal 5.
 * Tanda # dan @ dibuang. Garis bawah masih bisa lolos, jadi pemanggil harus meng-escape `_` sebelum dipakai di ILIKE.
 */
export function searchWords(q: string, max = 5): string[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  return [...new Set(words)].slice(0, max);
}

/** Buang item dengan id yang sama (halaman "Untuk Kamu" bisa bergeser antar muatan). Urutan pertama dipertahankan. */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// ---------- Pesan langsung ----------

export const MAX_DM_LENGTH = 2000;

export function dmBodyError(body: string): string | null {
  if (body.trim().length === 0) return "Pesan tidak boleh kosong.";
  if (body.length > MAX_DM_LENGTH) return `Pesan maksimal ${MAX_DM_LENGTH} karakter.`;
  return null;
}

// ---------- Laporan ----------

export const REPORT_REASONS = [
  { value: "spam", label: "Spam atau iklan berlebihan" },
  { value: "pelecehan", label: "Pelecehan atau ujaran kebencian" },
  { value: "menyesatkan", label: "Menyesatkan atau penipuan" },
  { value: "ilegal", label: "Konten ilegal atau berbahaya" },
  { value: "lainnya", label: "Lainnya" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export const REPORT_NOTE_MAX = 300;

export function reportReasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value;
}
