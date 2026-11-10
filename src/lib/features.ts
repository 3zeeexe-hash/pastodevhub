// Feature switches the admin can turn on/off. A feature without a stored switch is on.

export type FeatureKey =
  | "signup" | "repos" | "git_http" | "github" | "discuss" | "jobs"
  | "karya" | "jasa" | "hosting" | "toko" | "ai_editor";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
  group: "Akun" | "Kode" | "Komunitas" | "Marketplace" | "Tools developer";
  /** Pages that show "dinonaktifkan" while the feature is off (prefix match). */
  paths: string[];
};

export const FEATURES: FeatureDef[] = [
  { key: "signup", group: "Akun", label: "Pendaftaran akun baru", description: "Kalau mati, orang baru tidak bisa membuat akun. Akun yang sudah ada tetap bisa masuk.", paths: [] },
  { key: "repos", group: "Kode", label: "Repositori", description: "Membuat repositori baru, issue, dan pull request. Repositori yang ada tetap bisa dilihat.", paths: ["/new"] },
  { key: "git_http", group: "Kode", label: "Git lewat terminal", description: "git clone, pull, dan push lewat HTTPS dengan token git.", paths: [] },
  { key: "github", group: "Kode", label: "Hubungkan GitHub", description: "Menghubungkan akun GitHub, impor, dan ekspor repositori.", paths: ["/import"] },
  { key: "discuss", group: "Komunitas", label: "Diskusi", description: "Halaman diskusi, posting baru, dan komentar.", paths: ["/discuss"] },
  { key: "jobs", group: "Komunitas", label: "Lowongan", description: "Memasang lowongan, melamar, dan halaman lowongan.", paths: ["/lowongan", "/studio/lamaran"] },
  { key: "karya", group: "Marketplace", label: "Karya", description: "Menjual dan membeli karya (proyek siap pakai).", paths: ["/karya", "/studio/karya", "/katalog"] },
  { key: "jasa", group: "Marketplace", label: "Jasa & portofolio", description: "Membuka jasa, memesan jasa, dan portofolio developer.", paths: ["/jasa", "/studio/jasa", "/studio/portofolio"] },
  { key: "hosting", group: "Tools developer", label: "Hosting & berbagi file", description: "Hosting HTML, berbagi file, dan cloud gambar. Link /f/… ikut mati.", paths: ["/studio/hosting", "/studio/files", "/studio/images"] },
  { key: "toko", group: "Tools developer", label: "Toko developer", description: "Halaman toko /toko/… dan desain toko kustom.", paths: ["/toko", "/studio/toko"] },
  { key: "ai_editor", group: "Tools developer", label: "AI untuk repo", description: "Editor AI di repositori dengan kunci Gemini/OpenAI milik developer.", paths: ["/studio/ai"] },
];

export type FeatureFlags = Partial<Record<string, boolean>>;

export function isFeatureOn(flags: FeatureFlags | null | undefined, key: FeatureKey) {
  return flags?.[key] !== false;
}

/** The feature that owns a page, if any. Repo AI pages (/user/repo/ai) belong to the AI editor. */
export function featureForPath(pathname: string): FeatureKey | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const f of FEATURES) {
    if (f.paths.some((p) => path === p || path.startsWith(`${p}/`))) return f.key;
  }
  if (/^\/[^/]+\/[^/]+\/ai$/.test(path) && !path.startsWith("/studio/")) return "ai_editor";
  return null;
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}
