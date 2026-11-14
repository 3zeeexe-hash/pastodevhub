# GOBI SERVICES — Laporan Fase 3 (admin moderasi jasa)

Branch: `feat/gobi-services`. Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini tidak punya database maupun runtime Node). Fase 3 dibangun di atas Fase 1 dan 2 yang juga belum terverifikasi.

1. **Fase:** Fase 3 — admin moderasi jasa.
2. **Fitur yang dibuat:**
   - Halaman `/admin/jasa` (menu baru "GOBI SERVICES" di navigasi admin) dengan empat tab: Ringkasan, Jasa & antrean, Pengaturan, Audit log.
   - Antrean moderasi: daftar jasa dengan filter status (default "Menunggu moderasi", urut paling lama dulu), kategori, pencarian judul/penjual, dan pagination.
   - Detail jasa untuk admin: sampul, galeri, deskripsi, skill, paket, add-on, FAQ, syarat/ketentuan, profil penjual, jumlah laporan terbuka, kekurangan kelengkapan, dan riwayat status.
   - Keputusan: **Setujui** (terbit), **Tolak** (status Ditolak + alasan), **Minta perbaikan** (kembali ke draft + catatan), **Tahan jasa** (dijeda, pemilik tidak bisa membukanya), **Buka tahanan**. Semua selain Setujui wajib beralasan minimal 10 karakter.
   - Pengaturan moderasi: saklar "Wajib moderasi sebelum jasa terbit" dengan alasan wajib. Saat mati, jasa lengkap langsung terbit (moderasi otomatis hanya jika admin yang mengonfigurasi).
   - Riwayat status per jasa dicatat otomatis oleh trigger (siapa, kapan, dari/ke status, catatan), dan aksi admin juga masuk `admin_audit_log`.
   - Notifikasi keputusan ke seller (disimpan di `service_notifications`) dan kartu "Notifikasi" di dashboard seller; catatan perbaikan/penolakan/penahanan tampil di baris jasa.
3. **File baru:**
   - `docs/sql/gobi-services/003_gobi_services_moderation.sql`
   - `src/lib/services-admin.ts` dan `src/lib/services-admin.test.ts`
   - `src/components/admin-services.tsx`
   - `src/routes/admin.jasa.tsx`
   - `docs/gobi-services/FASE3.md`
