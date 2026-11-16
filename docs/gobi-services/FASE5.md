# GOBI SERVICES — Laporan Fase 5 (checkout dan pemesanan)

Branch: `feat/gobi-services-fase5` (ditumpuk di atas `feat/gobi-services-fase4`, yang belum digabung ke `main`). Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini tidak punya database maupun runtime Node). Fase 5 bergantung pada SQL 001–004 yang juga belum terverifikasi, dan menyentuh tabel `orders` yang dipakai pembayaran Midtrans.

1. **Fase:** Fase 5 — checkout dan pemesanan.
2. **Fitur yang dibuat:**
   - **Checkout paket** di halaman detail jasa: pilih paket, pilih add-on dengan jumlah 1–10, isi brief (10–5000 karakter), lampirkan referensi (maks 5: gambar yang diunggah atau tautan https), ringkasan biaya, estimasi hari, jumlah revisi, dan persetujuan detail pesanan/ketentuan sebelum tombol "Pesan sekarang" aktif.
   - **Harga dihitung ulang di server**: ringkasan di layar diambil dari `service_checkout_quote`, lalu `service_create_order` menghitung ulang dari tabel paket dan add-on. Klien tidak mengirim harga sama sekali.
   - **Order ID dan invoice**: pesanan = satu baris `orders` (nomor urut `#number` sebagai nomor invoice), status awal **Awaiting Payment**, lalu pembeli diarahkan ke `/pesanan/$id` yang sudah punya tombol "Bayar sekarang" (Midtrans VA/QRIS).
   - **Pencegahan order ganda**: kunci idempotensi per sesi checkout (klik ganda atau percobaan ulang mengembalikan pesanan yang sama) dan batas 10 pesanan paket belum dibayar per pembeli.
   - **Rincian pesanan jasa** di `/pesanan/$id`: paket, add-on, estimasi, kuota revisi, lampiran referensi, persetujuan pembeli, dan riwayat.
   - **Permintaan khusus (custom order)**: judul, deskripsi, budget, deadline, catatan, dan lampiran; memakai alur lama (penjual menerima atau menolak dan menentukan harga final, lalu pembeli membayar).
   - **Riwayat order pembeli** tetap lewat `/pesanan` yang sudah ada.
3. **File baru:**
   - `docs/sql/gobi-services/005_gobi_services_checkout.sql`
   - `src/lib/services-checkout.ts` dan `src/lib/services-checkout.test.ts`
   - `src/components/service-order-panel.tsx`
   - `src/components/service-order-summary.tsx`
   - `docs/gobi-services/FASE5.md`
