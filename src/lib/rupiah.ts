// Isian rupiah di form: tampil dengan titik pemisah ribuan (5.000.000), disimpan sebagai bilangan bulat.

const MAX_DIGITS = 12;

/** Hanya digit, tanpa nol di depan, maksimal 12 digit, lalu diberi titik ribuan. Dipakai saat mengetik. */
export function formatRupiahInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Membaca teks rupiah menjadi bilangan bulat. Menerima "5000000", "5.000.000", "Rp 5.000.000", "Rp5,000,000",
 * dan "5.000.000,00" (desimal gaya Indonesia dibuang). Kosong atau tidak ada angka = 0.
 */
export function parseRupiah(raw: string): number {
  const s = raw.trim().replace(/^rp\.?\s*/i, "").replace(/\s/g, "").replace(/,\d{1,2}$/, "");
  const digits = s.replace(/\D/g, "").slice(0, MAX_DIGITS + 1);
  return digits ? Number(digits) : 0;
}
