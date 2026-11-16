// Feature switches the admin can turn on/off. A feature without a stored switch is on.

export type FeatureKey =
  | "signup" | "verifikasi" | "repos" | "git_http" | "github" | "explore" | "dm" | "linimasa" | "discuss" | "jobs"
  | "karya" | "jasa" | "pencairan" | "hosting" | "toko" | "ai_editor"
  | "situs" | "pencarian" | "notifikasi" | "saldo" | "dashboard" | "chat_dock"
  | "tersimpan" | "tagar" | "gobifeed_notifikasi" | "forum"
  | "issue_pr" | "riwayat_commit" | "editor_web";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
  group: "Umum" | "Akun" | "Kode" | "Komunitas" | "Marketplace" | "Tools developer";
  /** Pages that show "dinonaktifkan" while the feature is off (prefix match). */
  paths: string[];
  /** Untuk halaman yang alamatnya memuat nama pengguna dan repo, jadi tidak bisa dicocokkan dengan awalan. */
  match?: RegExp;
  /** Contoh alamat yang ditampilkan ke admin kalau `match` dipakai. */
  examples?: string[];
  /** Hanya menutup halaman atau tampilan; belum ada pengunci di database. */
  pageOnly?: boolean;
  /** Teks konfirmasi khusus saat saklar dimatikan. */
  confirm?: string;
};

/** Nama awal alamat yang bukan nama pengguna, supaya pola /{user}/{repo}/... tidak salah kena. */
const NOT_USER = "studio|admin|kerja|gobifeed|lowongan|karya|jasa|toko|discuss|katalog|api|saldo|pesanan|f";
const repoPage = (segments: string) => new RegExp(`^/(?!(?:${NOT_USER})/)[^/]+/[^/]+/(?:${segments})(?:/|$)`);

