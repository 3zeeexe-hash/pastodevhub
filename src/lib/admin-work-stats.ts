// GOBI WORK admin: perhitungan murni untuk statistik dan perbandingan di tab Lamaran, Lowongan, dan Transaksi (diuji di admin-work-stats.test.ts).

/** Persentase bulat; 0 bila pembagi kosong. */
export const pct = (n: number | null | undefined, d: number | null | undefined) => (n != null && d ? Math.round((n / d) * 100) : 0);

/** Rata-rata bulat; 0 bila tidak ada angka. */
export const average = (nums: number[]) => (nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0);

export type Verdict = { tone: "ok" | "warn" | "info" | "neutral"; label: string };

/** Membandingkan penawaran pelamar dengan anggaran lowongan. Tarif per jam tidak dibandingkan dengan anggaran total. */
export function bidVsBudget(bid: number | null | undefined, min: number, max: number, hourly = false): Verdict {
  const b = Number(bid ?? 0);
  if (b <= 0) return { tone: "neutral", label: "Penawaran belum diisi (nego)" };
  if (hourly) return { tone: "neutral", label: "Tarif per jam" };
  if (min <= 0 && max <= 0) return { tone: "neutral", label: "Anggaran tidak ditentukan" };
  if (max > 0 && b > max) return { tone: "warn", label: `${Math.round(((b - max) / max) * 100)}% di atas anggaran` };
  if (min > 0 && b < min) return { tone: "info", label: `${Math.round(((min - b) / min) * 100)}% di bawah anggaran` };
  return { tone: "ok", label: "Sesuai anggaran" };
}

export type TxStatRow = { amount: number; paid_at: string | null; fee: number; net: number | null; escrow: string | null; needsRefund: boolean };

/** Statistik transaksi. Volume, komisi, dan escrow hanya dihitung dari pesanan yang sudah dibayar (paid_at terisi oleh server). */
export function txStats(rows: TxStatRow[]) {
  const escrow: Record<string, { n: number; amount: number }> = {};
  let paid = 0, volume = 0, commission = 0, net = 0, refund = 0;
  for (const r of rows) {
    if (r.needsRefund) refund += 1;
    if (!r.paid_at) continue;
    const amount = Number(r.amount) || 0;
    const fee = Number(r.fee) || 0;
    paid += 1;
    volume += amount;
    commission += fee;
    net += r.net ?? Math.max(0, amount - fee);
    const key = r.escrow ?? "tanpa";
    const cur = escrow[key] ?? { n: 0, amount: 0 };
    cur.n += 1;
    cur.amount += amount;
    escrow[key] = cur;
  }
  return { total: rows.length, paid, unpaid: rows.length - paid, volume, commission, net, refund, average: paid ? Math.round(volume / paid) : 0, escrow };
}

export type WeekBucket = { from: number; volume: number; count: number };

/** Volume dibayar per 7 hari untuk `weeks` minggu terakhir (bucket terakhir = 7 hari sampai sekarang). */
export function weeklyVolume(rows: { amount: number; paid_at: string | null }[], weeks = 8, now: number = Date.now()): WeekBucket[] {
  const week = 7 * 86_400_000;
  const out: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({ from: now - (weeks - i) * week, volume: 0, count: 0 }));
  for (const r of rows) {
    if (!r.paid_at) continue;
    const t = Date.parse(r.paid_at);
    if (!Number.isFinite(t) || t > now) continue;
    const i = weeks - 1 - Math.floor((now - t) / week);
    const b = out[i];
    if (i >= 0 && i < weeks && b) {
      b.volume += Number(r.amount) || 0;
      b.count += 1;
    }
  }
  return out;
}