4. **File diubah:** `src/routes/admin.tsx` (menu GOBI SERVICES) dan `src/routes/studio.jasa.index.tsx` (notifikasi + catatan admin).
5. **Migrasi database:** `003_gobi_services_moderation.sql` (idempotent, setelah 001 dan 002). Tabel baru `service_moderation_events`; trigger `services_log`; fungsi `service_submit` diganti versi baru (mencatat aksi `submitted`).
6. **Endpoint (fungsi database):** `service_admin_moderate(_service_id, _action, _note)`, `service_admin_stats()`, `service_admin_list(...)`, `service_admin_detail(_id)`; semuanya khusus admin (`_is_admin()`).
7. **Permission:** fungsi admin menolak non-admin di database. Riwayat status hanya terbaca oleh pemilik jasa dan admin (`service_can_manage`). Pemilik tidak bisa membuka jasa yang ditahan admin (trigger Fase 1). Persetujuan diblokir bila jasa belum lengkap (cek `_service_readiness`).
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-admin.test.ts` (aksi per status, wajib alasan, label riwayat, konsistensi dengan aturan trigger pemilik).
9. **Hasil test:** belum ada. Jalankan `bun run test` dan `bun run build`.
10. **Bug ditemukan:** tidak ada dari eksekusi. Lihat catatan di bawah.
11. **Bug diperbaiki:** tidak ada.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 003 setelah 001 dan 002; regenerasi `src/routeTree.gen.ts` (lihat catatan).
13. **Kesiapan Fase 4:** **belum siap** sampai SQL 001–003 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus.

## Uji manual yang perlu dijalankan

1. Nyalakan moderasi di `/admin/jasa` tab Pengaturan (alasan wajib; cek tercatat di Audit log).
2. Sebagai seller, ajukan jasa lengkap: statusnya harus **Ditinjau**, **tidak tampil** di `/jasa`, dan seller melihat notifikasi "menunggu moderasi".
3. Sebagai admin: jasa muncul di antrean (urut paling lama). Buka detail, **Setujui**: jasa tampil di `/jasa`, seller dapat notifikasi, riwayat mencatat aksi.
4. Ajukan jasa lain lalu uji **Tolak** dan **Minta perbaikan**: tanpa alasan atau alasan < 10 karakter harus ditolak; dengan alasan, catatan muncul di baris jasa seller (Ditolak / Draft + "Perbaikan diminta admin") dan seller bisa mengajukan ulang.
5. **Tahan** jasa terbit: hilang dari `/jasa`, seller tidak bisa mengaktifkannya lagi (tombol hilang; pemanggilan `service_set_status` langsung harus ditolak). **Buka tahanan** mengembalikannya.
6. Akun non-admin memanggil `service_admin_moderate`, `service_admin_list`, `service_admin_detail`, `service_admin_stats` secara langsung: harus ditolak "Khusus admin".
7. Memanggil aksi dua kali (mis. Setujui jasa yang sudah terbit): harus ditolak "tidak sedang menunggu moderasi", tidak membuat notifikasi ganda.
8. Menyetujui jasa tanpa paket (mis. jasa lama yang diedit saat moderasi aktif): harus ditolak dengan daftar kekurangan.
9. Tampilan ponsel: filter membungkus, kartu jasa menumpuk satu kolom, dialog detail bisa digulir.

## Catatan dan batasan

- **Route baru.** `src/routes/admin.jasa.tsx` adalah file route baru, tetapi `src/routeTree.gen.ts` belum saya ubah (file hasil generate). Plugin TanStack Router mengisinya otomatis saat `bun run dev` atau `build`; commit hasilnya setelah itu. Sebelum diregenerasi, pengecekan tipe `Link`/route untuk `/admin/jasa` bisa gagal.
- **"Minta perbaikan" tidak punya status sendiri.** Master prompt hanya menyebut enam status jasa, jadi permintaan perbaikan mengembalikan jasa ke `draft` dengan catatan admin. Catatan itu tampil di dashboard seller, tetapi **belum** di halaman editor (`/studio/jasa/$id`).
- **Pengajuan ulang menghapus catatan lama** (`service_submit` mengosongkan `moderation_note`); riwayat lengkap tetap ada di `service_moderation_events`.
- **Notifikasi untuk admin belum ada.** Admin melihat jumlah antrean di tab Ringkasan dan daftar; tidak ada notifikasi per jasa baru karena tabel peran admin tidak terlihat dari repo.
- **Satu peran admin.** Semua admin bisa melakukan semua aksi moderasi dan mengubah saklar moderasi; izin granular masih keputusan terbuka (lihat `RENCANA.md` bagian 10).
- **Ringkasan admin** belum memuat total pembeli, pesanan, transaksi, komisi, refund, dan payout tertunda: datanya belum ada sampai Fase 5–9. Tab Ringkasan sengaja hanya menampilkan angka yang sudah nyata.
- **Laporan jasa** (`service_reports`) baru dihitung di detail; pengajuan dan penanganan laporan adalah Fase 10.
- **Moderasi ulang saat edit** (jasa terbit yang diubah judul/deskripsi/kategorinya) berasal dari Fase 2 dan hanya berlaku saat moderasi aktif; admin akan melihatnya di antrean sebagai pengajuan baru.
- Kategori, subkategori, komisi, dan penyelesaian otomatis sudah punya fungsi admin (Fase 1) tetapi belum punya halaman admin; menyusul di Fase 9.
