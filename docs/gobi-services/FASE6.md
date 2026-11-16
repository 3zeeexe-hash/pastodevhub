# GOBI SERVICES — Laporan Fase 6 (pembayaran dan transaksi)

Branch: `feat/gobi-services-fase6` (dari `main` setelah PR #42). Status: **kode dan SQL selesai ditulis; belum dijalankan, dikompilasi, atau diuji** (lingkungan ini tidak punya database, runtime Node, maupun akun Midtrans). Fase 6 memasang trigger di tabel inti pembayaran (`orders`, `payments`, `escrow_ledger`), jadi **uji di sandbox dulu**.

Keputusan desain utama: **tidak ada sistem pembayaran baru**. Repo sudah punya Midtrans Core API, webhook terverifikasi, escrow, dan payout manual (`docs/sql/midtrans-escrow/`). Fase ini menyambungkan pesanan paket ke jalur itu. Peta lengkap ada di `docs/gobi-services/PAYMENT.md`.

1. **Fase:** Fase 6 — pembayaran dan transaksi.
2. **Fitur yang dibuat:**
   - **Status alur kerja mengikuti pembayaran** (`service_orders.stage`): pembayaran dimulai → `payment_processing`; kedaluwarsa/dibatalkan/ditolak → kembali `awaiting_payment`; lunas → `paid` → `in_progress` (mulai dan tenggat terisi); hasil dikirim → `submitted`; revisi → `revision_requested`; selesai → `completed`; batal → `cancelled`. Setiap perubahan tercatat di `service_order_events`.
   - **Notifikasi** ke penjual ("pesanan baru sudah dibayar") dan pembeli ("pembayaran diterima"), hasil dikirim, revisi diminta, dan pesanan selesai. Tidak ganda saat webhook dikirim ulang (`dedupe_key`).
   - **Komisi jasa benar-benar dipakai**: dikunci di `service_orders.commission_fee` saat pesanan dibuat, dan dipertahankan di `orders.fee_amount` serta `escrow_ledger` meski fungsi lama menimpanya dengan `platform_fee`.
   - **Jatah revisi paket ditegakkan database**: permintaan revisi ditolak bila jatah habis; `revisions_used` bertambah otomatis.
   - **Penghitung pesanan selesai** (`services.orders_completed`) naik saat pesanan selesai, sehingga kartu jasa menampilkan "N selesai".
   - **Tab Transaksi di `/admin/jasa`**: rekonsiliasi (delapan jenis ketidaksesuaian, yang menyangkut uang ditandai mendesak) dan daftar transaksi dengan filter status, tanggal, dan pencarian. Hanya membaca; rilis dana, refund, dan payout tetap di halaman admin yang sudah ada.
   - **Rincian pesanan** menampilkan status alur kerja, riwayat pembayaran (status, metode, nominal, referensi Midtrans), dan komisi serta jumlah yang diterima untuk penjual.
3. **File baru:**
   - `docs/sql/gobi-services/006_gobi_services_payments.sql`
   - `src/lib/services-payment.ts` dan `src/lib/services-payment.test.ts`
   - `src/components/admin-service-transactions.tsx`
   - `docs/gobi-services/PAYMENT.md`
   - `docs/gobi-services/FASE6.md`
4. **File diubah:** `src/routes/admin.jasa.tsx` (tab Transaksi) dan `src/components/service-order-summary.tsx` (status, pembayaran, komisi).
5. **Migrasi database:** `006_gobi_services_payments.sql` (idempotent, setelah 001–005 dan `midtrans-escrow/001`): kolom `service_orders.commission_fee`; trigger pada `service_orders`, `orders` (tiga), `payments`, dan `escrow_ledger`; fungsi internal `_service_try_move`, `_service_on_paid`, dan pembantu trigger; dua fungsi admin.
6. **Endpoint (fungsi database):** `service_admin_transactions(_status, _q, _from, _to, _limit, _offset)` dan `service_admin_reconcile()`, keduanya khusus admin. Webhook, charge, release, refund, dan payout memakai fungsi yang sudah ada (tidak diubah).
7. **Permission:** fungsi admin menolak non-admin di database. Riwayat pembayaran terbaca oleh pembeli, penjual, dan admin lewat RLS `payments` yang sudah ada. Tidak ada jalur untuk mengubah status pembayaran, escrow, atau payout dari fitur jasa; trigger hanya menggerakkan `stage` mengikuti data yang sudah sah.
8. **Test yang dijalankan:** belum ada. Ditulis `src/lib/services-payment.test.ts` (status transaksi, refund tidak dianggap selesai sebelum escrow ditandai refund, nilai bersih, kesesuaian stage, rangkaian transisi pembayaran penuh, rekonsiliasi).
9. **Hasil test:** belum ada. Jalankan `bun run test` dan `bun run build`.
10. **Bug ditemukan:** (a) di draf pertama tes ada satu baris yang tidak bermakna; sudah dirapikan. (b) Temuan dari membaca SQL Midtrans: fungsi lama menimpa `fee_amount` dengan `platform_fee`, sehingga komisi jasa Fase 1 tidak akan terpakai tanpa penanganan; sudah ditangani lewat trigger.
11. **Bug diperbaiki:** lihat butir 10.
12. **Konfigurasi yang masih dibutuhkan:** jalankan SQL 006 setelah 001–005 (dan SQL Midtrans/escrow yang dijalankan manual oleh owner); kunci Midtrans, `midtrans_enabled`, dan URL webhook di dashboard Midtrans bila belum.
13. **Kesiapan Fase 7:** **belum siap** sampai SQL 001–006 berjalan tanpa galat, tes dan build lulus, dan uji manual di bawah lulus. Jangan mengklaim pembayaran nyata aktif sebelum diuji di sandbox lalu produksi.

## Uji manual yang perlu dijalankan (sandbox Midtrans)

1. Buat pesanan paket (Fase 5), buka `/pesanan/<id>`, mulai pembayaran VA/QRIS: `stage` menjadi `payment_processing`, riwayat mencatat "Pembayaran dimulai".
2. Biarkan kedaluwarsa atau batalkan lewat simulator: `stage` kembali `awaiting_payment`. Buat percobaan baru: kembali `payment_processing` (percobaan lama berstatus `superseded` tidak membuat masalah).
3. Selesaikan pembayaran lewat simulator Midtrans: pesanan `in_progress`, escrow `held`, `stage` `in_progress`, `started_at`/`due_at` terisi, penjual dan pembeli masing-masing mendapat **satu** notifikasi.
4. **Idempotensi webhook:** kirim ulang notifikasi settlement yang sama: tidak ada escrow, event, atau notifikasi ganda (`already_paid`).
5. **Komisi:** atur komisi jasa (mis. 10%) sebelum membuat pesanan; setelah dibayar, `service_orders.commission_fee`, `orders.fee_amount`, dan `escrow_ledger.fee` sama dengan 10% dari total (bukan `platform_fee`). Ubah komisi sesudahnya: pesanan yang sudah ada tidak berubah. Tanpa komisi jasa: sama dengan komisi global.
6. Penjual mengirim hasil → `submitted`; pembeli minta revisi → `revision_requested` dan `revisions_used` + 1; setelah jatah habis, permintaan revisi ditolak dengan pesan yang jelas; kirim ulang → `submitted`; tandai selesai → `completed`, `orders_completed` jasa + 1, penjual diberi tahu. Rilis dana oleh admin berjalan seperti sebelumnya.
7. Batalkan pesanan yang belum dibayar: `stage` `cancelled`.
8. Tab Transaksi: transaksi muncul dengan status, komisi, dan nilai bersih yang benar; filter status/tanggal/pencarian bekerja; akun non-admin yang memanggil fungsinya ditolak. Rekonsiliasi kosong pada jalur normal; setelah merusak data sengaja (mis. ubah `stage` manual) muncul `stage_stale`.
9. **Pesanan lama tidak terpengaruh:** pesanan jasa lama (tanpa paket), pembelian karya, dan lowongan tetap memakai `platform_fee`, tanpa baris `service_orders`, dan tanpa perubahan perilaku.
10. **Isolasi galat:** pembayaran harus tetap tercatat dan escrow terbentuk walaupun lapisan jasa bermasalah (galat muncul sebagai `sync_error` di rekonsiliasi, bukan menggagalkan webhook).

## Catatan dan batasan

- **Ini perubahan pada jalur uang.** Trigger dipasang di `orders`, `payments`, dan `escrow_ledger`. Semua trigger yang menyentuh pembayaran dibungkus penanganan galat supaya tidak menggagalkan webhook; satu-satunya penolakan yang disengaja adalah jatah revisi. Tetap uji di sandbox sebelum produksi.
- **Pesanan paket yang dibuat sebelum SQL 006** (mis. saat uji Fase 5) tidak otomatis disinkronkan: `stage`-nya bisa tertinggal bila sudah dibayar. Rekonsiliasi menandainya (`stage_stale`); perbaiki manual atau buat ulang di sandbox. Komisi pesanan lama di-backfill dari nilai pesanan.
- **Belum ada langkah "penjual menerima atau menolak" setelah dibayar.** Pesanan langsung `in_progress`, seperti alur lama. Langkah penerimaan, penolakan dengan refund, dan pengingat tenggat adalah Fase 7.
- **Refund dan chargeback dari Midtrans** membekukan escrow dan menandai `needs_refund` (perilaku lama); `stage` tidak berubah sendiri. Penyelesaiannya (`refunded` atau `partially_refunded`) menyusul bersama sengketa di Fase 9–10.
- **Refund dan payout tetap manual.** Tidak ada refund atau payout otomatis lewat API; payout hanya "berhasil" setelah admin menandainya.
- **Biaya provider (MDR) belum dicatat**, jadi "nilai bersih" = dibayar dikurangi komisi GoBi. Biaya layanan tambahan untuk pembeli belum ada (keputusan terbuka sejak Fase 1).
- **Ledger:** memakai `escrow_ledger`, `payment_events`, dan `admin_audit_log` yang sudah ada; tidak dibuat tabel `service_transactions`/`service_ledger_entries` (duplikat).
- Tidak ada hasil uji menunjukkan bahwa kunci Midtrans, webhook, dan pembayaran nyata sudah aktif; itu bergantung pada konfigurasi owner.
