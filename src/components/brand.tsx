// Logo GOBI: kucing berorbit (SVG vektor, latar transparan). Dipakai di header, footer, halaman masuk, dan tempat lain lewat BrandMark.
import logoImg from "@/assets/pastodev-logo.svg";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src={logoImg}
      alt="GOBI"
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}

// Ekspor URL yang sama untuk rute/halaman lain yang butuh alamat gambar.
export const brandLogoUrl = logoImg;
export const brandMarkUrl = logoImg;
