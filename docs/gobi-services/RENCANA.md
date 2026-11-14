# GOBI SERVICES — analisis repo & rencana implementasi

Dokumen ini hasil pemeriksaan repo `pastodevhub` (Fase 1 dari master prompt GOBI SERVICES).
Branch kerja: `feat/gobi-services` (sengaja bukan branch utama yang tersinkron ke Lovable), mengikuti pola `feat/gobi-work`.

## 1. Temuan repo

| Area | Yang sudah ada |
|---|---|
| Stack | TanStack Start + React 19 + Vite, deploy Cloudflare (`wrangler.jsonc`), Supabase (Lovable Cloud), Tailwind 4 + shadcn/ui, Vitest. Bukan Next.js / Laravel / REST terpisah |
| "API" | Tidak ada API REST sendiri. Backend = fungsi Postgres `SECURITY DEFINER` (dipanggil `supabase.rpc`) + server functions TanStack (`*.functions.ts`, `*.server.ts`) untuk hal yang butuh rahasia (Midtrans, webhook, GitHub) |
| Auth & role | Email/Google/GitHub; `profiles.account_type` (`client` / `developer`); admin lewat `has_role` + `_is_admin()`. Peran tampilan (`roles.ts`: developer/freelancer/client/pribadi) hanya mengatur menu, bukan hak akses |
| Jasa yang sudah ada | Tabel `services` (`owner_id, title, summary, description, category, price_from, delivery_days, cover_url, is_active`); halaman `/jasa`, `/jasa/$id`, `/studio/jasa`, `/studio/jasa/$id`; pesanan di `orders` (`kind='service'`, `service_id`); RPC `request_service`, `respond_service_order`, `deliver_order`, `request_revision`, `complete_order`, `cancel_order`; kategori lama hard-coded di `src/lib/market.ts` |
| Chat | Chat pesanan = `order_messages` (+ `order_log`); DM umum = `dm_conversations/dm_messages/dm_participants`; chat lamaran = `job_messages` |
| Notifikasi | `feed_notifications` (feed) dan `work_notifications` (GOBI WORK). Belum ada untuk jasa |
| Upload | Bucket `media` lewat `uploadMedia()` di `market.ts` (gambar, maks 5 MB, link bertanda tangan) |
| Pembayaran | Midtrans Core API + escrow: `orders`, `payments`, `payment_events`, `escrow_ledger`, `payouts`, `developer_wallet()`, `request_wallet_payout()`, `platform_fee()`, `app_settings.fee_percent`; webhook diverifikasi server (`midtrans.server.ts`) |
| Admin | `/admin/*` (pengguna, moderasi, escrow, pembayaran, midtrans, laporan, verifikasi, fitur, kerja) + `admin_audit_log` / `_audit()`; saklar fitur `feature_flags` (kunci `jasa` sudah ada) |
| Desain | Tailwind + shadcn/ui, tema oranye-biru GOBI (`src/styles.css`), kartu di `components/market-cards` |

## 2. Aturan proyek yang dipatuhi (`AGENTS.md`)

- Skema database **dikelola Lovable**: tidak menambah/mengubah `supabase/migrations/` atau `drizzle/`. SQL baru ditaruh di `docs/sql/gobi-services/` (konvensi yang sama dengan `docs/sql/gobi-work/` dan `docs/sql/midtrans-escrow/`), lalu dijalankan lewat Lovable. Ini menggantikan instruksi "buat migration" di master prompt.
- Perubahan status order/payout lewat fungsi `SECURITY DEFINER`; klien hanya membaca.
- Tidak ada escrow buatan sendiri: dana tetap lewat Midtrans + `escrow_ledger`.
- Jangan menulis ulang riwayat git yang sudah dipush (sinkron dengan Lovable).

## 3. Temuan penting: modul Jasa sudah ada

GOBI SERVICES **memperluas** modul Jasa, bukan membuat baru. Konsekuensinya:

