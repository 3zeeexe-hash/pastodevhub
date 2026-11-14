# GOBI SERVICES — Laporan Fase 2 (seller dan pembuatan jasa)

Branch: `feat/gobi-services`. Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini tidak punya database maupun runtime Node). Fase 2 dibangun di atas Fase 1 yang juga belum terverifikasi.

1. **Fase:** Fase 2 — seller dan pembuatan jasa.
2. **Fitur yang dibuat:**
   - Aktivasi dan ubah profil penyedia jasa (hanya akun `developer`, wajib setuju ketentuan; profil yang dibatasi admin tidak bisa diaktifkan sendiri).
   - Dashboard seller: statistik jasa per status, filter status, aksi per status (edit, ajukan/terbitkan, jeda, aktifkan lagi, tarik ke draft, arsipkan, kembalikan ke draft, hapus draft), alasan penolakan/penahanan admin, rating gabungan bila ada ulasan.
   - Editor jasa bertab: Informasi (sampul, judul, ringkasan, deskripsi, kategori + subkategori, skill, syarat pembeli, ketentuan revisi, batas ruang lingkup), Paket (satu atau tiga paket Basic/Standard/Premium + estimasi komisi), Add-on (maks 10), FAQ (maks 10) dan Galeri (maks 8), Pratinjau.
   - Draft dan publikasi: simpan draf, daftar kekurangan sebelum diajukan, terbit langsung atau masuk `pending_review` sesuai `require_moderation`, notifikasi ke seller.
   - Edit dan nonaktifkan jasa; jasa terbit yang diedit judul/deskripsi/kategorinya kembali ke moderasi bila moderasi aktif.
3. **File baru:**
   - `docs/sql/gobi-services/002_gobi_services_seller.sql`
   - `src/lib/services-owner.ts` dan `src/lib/services-owner.test.ts`
   - `src/lib/services-db.ts`
   - `src/components/service-seller.tsx`
   - `docs/gobi-services/FASE2.md`
4. **File diubah:** `src/routes/studio.jasa.index.tsx` (dashboard baru) dan `src/routes/studio.jasa.$id.tsx` (editor baru). Tidak ada file route baru, jadi `routeTree.gen.ts` tidak berubah.
5. **Migrasi database:** `002_gobi_services_seller.sql` (idempotent, dijalankan lewat Lovable setelah 001; bukan di `supabase/migrations/` sesuai `AGENTS.md`).
6. **Endpoint (fungsi database):** `service_activate_seller`, `service_save`, `service_submit`, `service_set_status`, `service_delete_draft`. Internal: `_service_own`, `_service_require_seller`, `_service_readiness`, `_service_text`, `_service_int`, `_service_url`, `_service_text_array`, `_service_legacy_category`. Nama ini menggantikan `service_save_package` / `service_save_addon` di `RENCANA.md` bagian 7: paket, add-on, FAQ, dan galeri disimpan atomik oleh `service_save`.
7. **Permission:** semua fungsi memanggil `_service_guard()` (harus login, tidak diblokir); fungsi jasa mengunci baris dan memeriksa `owner_id = auth.uid()`; menulis jasa butuh profil penyedia aktif dan tidak dibatasi. Perpindahan status tetap dijaga trigger `_services_guard` (Fase 1): pemilik tidak bisa menerbitkan jasa yang butuh moderasi atau membuka jasa yang ditahan admin. Tabel anak (paket, add-on, FAQ, galeri) tidak punya hak tulis langsung bagi klien.
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-owner.test.ts` (aksi per status, konsistensi aksi dengan aturan trigger, kelengkapan jasa, parsing skill dan fitur).
9. **Hasil test:** belum ada. Jalankan `bun run test` dan `bun run build` (untuk memeriksa tipe).
10. **Bug ditemukan:** tidak ada dari eksekusi. Dari pembacaan kode, lihat catatan di bawah.
11. **Bug diperbaiki:** tidak ada.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 001 lalu 002 (sandbox dulu); teks ketentuan penyedia di `SELLER_TERMS` perlu ditinjau pemilik platform.
13. **Kesiapan Fase 3:** **belum siap** sampai SQL 001 + 002 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus.

## Uji manual yang perlu dijalankan

1. Akun `developer`: buka `/studio/jasa`, aktifkan profil penyedia. Akun `client` harus melihat pesan penolakan.
2. Buat jasa: isi tab Informasi + Paket, simpan draf, muat ulang (data harus kembali utuh), lalu terbitkan. Jasa harus muncul di `/jasa`; harga "Mulai" dan estimasi hari harus mengikuti paket termurah.
3. Draft **tidak** boleh tampil di `/jasa`. Ganti ke `pending_review` (nyalakan `require_moderation` lewat `service_admin_set_setting`) — jasa tidak boleh tampil sampai admin menyetujui (Fase 3).
4. Dengan akun lain, panggil `service_save` / `service_set_status` / `service_delete_draft` pada jasa milik orang lain — harus ditolak ("Jasa tidak ditemukan").
5. Jeda lalu aktifkan lagi jasa terbit; arsipkan lalu kembalikan ke draft; hapus draft.
6. Jasa lama (dibuat di Studio sebelum fase ini) harus tetap tampil dan bisa dibuka di editor baru (paket kosong, tidak ada galat).
7. Tampilan ponsel: tab bisa digeser, tombol aksi menempel di bawah, tidak ada scroll horizontal.

## Catatan dan batasan

- **Studio lama diganti.** Form lama menulis langsung ke `services` (insert, update, delete). Form baru hanya lewat fungsi. RLS lama pada `services` tidak ada di repo, jadi pemilik mungkin masih bisa `delete`/`update` langsung lewat API; trigger Fase 1 menutup celah status, tetapi `delete` langsung perlu dicek dan, bila perlu, ditutup lewat Lovable.
- **Tipe Supabase.** Tabel dan fungsi baru dipanggil lewat `looseDb` (tanpa tipe) sampai Lovable meregenerasi `types.ts`. Setelah itu `looseDb` bisa diganti klien bertipe.
- **Batas angka** yang saya pilih sebagai pagar kewajaran, bukan kebijakan bisnis: paket 1–365 hari, revisi 0–99, fitur maks 12 per paket, add-on dan FAQ maks 10, galeri maks 8, deskripsi minimal 30 karakter untuk diajukan. Ubah di SQL 002 dan `services-owner.ts` bila perlu.
- **Belum ada:** penautan portofolio ke galeri (kolom `portfolio_item_id` sudah ada), menonaktifkan profil penyedia (butuh pemeriksaan pesanan aktif, Fase 7), dan notifikasi ke admin untuk jasa baru (Fase 3). Kategori lama (`services.category`) tetap diisi otomatis dari kategori baru supaya halaman `/jasa` yang ada tetap konsisten; pemetaannya ada di `_service_legacy_category`.
- **Moderasi ulang** saat jasa terbit diedit hanya aktif bila `require_moderation = true`.
- Halaman publik `/jasa/$id` belum menampilkan paket dan add-on baru (Fase 4).
