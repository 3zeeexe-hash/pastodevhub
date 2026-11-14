import type { AccountType } from "@/lib/market";

/**
 * Peran tampilan Pastodev. Satu akun bisa berganti peran kapan saja.
 *
 * Database hanya mengenal dua jenis akun (client / developer), jadi tiap peran
 * dipetakan ke salah satu dari keduanya. Peran aktif disimpan di tabel
 * `user_role_prefs` (ikut ke perangkat mana pun) dan disalin ke localStorage
 * sebagai cadangan, sehingga tetap jalan sebelum SQL 0008 diterapkan.
 * Peran hanya mengatur tampilan: menu, beranda, dan pintasan.
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

/**
 * Memilih sumber peran: peran dari database dipakai lebih dulu selama masih cocok
 * dengan jenis akun; kalau tidak ada (atau tabelnya belum aktif), pakai peran dari perangkat ini.
 */
export function pickStoredRole(fromDatabase: string | null | undefined, fromDevice: string | null | undefined, type: AccountType | null): string | null {
  return isRole(fromDatabase) && roleFitsAccount(fromDatabase, type) ? fromDatabase : fromDevice ?? null;
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

/**
 * Kemampuan tiap peran: menentukan menu, tombol "Buat baru", profil, dan halaman mana yang boleh dibuka.
 * Fitur satu peran tidak muncul di peran lain (mis. repositori tidak ada untuk Client dan Freelancer,
 * "Pasang lowongan" hanya untuk Client). Ini aturan tampilan; hak akses sebenarnya tetap di database.
 */
export type Capability =
  | "repos" | "github" | "karya" | "jasa" | "portfolio" | "toko" | "hosting" | "ai" | "lamaran" | "post_job";

export const ROLE_CAPS: Record<Role, readonly Capability[]> = {
  developer: ["repos", "github", "karya", "jasa", "portfolio", "toko", "hosting", "ai", "lamaran"],
  freelancer: ["jasa", "portfolio", "hosting", "lamaran"],
  client: ["post_job"],
  personal: ["repos", "github", "hosting", "ai"],
};

export function roleCan(role: Role, cap: Capability): boolean {
  return ROLE_CAPS[role].includes(cap);
}

/** Halaman yang hanya terbuka untuk peran dengan kemampuan tertentu (awalan jalur, cocok sampai segmen berikutnya). */
export const ROLE_PATHS: { path: string; cap: Capability }[] = [
  { path: "/new", cap: "repos" },
  { path: "/import", cap: "github" },
  { path: "/studio/karya", cap: "karya" },
  { path: "/studio/jasa", cap: "jasa" },
  { path: "/studio/portofolio", cap: "portfolio" },
  { path: "/studio/toko", cap: "toko" },
  { path: "/studio/hosting", cap: "hosting" },
  { path: "/studio/files", cap: "hosting" },
  { path: "/studio/images", cap: "hosting" },
  { path: "/studio/ai", cap: "ai" },
  { path: "/studio/lamaran", cap: "lamaran" },
  { path: "/lowongan/baru", cap: "post_job" },
  { path: "/lowongan/saya", cap: "post_job" },
];

/** Kemampuan yang dibutuhkan sebuah halaman, atau null kalau halaman terbuka untuk semua peran. */
export function capabilityForPath(pathname: string): Capability | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const r of ROLE_PATHS) {
    if (path === r.path || path.startsWith(`${r.path}/`)) return r.cap;
  }
  return null;
}

/** Peran paling cocok yang punya kemampuan itu, untuk saran "ganti peran" di halaman yang tertutup. */
export function roleFor(cap: Capability): Role {
  return ROLE_ORDER.find((r) => roleCan(r, cap)) ?? "developer";
}

export type ProfileTab = "repos" | "stars" | "karya" | "jasa" | "portofolio" | "lowongan";

/** Tab profil tiap peran, urut tampil. "Ringkasan" selalu ada dan tidak ikut daftar ini. */
export const PROFILE_TABS: Record<Role, readonly ProfileTab[]> = {
  developer: ["repos", "stars", "karya", "jasa", "portofolio"],
  freelancer: ["jasa", "portofolio"],
  client: ["lowongan"],
  personal: ["repos", "stars"],
};

/**
 * Peran yang dipakai untuk menampilkan profil orang lain: kolom profiles.active_role (SQL 0009)
 * selama masih cocok dengan jenis akun; kalau belum ada, pakai jenis akun seperti dulu.
 */
export function publicRoleOf(p: { active_role?: string | null | undefined; account_type: AccountType | null }): Role {
  return resolveRole(p.active_role, p.account_type);
}
