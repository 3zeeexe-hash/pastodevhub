// 1. Impor gambar langsung menggunakan ES6 import Vite
import logoImg from "@/assets/20261110_235342.png";

// 2. Gunakan variabel logoImg pada src gambar
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src={logoImg}
      alt="Pastodev"
      width={size}
      height={size}
      className="rounded-full ring-1 ring-primary/40 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

// 3. Ekspor variabel yang sama untuk rute/halaman lain
export const brandLogoUrl = logoImg;
export const brandMarkUrl = logoImg;