// Urutan penting: fitur yang lebih spesifik harus di atas fitur yang membawahinya (mis. /gobifeed/tersimpan sebelum /gobifeed).
export const FEATURES: FeatureDef[] = [
  {
    key: "situs", group: "Umum", label: "Situs terbuka untuk pengunjung", pageOnly: true, paths: [],
    description: "Mode perawatan. Kalau mati, semua halaman menampilkan “sedang dalam perawatan” untuk pengguna biasa. Halaman masuk dan admin tetap terbuka.",
    confirm: "Seluruh situs ditutup untuk pengguna biasa dan diganti halaman perawatan. Hanya halaman masuk (/auth) dan admin yang tetap terbuka, jadi pastikan kamu bisa masuk sebagai admin. Data tidak dihapus, dan situs bisa dibuka lagi kapan saja dari halaman ini.",
  },
  { key: "pencarian", group: "Umum", label: "Pencarian", pageOnly: true, description: "Halaman pencarian /search untuk repositori, pengguna, karya, dan lainnya.", paths: ["/search"] },
  { key: "notifikasi", group: "Umum", label: "Halaman notifikasi", pageOnly: true, description: "Halaman /notifikasi (daftar pemberitahuan akun).", paths: ["/notifikasi"] },
  { key: "dashboard", group: "Umum", label: "Dasbor pengguna", pageOnly: true, description: "Halaman /dashboard setelah masuk.", paths: ["/dashboard"] },
  { key: "saldo", group: "Umum", label: "Halaman saldo", pageOnly: true, description: "Halaman saldo (/saldo dan /studio/saldo). Hanya tampilan; saldo tetap aman. Permintaan pencairan diatur fitur Pencairan dana.", paths: ["/saldo", "/studio/saldo"] },
  { key: "chat_dock", group: "Umum", label: "Tombol chat mengambang", pageOnly: true, description: "Tombol dan jendela chat kecil yang melayang di pojok layar. Halaman Pesan tetap ada.", paths: [] },

  { key: "signup", group: "Akun", label: "Pendaftaran akun baru", description: "Kalau mati, orang baru tidak bisa membuat akun. Akun yang sudah ada tetap bisa masuk.", paths: [] },
  { key: "verifikasi", group: "Akun", label: "Verifikasi developer", description: "Pengajuan centang biru dan halaman verifikasi. Akun yang sudah terverifikasi tetap terverifikasi.", paths: ["/verifikasi", "/studio/verifikasi"] },

  { key: "repos", group: "Kode", label: "Repositori", description: "Membuat repositori baru, issue, dan pull request. Repositori yang ada tetap bisa dilihat.", paths: ["/new"] },
  { key: "git_http", group: "Kode", label: "Git lewat terminal", description: "git clone, pull, dan push lewat HTTPS dengan token git.", paths: [] },
  { key: "github", group: "Kode", label: "Hubungkan GitHub", description: "Menghubungkan akun GitHub, impor, dan ekspor repositori.", paths: ["/import"] },
  { key: "explore", group: "Kode", label: "Jelajah proyek", description: "Halaman /explore yang menampilkan daftar repositori publik.", paths: ["/explore"] },
  {
    key: "issue_pr", group: "Kode", label: "Halaman Issue & Pull request", pageOnly: true, paths: [], match: repoPage("issues|pulls"), examples: ["/{pengguna}/{repo}/issues", "/{pengguna}/{repo}/pulls"],
    description: "Daftar dan detail issue serta pull request di semua repositori. Membuat issue/PR baru diatur fitur Repositori.",
  },
  {
    key: "riwayat_commit", group: "Kode", label: "Riwayat commit", pageOnly: true, paths: [], match: repoPage("commits|commit"), examples: ["/{pengguna}/{repo}/commits", "/{pengguna}/{repo}/commit/{id}"],
    description: "Halaman daftar commit dan detail satu commit di setiap repositori.",
  },
  {
    key: "editor_web", group: "Kode", label: "Editor file di browser", pageOnly: true, paths: [], match: repoPage("edit|new"), examples: ["/{pengguna}/{repo}/edit/…", "/{pengguna}/{repo}/new"],
    description: "Mengedit dan membuat file langsung dari halaman repositori. Git lewat terminal diatur terpisah.",
  },

  { key: "dm", group: "Komunitas", label: "Pesan langsung", description: "Obrolan pribadi antar pengguna (tab Pesan). Obrolan lamaran/kerja mengikuti fitur Lowongan.", paths: [] },
  { key: "linimasa", group: "Komunitas", label: "Posting & cerita GobiFeed", description: "Post baru, cerita, dan polling di GobiFeed. Halamannya tetap bisa dibaca; yang dimatikan hanya menulis baru.", paths: [] },
  { key: "tersimpan", group: "Komunitas", label: "Postingan tersimpan", pageOnly: true, description: "Halaman /gobifeed/tersimpan (daftar postingan yang disimpan pengguna).", paths: ["/gobifeed/tersimpan"] },
  { key: "tagar", group: "Komunitas", label: "Halaman tagar", pageOnly: true, description: "Halaman tagar di GobiFeed (/gobifeed/tag/…).", paths: ["/gobifeed/tag"] },
  { key: "gobifeed_notifikasi", group: "Komunitas", label: "Notifikasi GobiFeed", pageOnly: true, description: "Halaman /gobifeed/notifikasi (suka, balasan, dan pengikut baru).", paths: ["/gobifeed/notifikasi"] },
  { key: "discuss", group: "Komunitas", label: "GobiFeed", description: "Halaman GobiFeed: linimasa, forum, pesan, tagar, dan komentar.", paths: ["/gobifeed"] },
  { key: "forum", group: "Komunitas", label: "Forum diskusi lama", pageOnly: true, description: "Halaman forum lama di /discuss.", paths: ["/discuss"] },
  { key: "jobs", group: "Komunitas", label: "Lowongan & GOBI WORK", description: "Memasang lowongan, melamar, serta kontrak, pesan, dan pembayaran kerja (GOBI WORK).", paths: ["/lowongan", "/kerja", "/studio/lamaran"] },

  { key: "karya", group: "Marketplace", label: "Karya", description: "Menjual dan membeli karya (proyek siap pakai).", paths: ["/karya", "/studio/karya", "/katalog"] },
  { key: "jasa", group: "Marketplace", label: "Jasa & portofolio", description: "Membuka jasa, memesan jasa, dan portofolio developer.", paths: ["/jasa", "/studio/jasa", "/studio/portofolio"] },
  { key: "pencairan", group: "Marketplace", label: "Pencairan dana", description: "Permintaan pencairan saldo developer dan client. Saldo tetap aman dan bisa dilihat; hanya permintaan baru yang ditolak.", paths: [] },

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
    if (f.paths.some((p) => path === p || path.startsWith(`${p}/`)) || f.match?.test(path)) return f.key;
  }
  if (/^\/[^/]+\/[^/]+\/ai$/.test(path) && !path.startsWith("/studio/")) return "ai_editor";
  return null;
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

/** Halaman yang tetap terbuka saat situs ditutup (mode perawatan), supaya admin masih bisa masuk dan membukanya lagi. */
const MAINTENANCE_OPEN = ["/auth", "/reset-password", "/admin"];
export function isMaintenanceOpenPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return MAINTENANCE_OPEN.some((p) => path === p || path.startsWith(`${p}/`));
}