4. **File diubah:** `src/routes/jasa.$id.tsx` (formulir permintaan lama diganti panel pemesanan; teks "Pastodev" menjadi "GoBi" mengikuti PR #34) dan `src/routes/pesanan.$id.tsx` (menampilkan rincian pesanan jasa; teks GoBi sama dengan `main`).
5. **Migrasi database:** `005_gobi_services_checkout.sql` (idempotent, setelah 001–004): kolom `service_orders.request_key` + indeks unik, tiga fungsi publik, empat fungsi internal.
6. **Endpoint (fungsi database):** `service_checkout_quote(_service_id, _package_id, _addons)`, `service_create_order(_service_id, _package_id, _addons, _brief, _references, _accept_terms, _request_key)`, `service_request_custom(_service_id, _title, _description, _budget, _deadline, _note, _references)`. Internal: `_service_price`, `_service_fee`, `_service_references`.
7. **Permission:** ketiga fungsi hanya untuk pengguna yang masuk dan tidak diblokir. Pesanan hanya bisa dibuat untuk jasa terbit milik penjual aktif yang tidak diblokir, bukan milik sendiri. Paket dan add-on harus milik jasa yang dipesan dan aktif; add-on ganda atau jumlah di luar 1–10 ditolak. Tabel `service_orders`, `service_order_items`, `service_requirements`, dan `service_order_events` hanya terbaca oleh pembeli, penjual, dan admin (RLS Fase 1 lewat `can_access_order`); tidak ada hak tulis langsung bagi klien.
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-checkout.test.ts` (pratinjau biaya, pemilihan add-on, lampiran, validasi checkout, permintaan khusus, tanggal).
9. **Hasil test:** belum ada. Jalankan `bun run test` dan `bun run build`.
10. **Bug ditemukan:** tidak ada dari eksekusi. Dalam penulisan: kunci idempotensi semula dibuat ulang tiap render; sudah diganti menjadi sekali per sesi sebelum commit akhir.
11. **Bug diperbaiki:** lihat butir 10.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 005 setelah 001–004; verifikasi asumsi di bagian "Risiko".
13. **Kesiapan Fase 6:** **belum siap** sampai SQL 001–005 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus.

## Uji manual yang perlu dijalankan

1. Sebagai pembeli, buka jasa terbit yang punya paket: pilih paket dan add-on, isi brief, centang persetujuan, klik **Pesan sekarang**. Harus pindah ke `/pesanan/<id>` dengan status "Menunggu pembayaran", total = harga paket + add-on, dan rincian paket/add-on/lampiran tampil.
2. Di database: `orders` berisi `kind = 'service'`, `status = 'awaiting_payment'`, `amount` sama dengan total, `fee_amount` = komisi (atau komisi global bila komisi jasa belum diatur), `buyer_id`/`seller_id` benar; `service_orders`, `service_order_items`, `service_requirements`, dan `service_order_events` terisi; ada pesan sistem di `order_messages`.
3. **Harga tidak bisa dimanipulasi:** panggil `service_create_order` langsung dengan paket atau add-on milik jasa lain, add-on yang sama dua kali, jumlah 0 atau 11, atau `_accept_terms = false`: semuanya harus ditolak. Tidak ada parameter harga yang bisa diubah.
4. **Order ganda:** klik "Pesan sekarang" dua kali cepat, atau panggil ulang dengan `_request_key` yang sama: hanya satu pesanan. Memakai kunci milik pembeli lain harus ditolak.
5. Pesan jasa milik sendiri, jasa draft/ditinjau/dijeda, atau jasa penjual yang diblokir: ditolak.
6. Setelah 10 pesanan paket belum dibayar, pesanan ke-11 ditolak.
7. **Pembeli lain tidak bisa melihat pesanan:** akun ketiga membuka `/pesanan/<id>` atau membaca `service_orders` lewat API: tidak ada data.
8. Lanjutkan ke pembayaran lewat tombol "Bayar sekarang" yang sudah ada (sandbox Midtrans): pesanan berjalan seperti pesanan jasa lama.
9. **Permintaan khusus:** isi judul, deskripsi, budget, deadline, dan lampiran; pesanan berstatus "requested", penjual menjawab lewat kotak "Jawab permintaan ini" yang sudah ada, brief menyertakan judul/deadline/catatan, dan lampiran tampil di rincian.
10. Tampilan ponsel: panel pemesanan, stepper add-on, dan ringkasan biaya terbaca tanpa scroll horizontal.

## Catatan dan batasan

- **Status alur kerja belum mengikuti pembayaran.** Pembayaran memakai alur Midtrans lama yang mengubah `orders.status` (mis. ke `in_progress`), tetapi `service_orders.stage` baru mengikutinya di Fase 6. Karena itu Fase 5 sengaja tidak menampilkan `stage`; status yang tampil di UI tetap `orders.status`. Selama itu, laporan atau kueri yang membaca `stage` langsung akan tertinggal.
- **Belum ada langkah "penjual menerima pesanan setelah dibayar".** Pesanan paket yang sudah dibayar langsung berstatus dikerjakan, seperti alur lama. Langkah penerimaan, tenggat, dan notifikasi "pesanan baru" ke penjual dibuat di Fase 6–7 (notifikasi sengaja menunggu pembayaran supaya penjual tidak menerima pesanan yang belum dibayar).
- **Komisi dikunci saat pesanan dibuat** (`fee_amount`); perubahan komisi oleh admin tidak mengubah pesanan yang sudah ada. Biaya layanan tambahan untuk pembeli belum ada (keputusan terbuka dari Fase 1).
- **Permintaan khusus** memakai alur lama: persetujuan pembeli terhadap harga penjual terjadi saat pembeli membayar, dan estimasi waktu dari penjual belum punya kolom. Tabel penawaran terpisah tidak dibuat.
- **Lampiran referensi** hanya gambar (lewat pengunggah yang ada, maks 5 MB) atau tautan https; dokumen (PDF/ZIP) belum didukung karena belum ada penyimpanan privat untuk lampiran pesanan. Pembeli sebaiknya tidak melampirkan data sensitif; tautan terbuka bagi siapa pun yang memilikinya.
- **Batas yang saya pilih** (kewajaran, bukan kebijakan): brief 10–5000 karakter, maks 5 lampiran, jumlah add-on 1–10, maks 10 pesanan belum dibayar, total waktu pengerjaan maks 730 hari, permintaan khusus: judul 5–120, deskripsi 20–4000, budget minimal Rp1.000, deadline maks 2 tahun.
- **Pembatalan pesanan belum dibayar** memakai tombol "Batalkan" yang sudah ada; sinkronisasi `stage` dan alur pembatalan lengkap ada di Fase 8.
- Branch ini ditumpuk di atas Fase 4 yang belum digabung; saat digabung ke `main` mungkin muncul konflik dengan perubahan rebranding (#34) dan dialog admin (#35). Pada file yang saya sentuh di fase ini, teks GoBi sudah disamakan dengan `main`.

## Risiko yang perlu dicek saat SQL dijalankan

1. `service_create_order` memasukkan baris ke `orders` langsung. Trigger atau constraint di tabel itu (di database Lovable, tidak ada di repo) bisa menolaknya, misalnya aturan yang hanya mengizinkan perubahan status lewat fungsi tertentu. Jika ditolak, pesan galatnya akan muncul di toast.
2. `request_service` dipanggil dinamis (`execute format`) karena tipe parameternya tidak terlihat dari repo; jika tanda tangannya berbeda dari `(uuid, text, number)`, `service_request_custom` gagal.
3. Panjang maksimum `orders.title` tidak terlihat; judul dipotong 150 karakter.
4. `order_messages` diisi dengan kolom `order_id, sender_id, body, is_system`; jika nama kolom berbeda, pembuatan pesanan gagal dan perlu disesuaikan.
5. `platform_fee` tidak dipakai; komisi dihitung dari `service_commission_percent()` (pengaturan jasa, lalu `app_settings.fee_percent`). Jika `platform_fee` punya aturan khusus (mis. minimum), hasilnya bisa berbeda satu dua rupiah.
