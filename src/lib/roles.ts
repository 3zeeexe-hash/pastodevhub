import type { AccountType } from "@/lib/market";

/**
 * Peran tampilan Pastodev. Satu akun bisa berganti peran kapan saja.
 *
 * Database hanya mengenal dua jenis akun (client / developer), jadi tiap peran
 * dipetakan ke salah satu dari keduanya. Peran sendiri disimpan di perangkat
 * (localStorage) dan hanya mengatur tampilan: menu, beranda, dan pintasan.
 * Hak akses yang sebenarnya tetap mengikuti jenis akun di database.
 */
export type Role = "personal" | "client" | "freelancer" | "developer";

export const ROLE_KEY = "pastodev-role";
export const ROLE_EVENT = "pastodev-role-change";

export type RoleInfo = {
  value: Role;
  title: string;
  tagline: string;
  /** Jenis akun database yang dipakai peran ini. */
  account: AccountType;
  /** Nama ruang kerja di menu dan header. */
  workspaceLabel: string;
};

export const ROLE_INFO: Record<Role, RoleInfo> = {
  developer: { value: "developer", title: "Developer", tagline: "Bangun repositori, jual karya, buka toko.", account: "developer", workspaceLabel: "Studio developer" },
  freelancer: { value: "freelancer", title: "Freelancer", tagline: "Cari proyek, kirim lamaran, buka jasa.", account: "developer", workspaceLabel: "Ruang freelance" },
  client: { value: "client", title: "Client", tagline: "Pasang lowongan, cari developer, pesan jasa.", account: "client", workspaceLabel: "Dashboard client" },
  personal: { value: "personal", title: "Pribadi", tagline: "Simpan kode, hosting file, dan eksperimen sendiri.", account: "developer", workspaceLabel: "Ruang pribadi" },
};

/** Urutan tampil di pemilih peran. */
export const ROLE_ORDER: Role[] = ["developer", "freelancer", "client", "personal"];

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLE_ORDER as string[]).includes(v);
}

/** Jenis akun database untuk sebuah peran. */
export function accountTypeFor(role: Role): AccountType {
  return ROLE_INFO[role].account;
}

/** Peran cocok dengan akun kalau jenis akunnya sama. Akun tanpa jenis belum cocok dengan peran apa pun. */
export function roleFitsAccount(role: Role, type: AccountType | null): boolean {
  return type !== null && accountTypeFor(role) === type;
}

/** Peran awal untuk akun yang belum pernah memilih: sama dengan perilaku lama. */
export function defaultRole(type: AccountType | null): Role {
  return type === "client" ? "client" : "developer";
}

/** Peran tersimpan dipakai kalau masih cocok dengan jenis akun; kalau tidak, pakai peran awal. */
export function resolveRole(stored: string | null | undefined, type: AccountType | null): Role {
  return isRole(stored) && roleFitsAccount(stored, type) ? stored : defaultRole(type);
}

/** Halaman ruang kerja: studio untuk akun developer, dashboard untuk client. */
export function workspacePath(type: AccountType | null | undefined): "/studio" | "/dashboard" {
  return type === "developer" ? "/studio" : "/dashboard";
}

export function readStoredRole(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredRole(role: Role) {
  try {
    window.localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* penyimpanan diblokir: peran tetap jalan untuk sesi ini lewat default */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ROLE_EVENT));
}