1. `services` **diperluas** (tambah kolom), tidak dibuat ulang. Kolom lama tetap jalan.
2. Studio lama tetap berfungsi: default `status='published'`, dan trigger `_services_guard` menerjemahkan toggle `is_active` lama menjadi status (aktif ↔ terbit/dijeda). Jasa lama yang nonaktif menjadi `paused`.
3. Moderasi default **mati** (`service_settings.require_moderation=false`) supaya perilaku lama tidak berubah sampai admin menyalakannya (Fase 3).
4. Pesanan jasa tetap baris `orders` (`kind='service'`). Tabel baru `service_orders` adalah lapisan detail 1:1 (`order_id` = PK). Uang tidak pernah disimpan di tabel jasa.
5. Alur lama `request_service` → `respond_service_order` (pembeli mengajukan brief + budget, penjual menetapkan harga) sudah berfungsi sebagai **custom order**. Fase 5 memutuskan memperluasnya (deadline, lampiran lewat `service_requirements`) alih-alih membuat tabel custom order baru.

## 4. Pemetaan master prompt → repo

| Master prompt | Keputusan |
|---|---|
| `service_categories`, `service_subcategories` | Baru. Kategori = 27 item awal dari master prompt (+ `group_label` Development/Design/Digital). Kolom `services.category` lama tidak diubah; `services.category_slug` baru (kosong untuk jasa lama sampai penjual memilih) |
| `services` | **Diperluas**: `status, category_slug, subcategory_slug, skills, buyer_requirements, revision_terms, scope_limits, moderation_note, admin_hold, published_at, rating_avg, rating_count, orders_completed` |
| `service_packages`, `service_addons`, `service_gallery`, `service_faqs`, `service_favorites` | Baru. Galeri bisa menautkan `portfolio_items` yang sudah ada |
| `service_orders` | Baru, 1:1 dengan `orders`. Menyimpan status alur kerja jasa (`stage`), snapshot paket, kuota revisi, tenggat |
| `service_order_items`, `service_requirements`, `service_submissions`, `service_revisions` | Baru |
| `service_order_messages` | **Tidak dibuat** — pakai `order_messages` (sudah punya `order_id`, `is_system`). Chat sebelum order: `dm_*` |
| `service_transactions`, `service_ledger_entries`, `service_payouts` | **Tidak dibuat** — duplikat `payments`, `payment_events`, `escrow_ledger`, `payouts` |
| `service_admin_logs` | **Tidak dibuat** — pakai `admin_audit_log` + `_audit()` |
| `service_reviews`, `service_disputes`, `service_reports`, `service_notifications` | Baru |
| Tambahan di luar daftar master | `service_settings` (moderasi, komisi, penyelesaian otomatis), `service_seller_profiles` (aktivasi mode seller), `service_order_events` (riwayat status), `service_dispute_evidence` (bukti dua pihak) |

## 5. Dua lapis status pesanan

`orders.status` tetap milik alur uang/lama: `requested, declined, awaiting_payment, payment_review, in_progress, delivered, completed, cancelled`. `service_orders.stage` adalah 13 status alur kerja dari master prompt dan **hanya** berubah lewat `_service_move_stage()` (memvalidasi transisi, mengunci baris, mencatat `service_order_events`; aman diulang untuk retry webhook).

| `service_orders.stage` | Keadaan `orders` |
|---|---|
| `awaiting_payment`, `payment_processing` | `awaiting_payment` (+ baris `payments` pending) |
| `paid`, `pending_seller_acceptance` | sudah dibayar (`paid_at` terisi) — lihat risiko #2 |
| `in_progress`, `revision_requested` | `in_progress` |
| `submitted` | `delivered` |
| `completed` | `completed` (+ `escrow_ledger`) |
| `cancel_requested`, `cancelled` | `cancelled` setelah disetujui |
| `disputed` | status `orders` dibekukan lewat `admin_set_escrow('freeze')` |
| `refunded`, `partially_refunded` | hanya setelah konfirmasi refund provider (`payments.needs_refund` dibersihkan admin) |

## 6. Role & permission

Satu akun bisa jadi pembeli dan penjual. Di repo ini, penjual = akun `developer` yang mengaktifkan profil seller (`service_seller_profiles.is_active`); pembeli = akun mana pun yang masuk dan tidak diblokir, kecuali membeli jasanya sendiri. Hak akses **tidak** bergantung pada peran tampilan di frontend.

