# GOBI SERVICES — Laporan Fase 1 (analisis dan fondasi)

Branch: `feat/gobi-services`. Status: **kode dan dokumen selesai ditulis; SQL dan tes belum dijalankan** (lingkungan ini tidak punya akses database maupun runtime).

1. **Fase:** Fase 1 — analisis dan fondasi.
2. **Fitur yang dibuat:** analisis repo, pemetaan master prompt ke repo, desain skema (20 tabel baru + perluasan `services`), RLS baca, pengaman status jasa (trigger), mesin status pesanan 13 tahap dengan riwayat, fungsi admin (kategori, subkategori, pengaturan, komisi), aturan murni TypeScript (status jasa, validasi paket, harga + komisi, kuota revisi, hak aksi pesanan).
3. **File baru:**
   - `docs/gobi-services/RENCANA.md`
   - `docs/gobi-services/FASE1.md`
   - `docs/sql/gobi-services/001_gobi_services_core.sql`
   - `src/lib/services.ts`
   - `src/lib/services.test.ts`
4. **File diubah:** tidak ada.
5. **Migrasi database:** `docs/sql/gobi-services/001_gobi_services_core.sql` (idempotent; dijalankan lewat Lovable sesuai `AGENTS.md`, bukan di `supabase/migrations/`). Tabel baru: `service_categories, service_subcategories, service_settings, service_seller_profiles, service_packages, service_addons, service_gallery, service_faqs, service_favorites, service_orders, service_order_items, service_order_events, service_requirements, service_submissions, service_revisions, service_reviews, service_disputes, service_dispute_evidence, service_reports, service_notifications`. Tabel diperluas: `services` (13 kolom). Tidak dibuat karena duplikat: transaksi/ledger/payout/log admin/pesan pesanan (lihat RENCANA bagian 4).
6. **Endpoint (fungsi database):** `service_admin_set_category`, `service_admin_set_subcategory`, `service_admin_set_setting`, `service_admin_clear_commission`, `service_mark_notifications_read`, `service_public_config`, `service_commission_percent`, `service_visible`, `service_can_manage`. Internal: `_service_guard`, `_service_notify` (dengan dedupe), `_service_stage_ok`, `_service_move_stage`, `_service_owner_move_ok`, `_services_guard` (trigger). Peta endpoint lengkap per fase ada di RENCANA bagian 7.
7. **Permission:** matriks di RENCANA bagian 6. Ditegakkan di database: RLS baca di semua tabel baru, tulis ditutup untuk klien, trigger pada `services`, fungsi admin memeriksa `_is_admin()`.
8. **Test yang dijalankan:** belum ada yang dijalankan. Ditulis: `src/lib/services.test.ts` (harga + komisi, paket, status jasa, transisi status pesanan, kuota revisi, hak aksi).
9. **Hasil test:** belum ada hasil. Jalankan `bun run test`.
10. **Bug ditemukan:** tidak ada dari eksekusi (belum dijalankan). Dari pembacaan kode: lihat risiko #1 dan #2 di RENCANA bagian 10.
11. **Bug diperbaiki:** tidak ada.
12. **Konfigurasi yang masih dibutuhkan:** menjalankan SQL 001 lewat Lovable (sandbox dulu); keputusan terbuka di RENCANA bagian 10 (biaya layanan pembeli, izin admin granular, penyelesaian otomatis, syarat akun penjual, kebijakan usia).
13. **Kesiapan Fase 2:** **belum siap** sampai tiga hal selesai: (a) SQL 001 dijalankan tanpa galat, (b) uji manual jalur `services` lama lulus (buat, nonaktifkan, sembunyikan oleh admin), (c) `bun run test` hijau. Pemeriksaan sesuai pengujian Fase 1 di master prompt: *migration berjalan* — belum diuji; *permission berjalan* — belum diuji; *fitur existing tidak rusak* — belum diuji.
