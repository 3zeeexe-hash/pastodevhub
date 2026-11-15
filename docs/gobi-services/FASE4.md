# GOBI SERVICES — Laporan Fase 4 (marketplace dan pencarian)

Branch: `feat/gobi-services-fase4` (dari `main` setelah PR #33). Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini tidak punya database maupun runtime Node). Fase 4 bergantung pada SQL 001–003 yang juga belum terverifikasi.

1. **Fase:** Fase 4 — marketplace dan pencarian. Branch ini juga membawa dua sisa pekerjaan Fase 2–3 yang sempat dilepas dari PR #33 karena konflik: editor jasa baru dan menu admin.
2. **Fitur yang dibuat:**
   - **Jelajah Jasa (`/jasa`)**: pencarian (judul, ringkasan, skill, nama kategori, penjual), kategori (27 kategori dari database) dan subkategori, filter harga minimal/maksimal, waktu pengerjaan, rating minimal, seller terverifikasi, dan favorit saya; urutan Terbaru, Terlaris, Rating tertinggi, Harga terendah/tertinggi; pagination 24 per halaman.
   - **Halaman awal berisi kurasi** saat tidak ada filter: Jasa populer, Jasa terbaru, Rating tinggi, dan Seller unggulan. Tombol "Lihat semua" membuka daftar penuh.
   - **Kartu jasa baru**: sampul, kategori, judul, penjual (+centang verifikasi), rating dan jumlah ulasan, pesanan selesai, estimasi hari, harga "mulai dari", dan tombol favorit.
   - **Detail jasa (`/jasa/$id`)**: galeri gambar, paket Basic/Standard/Premium, add-on, deskripsi, syarat pembeli, ketentuan revisi, batas ruang lingkup, FAQ, ulasan (dengan balasan penjual), kartu penjual (jumlah jasa, pesanan selesai, rating), potongan portofolio (3 item) dengan tautan ke tab Jasa/Portofolio di profil penjual, favorit, dan bagikan (Web Share atau salin tautan).
   - **Pilih paket** mengisi budget dan menambahkan nama paket ke brief, lalu dikirim lewat alur permintaan yang sudah ada (`request_service`).
   - **Cadangan**: bila fungsi `service_explore` belum ada di database, `/jasa` otomatis memakai daftar lama sehingga halaman tidak kosong.
   - **Sisa Fase 2–3**: editor jasa bertab (digabung dengan `RupiahInput` dari `main`), menu "Moderasi jasa" di navigasi admin dengan lencana jumlah antrean, dan penghapusan header ganda di `/admin/jasa`.
3. **File baru:**
   - `docs/sql/gobi-services/004_gobi_services_marketplace.sql`
   - `src/lib/services-explore.ts` dan `src/lib/services-explore.test.ts`
   - `src/components/service-explore-card.tsx`
   - `docs/gobi-services/FASE4.md`
4. **File diubah:** `src/routes/jasa.index.tsx`, `src/routes/jasa.$id.tsx`, `src/routes/studio.jasa.$id.tsx` (editor), `src/components/admin-nav.tsx` (menu), `src/routes/admin.jasa.tsx` (tanpa header ganda).
5. **Migrasi database:** `004_gobi_services_marketplace.sql` (idempotent, setelah 001–003): tiga indeks dan tiga fungsi.
6. **Endpoint (fungsi database):** `service_explore(...)` (publik), `service_top_sellers(_limit)` (publik), `service_toggle_favorite(_service_id)` (harus masuk). Paket, add-on, FAQ, galeri, ulasan, dan favorit sendiri dibaca langsung lewat RLS Fase 1.
7. **Permission:**
   - `service_explore` dan `service_top_sellers` hanya mengembalikan jasa `published` + `is_active` dari penjual yang tidak diblokir; draft, ditinjau, ditolak, dijeda, dan arsip tidak pernah muncul. Dijalankan sebagai `SECURITY DEFINER` dengan filter eksplisit, jadi tidak bergantung pada RLS lama tabel `services`.
   - `service_toggle_favorite` menolak jasa yang tidak terbit atau milik sendiri; favorit hanya terbaca oleh pemiliknya.
   - Filter "favorit saya" mengembalikan kosong bagi pengunjung yang belum masuk.
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-explore.test.ts` (normalisasi filter, argumen RPC, urutan, pagination, format rating, tautan bagikan).
9. **Hasil test:** belum ada. Jalankan `bun run test` dan `bun run build`.
10. **Bug ditemukan:** dua bug di draf pertama halaman Jelajah (tombol "Lihat semua" jasa terbaru tidak berfungsi; pembantu bagian kurasi memanggil hook dengan nama non-hook). Keduanya sudah diperbaiki sebelum commit akhir.
11. **Bug diperbaiki:** lihat butir 10.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 004; `profiles.is_verified` (dari `docs/sql/0004_verifikasi_developer.sql`) dan `is_banned(uuid)` harus ada; regenerasi `src/routeTree.gen.ts` lewat build.
13. **Kesiapan Fase 5:** **belum siap** sampai SQL 001–004 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus.

## Uji manual yang perlu dijalankan

1. Jasa **terbit** tampil di `/jasa`; jasa **draft, menunggu moderasi, ditolak, dijeda, dan arsip** tidak tampil (cek di jendela tanpa login).
2. Pencarian: judul, skill (mis. "react"), nama kategori, dan username penjual masing-masing menemukan jasa yang benar; karakter `%` dan `_` dalam kata kunci diperlakukan sebagai teks biasa.
3. Filter: kategori, subkategori, harga min/maks (jasa "Nego" tidak ikut filter maksimum), waktu pengerjaan, rating minimal, seller terverifikasi. Urutan harga terendah menaruh jasa "Nego" di akhir.
4. Pagination: dengan lebih dari 24 jasa, tombol Sebelumnya/Berikutnya dan penghitung halaman benar; total sesuai.
5. Detail jasa menampilkan paket, add-on, FAQ, galeri, dan data penjual yang sama dengan yang disimpan di editor; "Pilih paket" mengisi budget dan nama paket masuk ke brief permintaan.
6. Favorit: akun lain bisa menyimpan dan membatalkan; pemilik jasa tidak melihat tombolnya; pengunjung tanpa login diminta masuk; filter "Favorit saya" hanya menampilkan jasa yang disimpan.
7. Bagikan: di ponsel membuka lembar bagikan; di desktop menyalin tautan `/jasa/<id>`.
8. Tanpa SQL 004: `/jasa` tetap menampilkan daftar lama (cadangan).
9. Tampilan ponsel: baris kategori dan filter bisa digeser, kartu satu kolom, tidak ada scroll horizontal.
10. Admin: menu "Moderasi jasa" muncul dengan lencana jumlah antrean.

## Catatan dan batasan

- **Pemesanan belum berbasis paket.** Alur pesan di halaman detail masih `request_service` yang lama (pembeli mengirim brief + budget, developer menentukan harga final). Memilih paket hanya mengisi budget dan brief. Checkout paket dengan harga dihitung server adalah Fase 5; add-on baru bisa dipilih di sana.
- **Rating dan ulasan hanya ditampilkan.** `rating_avg`, `rating_count`, dan `orders_completed` belum diisi otomatis karena ulasan dan pesanan jasa berbasis paket baru ada di Fase 8 dan 11. Selama itu kartu menampilkan "Belum ada ulasan" dan bagian "Rating tinggi" tidak tampil.
- **"Rekomendasi"** dari master prompt tidak dibuat terpisah: belum ada data perilaku untuk personalisasi. Bagian "Jasa populer" adalah yang terdekat.
- **Filter tidak ada di URL** (disimpan di state halaman), jadi hasil pencarian belum bisa dibagikan sebagai tautan. Bisa ditambahkan dengan `validateSearch` bila dibutuhkan.
- **Portofolio:** halaman detail menampilkan 3 item `portfolio_items` milik penjual; penautan item portofolio langsung ke satu jasa (kolom `service_gallery.portfolio_item_id`) belum dibuat.
- **Jasa lama** (tanpa paket dan kategori baru) tetap tampil dengan harga "mulai dari" dan kategori lama; kategori baru terisi setelah penjual menyimpannya di editor.
- **Branch sebelumnya** `feat/gobi-services-editor` kini digantikan branch ini dan boleh dihapus.
- `routeTree.gen.ts` belum diregenerasi; tidak ada file route baru di branch ini, tetapi route `/admin/jasa` dari PR #33 belum ada di file tersebut sampai build berikutnya.