| Operasi | Anonim | Pembeli | Penjual (pemilik) | Admin |
|---|---|---|---|---|
| Lihat jasa terbit, paket, add-on, galeri, FAQ, ulasan publik | ✔ | ✔ | ✔ | ✔ |
| Lihat jasa non-terbit milik sendiri | ✘ | ✘ | ✔ | ✔ semua |
| Buat / ubah jasa, paket, add-on | ✘ | ✘ | ✔ miliknya (Fase 2, lewat fungsi) | ✔ via moderasi |
| Terbitkan jasa | ✘ | ✘ | langsung bila moderasi mati; selain itu `pending_review` | setujui / tolak (alasan wajib) / minta perbaikan / tahan |
| Buka jasa yang ditahan admin | ✘ | ✘ | ✘ (`admin_hold`) | ✔ |
| Ubah rating, penghitung, catatan moderasi | ✘ | ✘ | ✘ (dikembalikan trigger) | ✔ |
| Buat pesanan | ✘ | ✔ (harga dihitung server) | ✘ jasa sendiri | ✘ |
| Lihat pesanan + turunannya | ✘ | hanya miliknya | hanya miliknya | ✔ semua (`can_access_order`) |
| Terima/tolak, kirim hasil | ✘ | ✘ | ✔ | ✘ |
| Setujui hasil, minta revisi | ✘ | ✔ | ✘ | ✘ |
| Ulasan | ✘ | sekali, hanya pesanan selesai | balasan | sembunyikan |
| Kategori, subkategori, komisi, moderasi, penyelesaian otomatis | ✘ | ✘ | ✘ | ✔ (alasan wajib untuk pengaturan, tercatat di `admin_audit_log`) |
| Ubah transaksi / status bayar / payout | ✘ | ✘ | ✘ | ✘ (hanya webhook terverifikasi & fungsi server) |

Catatan: repo hanya punya satu peran admin (`app_role`: `admin` / `user`). "Permission khusus untuk pengaturan sensitif" belum bisa ditegakkan tanpa tabel izin — lihat keputusan terbuka.

## 7. Peta route & API (diisi bertahap per fase)

Route memakai file TanStack di `src/routes/`; fitur dikendalikan saklar `jasa` yang sudah ada.

| Master prompt | Route | Backend | Fase |
|---|---|---|---|
| Explore Services | `/jasa` | query `services` (RLS) + `service_explore` (pencarian, filter, pagination) | 4 |
| Service Detail | `/jasa/$id` | `services` + `service_packages/addons/gallery/faqs/reviews` | 4 |
| Seller Dashboard, Create / Update Service | `/studio/jasa`, `/studio/jasa/$id` | `service_activate_seller`, `service_save`, `service_save_package`, `service_save_addon` | 2 |
| Delete Draft, Publish | `/studio/jasa/$id` | `service_delete_draft`, `service_submit` (→ `pending_review` / `published`) | 2 |
| Admin Moderation | `/admin/jasa` (baru) | `service_admin_moderate(approve/reject/request_changes/hold)` | 3 |
| Create Order, Checkout | `/jasa/$id` → `/pesanan/$id` | `service_create_order` (hitung ulang harga, `awaiting_payment`) lalu charge Midtrans yang ada | 5 |
| Payment Callback | route webhook Midtrans yang ada | `midtrans_apply_notification` → `_service_on_paid` (idempoten) | 6 |
| Seller Orders / Buyer Orders | `/pesanan` (filter peran) | `service_orders` + `orders` | 7–8 |
| Submit Work / Request Revision / Approve Work | `/pesanan/$id` | `service_submit_work`, `service_request_revision`, `service_approve_work` (memanggil `complete_order`) | 7–8 |
| Create Review | `/pesanan/$id` | `service_leave_review` | 8, 11 |
| Admin Transactions / Payouts | `/admin/pembayaran`, `/admin/escrow` + filter jasa | fungsi admin yang ada | 9 |
| Admin Disputes / Reports | `/admin/jasa-sengketa` (baru) | `service_open_dispute`, `service_admin_decide_dispute`, `service_file_report` | 10 |

Setiap fungsi memanggil `_service_guard()` (harus login, tidak diblokir), mengunci baris, dan mengubah status hanya lewat `_service_move_stage()`.

## 8. Fase

