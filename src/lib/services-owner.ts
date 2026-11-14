// GOBI SERVICES Fase 2: aturan murni untuk sisi penjual (aksi per status, kelengkapan jasa, parsing input form).
// Cermin dari docs/sql/gobi-services/002_gobi_services_seller.sql — database tetap penentu akhir.
import { validatePackages, type PackageInput, type ServiceStatus } from "./services";

export type OwnerAction = "edit" | "submit" | "pause" | "resume" | "withdraw" | "archive" | "restore" | "delete";

export const OWNER_ACTION_LABEL: Record<OwnerAction, string> = {
  edit: "Edit",
  submit: "Ajukan / terbitkan",
  pause: "Jeda",
  resume: "Aktifkan lagi",
  withdraw: "Tarik ke draft",
  archive: "Arsipkan",
  restore: "Kembalikan ke draft",
  delete: "Hapus draft",
};

/** Status tujuan untuk aksi yang memakai service_set_status. `submit`, `edit`, dan `delete` punya fungsi sendiri. */
export const OWNER_ACTION_TARGET: Partial<Record<OwnerAction, ServiceStatus>> = {
  pause: "paused",
  resume: "published",
  withdraw: "draft",
  archive: "archived",
  restore: "draft",
};

/** Tombol yang boleh tampil bagi pemilik jasa menurut status. Aturan sebenarnya ditegakkan database. */
export function serviceOwnerActions(s: { status: ServiceStatus; adminHold: boolean }): OwnerAction[] {
  switch (s.status) {
    case "draft":
      return ["edit", "submit", "delete"];
    case "pending_review":
      return ["withdraw"];
    case "published":
      return ["edit", "pause", "archive"];
    case "paused":
      return s.adminHold ? ["edit"] : ["edit", "resume", "archive"];
    case "rejected":
      return ["edit", "submit"];
    case "archived":
      return ["restore"];
  }
}

export type ReadinessInput = { title: string; description: string; category_slug: string | null; cover_url: string | null };

/** Kekurangan yang menghalangi jasa diajukan (cermin `_service_readiness`). Kosong berarti siap. */
export function serviceReadiness(s: ReadinessInput, pkgs: PackageInput[]): string[] {
  const out: string[] = [];
  if (s.title.trim().length < 5) out.push("Judul minimal 5 karakter");
  if (s.description.trim().length < 30) out.push("Deskripsi minimal 30 karakter");
  if (!s.category_slug) out.push("Pilih kategori");
  if (!s.cover_url) out.push("Unggah gambar sampul");
  if (pkgs.length === 0) out.push("Isi satu paket atau tiga paket");
  else out.push(...validatePackages(pkgs));
  return out;
}

/** "react, Next.js,react" -> ["react", "Next.js"]: dipangkas, tanpa duplikat (abaikan huruf besar), maks 15 butir @ 30 karakter. */
export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim().slice(0, 30);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === 15) break;
  }
  return out;
}

/** Satu butir per baris, baris kosong dibuang. */
export function splitLines(raw: string): string[] {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

export const digitsOnly = (raw: string) => raw.replace(/\D/g, "");

/** Ketentuan yang disetujui penjual saat mengaktifkan profil. Teks ini perlu ditinjau pemilik platform. */
export const SELLER_TERMS = [
  "Saya mengerjakan pesanan sesuai deskripsi, paket, dan batas ruang lingkup yang saya tulis.",
  "Saya tidak meminta data pribadi yang tidak diperlukan untuk pekerjaan.",
  "Saya tidak mengalihkan pembayaran atau komunikasi pesanan ke luar GOBI.",
  "Saya paham jasa saya bisa ditinjau, dijeda, atau ditolak admin sesuai kebijakan.",
];
