/** Tingkat centang verifikasi. Kolom `profiles.verified_tier` (docs/sql/0010_tingkat_centang.sql); kosong = tanpa centang. */
export type VerifiedTier = "verified" | "official" | "owner";

/** Urutan tampil di menu admin: dari yang paling umum ke yang paling tinggi. */
export const VERIFIED_TIERS: VerifiedTier[] = ["verified", "official", "owner"];

type TierMeta = {
  /** Nama tingkat yang dibaca pengguna. */
  label: string;
  /** Warna centang, untuk kalimat di menu admin ("centang biru"). */
  colorName: string;
  /** Teks bantu untuk tooltip dan pembaca layar. */
  title: string;
  /** Penjelasan singkat untuk admin di menu. */
  hint: string;
  /** Kelas lengkap (ditulis utuh supaya terbaca oleh Tailwind). */
  fill: string;
  pill: string;
};

export const TIER_META: Record<VerifiedTier, TierMeta> = {
  verified: {
    label: "Terverifikasi",
    colorName: "biru",
    title: "Akun terverifikasi",
    hint: "Identitas atau karya sudah dicek admin",
    fill: "fill-sky-500",
    pill: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  official: {
    label: "Akun resmi",
    colorName: "hijau",
    title: "Akun resmi",
    hint: "Akun milik GoBi atau mitra resmi",
    fill: "fill-emerald-500",
    pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  owner: {
    label: "Pemilik",
    colorName: "merah",
    title: "Pemilik situs",
    hint: "Akun pemilik GoBi",
    fill: "fill-red-600",
    pill: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
};

/** Nilai dari database ke tingkat yang dikenal; apa pun selain tiga tingkat di atas dianggap tanpa tingkat. */
export function asTier(value: unknown): VerifiedTier | null {
  return value === "verified" || value === "official" || value === "owner" ? value : null;
}