- **Fase 1 (branch ini):** analisis, skema + RLS + pengaman status di `docs/sql/gobi-services/001_gobi_services_core.sql`, aturan murni `src/lib/services.ts` + `services.test.ts`, dokumen ini dan `FASE1.md`.
- **Fase 2:** aktivasi seller, form Create Service (paket, add-on, FAQ, galeri, preview), draft/publikasi, kategori baru di Studio.
- **Fase 3:** halaman admin moderasi jasa + notifikasi keputusan; saklar `require_moderation` di UI.
- **Fase 4:** Explore Services (pencarian, filter, kategori, populer/terbaru), detail jasa, profil seller, favorit.
- **Fase 5:** checkout, brief + referensi, `service_create_order`, custom order.
- **Fase 6:** pembayaran: hubungkan webhook ke `stage`, komisi, rekonsiliasi; keputusan biaya layanan pembeli.
- **Fase 7–8:** dashboard penjual dan pembeli (kirim hasil, revisi, persetujuan, pembatalan, ulasan).
- **Fase 9–11:** admin transaksi, sengketa, review, analitik.
- **Fase 12:** tes menyeluruh, responsif, optimasi, dokumentasi deploy.

## 9. Cara menjalankan Fase 1

1. **Uji di sandbox / salinan database dulu.** Kirim isi `docs/sql/gobi-services/001_gobi_services_core.sql` ke Lovable (atau jalankan di SQL editor Supabase). Skrip idempotent (`if not exists` / `or replace`).
2. Setelah skema aktif, uji manual: (a) buat jasa lewat `/studio/jasa/baru` — harus tetap tampil di `/jasa`; (b) nonaktifkan lalu aktifkan lagi jasa itu; (c) sembunyikan jasa lewat `/admin/moderasi`; (d) nyalakan `require_moderation` lewat `service_admin_set_setting` lalu buat jasa baru — harus menjadi `pending_review`.
3. `bun install && bun run test` untuk menjalankan `src/lib/services.test.ts`.
4. Tipe Supabase diregenerasi otomatis oleh Lovable setelah skema aktif.

## 10. Belum dikerjakan / risiko / keputusan terbuka

**Belum dikerjakan:** belum ada UI GOBI SERVICES dan belum ada kode yang menyentuh tabel baru. SQL dan tes **belum dijalankan** dari lingkungan ini (tidak ada akses ke database maupun runtime Node).

**Risiko:**

1. Trigger `_services_guard` mengubah perilaku tulis pada tabel `services` yang sedang dipakai. Policy RLS `services` yang asli tidak ada di repo (hanya di database Lovable), jadi interaksinya belum bisa diverifikasi dari sini. Jalur toggle `is_active` dari Studio dan `/admin/moderasi` harus diuji.
2. `deliver_order` / `complete_order` yang lama bekerja pada `orders.status`. Sebelum fungsi baru Fase 7–8 ada, penjual masih bisa memanggil `deliver_order` langsung tanpa melewati `stage`. Perlu ditambah penjaga di fungsi itu (skema dikelola Lovable, jadi diminta lewat Lovable) agar pesanan yang punya baris `service_orders` hanya berubah lewat fungsi jasa.
3. Asumsi yang dicek saat SQL dijalankan: `can_access_order` mengizinkan admin; `_audit` menerima parameter bernama `_action/_target_type/_target_id/_note`; `app_settings` punya baris dengan `fee_percent`; `is_banned(_user)` ada.
4. `midtrans_apply_notification` hidup di database. Menghubungkannya ke `service_orders.stage` (Fase 6) berarti mengubah fungsi itu lewat Lovable.
5. File `.env` ikut ter-commit di repo (isinya tidak saya buka). Pastikan hanya berisi kunci publik/publishable.

**Keputusan terbuka untuk pemilik:**

- *Biaya layanan untuk pembeli.* `orders.amount` = yang dibayar pembeli, dan `escrow_ledger` memotong komisi dari jumlah itu. Menambah biaya layanan di atas harga butuh aturan siapa menanggung komisi atas biaya itu. Di Fase 1 komisi hanya dipotong dari penjual dan `buyer_fee` tidak ada.
- *Permission admin granular.* Repo hanya punya `admin` dan `user`. Perlu tabel izin kalau pengaturan sensitif harus dibatasi ke sebagian admin.
- *Penyelesaian otomatis.* Disediakan `auto_complete_days` (default 0 = mati). Nilai dan teks yang ditampilkan ke pembeli harus ditentukan sebelum dinyalakan.
- *Penjual wajib akun `developer`?* Saat ini ya (selaras dengan Studio). Akun `client` yang ingin menjual perlu mengganti jenis akun.
- *Kebijakan usia/perlindungan pengguna.* Belum ada kolom umur di `profiles`; butuh kebijakan hukum sebelum bisa diterapkan.
