// Format isian nominal rupiah: "Rp 1.500.000". Nilai yang disimpan selalu bilangan bulat (digit saja).

const MAX_DIGITS = 12; // cukup untuk Rp999 miliar; mencegah angka tak masuk akal.

/** Mengambil digit dari teks apa pun ("Rp 1.500.000" -> "1500000"); tanpa nol di depan. */
export function rupiahDigits(text: string): string {
  const d = text.replace(/\D/g, "").slice(0, MAX_DIGITS).replace(/^0+(?=\d)/, "");
  return d;
}

/** Teks tampilan untuk digit: "1500000" -> "Rp 1.500.000"; kosong tetap kosong. */
export function formatRupiahInput(digits: string): string {
  const d = rupiahDigits(digits);
  if (!d) return "";
  return "Rp " + d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Teks isian -> bilangan bulat rupiah (0 jika kosong). */
export function parseRupiah(text: string): number {
  const d = rupiahDigits(text);
  return d ? Number(d) : 0;
}
