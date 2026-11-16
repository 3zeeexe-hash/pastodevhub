// GOBI WORK admin: pembantu murni untuk ringkasan, grafik, dan notifikasi pembaruan (diuji di admin-work-activity.test.ts).

/** Kunci penyimpanan waktu terakhir admin menandai pembaruan GOBI WORK sebagai sudah dilihat. */
export const WORK_SEEN_KEY = "gobi-admin-kerja-seen";

/** Hitungan pekerjaan yang menunggu admin. Setiap angka memang butuh tindakan, bukan sekadar baru. */
export type WorkPending = { reports: number; disputes: number; jobs: number; withdrawals: number };
/** Hitungan data baru sejak terakhir admin menandai sudah dilihat. */
export type WorkFresh = { applications: number; contracts: number; reports: number; disputes: number; jobs: number; withdrawals: number };

export const sumCounts = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/** Daftar tanggal `YYYY-MM-DD` (waktu lokal) untuk `n` hari terakhir, dari yang terlama ke hari ini. */
export function lastDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export function dayKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Menghitung jumlah cap waktu per hari. Cap waktu yang tidak valid atau di luar rentang diabaikan. */
export function bucketByDay(timestamps: (string | null | undefined)[], days: string[]): number[] {
  const idx = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const t of timestamps) {
    if (!t) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    const i = idx.get(dayKey(d));
    if (i !== undefined) out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

/** Perubahan persen dari `prev` ke `cur`. null bila tidak ada pembanding (prev = 0 atau tidak ada). */
export function deltaPct(cur: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || !Number.isFinite(prev) || prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

/** Dua bulan terakhir dari deret bulanan (urut lama ke baru). */
export function lastTwo<T>(rows: T[]): { cur: T | null; prev: T | null } {
  return { cur: rows[rows.length - 1] ?? null, prev: rows[rows.length - 2] ?? null };
}

/** Rupiah ringkas untuk sumbu grafik dan kartu: 1,2 jt / 3,4 rb / 2 M. */
export function rpCompact(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const f = (x: number) => (Math.round(x * 10) / 10).toString().replace(".", ",");
  if (abs >= 1_000_000_000) return `Rp ${f(v / 1_000_000_000)} M`;
  if (abs >= 1_000_000) return `Rp ${f(v / 1_000_000)} jt`;
  if (abs >= 1_000) return `Rp ${f(v / 1_000)} rb`;
  return `Rp ${Math.round(v)}`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** `2026-11` menjadi `Nov 26`. Nilai yang tidak dikenali dikembalikan apa adanya. */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const i = Number(m[2]) - 1;
  const name = BULAN[i];
  return name && m[1] ? `${name} ${m[1].slice(2)}` : ym;
}

/** `2026-11-16` menjadi `16 Nov`. */
export function dayLabel(ymd: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const name = BULAN[Number(m[1]) - 1];
  return name ? `${Number(m[2])} ${name}` : ymd;
}

/** Persentase `part` dari `whole`, dibulatkan. null bila `whole` nol. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Kunci yang nilainya naik dari `prev` ke `next` beserta selisihnya. Poll pertama (prev null) tidak dianggap kenaikan. */
export function increases<T extends Record<string, number>>(prev: T | null, next: T): { key: keyof T; by: number }[] {
  if (!prev) return [];
  const out: { key: keyof T; by: number }[] = [];
  for (const k of Object.keys(next) as (keyof T)[]) {
    const by = (next[k] ?? 0) - (prev[k] ?? 0);
    if (by > 0) out.push({ key: k, by });
  }
  return out;
}

/** Membaca waktu "terakhir dilihat" (ms). Bila belum pernah ada, dianggap sekarang supaya admin baru tidak kebanjiran lencana. */
export function readSeen(storage: Pick<Storage, "getItem" | "setItem"> | null, now = Date.now()): number {
  try {
    const raw = storage?.getItem(WORK_SEEN_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    storage?.setItem(WORK_SEEN_KEY, String(now));
  } catch {
    /* penyimpanan tidak tersedia: pakai waktu sekarang */
  }
  return now;
}
