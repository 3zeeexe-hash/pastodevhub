import { AppRail } from "@/components/app-rail";

/**
 * Menu samping beranda/linimasa (layar lebar). Isinya sekarang sidebar gabungan (`AppRail`):
 * menu utama, lalu setelah login menu dashboard sesuai peran aktif, tombol Keluar di bawah.
 * Di layar kecil, menu bawah dan menu hamburger header yang dipakai.
 */
export function LeftRail() {
  return <AppRail breakpoint="lg" />;
}
