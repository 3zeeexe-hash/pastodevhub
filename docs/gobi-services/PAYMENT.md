# GOBI SERVICES — Adapter pembayaran

Master prompt meminta "Payment Adapter" supaya provider bisa diganti atau ditambah tanpa mengubah seluruh sistem. Di repo ini batas itu **sudah ada** dan dipakai bersama jasa, karya, dan lowongan; GOBI SERVICES tidak membuat jalur pembayaran kedua. Dokumen ini memetakan tanggung jawab adapter ke kode yang ada, dan menyebut jujur apa yang belum otomatis.

## Status provider

- **Provider:** Midtrans Core API (Virtual Account BCA/BNI/BRI/Permata dan QRIS). Mode `sandbox` atau `production` disimpan di `platform_secrets` (`midtrans_mode`); kunci server disimpan terenkripsi dan hanya dibaca server. Tidak ada rahasia di frontend.
- **Mode simulasi** = sandbox Midtrans. Tidak ada saldo atau pembayaran palsu di kode aplikasi.
- **Escrow:** dana yang lunas masuk ke akun Midtrans platform dan dicatat di `escrow_ledger`. Dana **ditahan oleh platform** dan dilepas **manual oleh admin** (`admin_release_escrow`). Ini escrow buatan platform, bukan layanan escrow dari provider; jangan menyebutnya sebagai fitur provider.
- **Refund dan payout manual:** refund dikerjakan admin di dashboard Midtrans lalu ditandai di aplikasi (`admin_set_escrow` aksi `refund`); pencairan ke developer adalah transfer bank manual oleh admin (`payouts`). Tidak ada refund atau payout otomatis lewat API.

## Peta tanggung jawab adapter

| Tanggung jawab (master prompt) | Implementasi yang ada | Catatan |
|---|---|---|
| Invoice | Baris `orders` (nomor `#number`) dibuat `service_create_order` (Fase 5), status awal `awaiting_payment` | Tidak ada PDF invoice terpisah |
| Membuat pembayaran | Server function Midtrans (charge VA/QRIS) lalu `midtrans_record_charge` | Memeriksa pembeli, status `awaiting_payment`, dan nominal sama dengan pesanan |
| Verifikasi webhook | Route `POST /api/midtrans/notification` | Signature SHA-512, cek ulang ke API status Midtrans, nominal harus cocok |
| Idempotensi | `midtrans_apply_notification` | Percobaan `paid` yang diulang dikembalikan `already_paid`; `midtrans_order_id` unik; semua notifikasi tercatat di `payment_events` |
| Reference ID provider | `payments.midtrans_order_id` | Ditampilkan di riwayat pembayaran |
| Ledger yang dapat diaudit | `escrow_ledger` + `payment_events` + `admin_audit_log` | Tabel ini hanya bisa ditulis fungsi database |
| Komisi | `service_commission_percent()` (Fase 1) dikunci ke `service_orders.commission_fee` saat pesanan dibuat (Fase 6) | Lihat bagian "Komisi" |
| Riwayat transaksi | `payments` (RLS: pembeli, penjual, admin); tab Transaksi di `/admin/jasa` | Fase 6 |
| Rekonsiliasi | `service_admin_reconcile()` | Fase 6, hanya membaca |
| Refund | `admin_set_escrow(..., 'refund')` setelah refund di Midtrans | Manual |
| Payout | `request_wallet_payout` (developer) + proses manual admin di `/admin/pembayaran` | Payout "berhasil" hanya setelah admin menandai transfer selesai |

### Menambah provider lain

Jalur yang perlu diduplikasi untuk provider baru: (1) fungsi server pembuat charge, (2) route webhook yang memverifikasi signature provider dan mengecek ulang ke API-nya, (3) fungsi database setara `midtrans_record_charge` dan `midtrans_apply_notification` yang memakai tabel yang sama (`payments`, `payment_events`, `escrow_ledger`). Karena status pesanan jasa mengikuti tabel `payments` dan `orders` lewat trigger (bukan lewat Midtrans secara langsung), lapisan GOBI SERVICES tidak perlu diubah selama provider baru menulis ke tabel yang sama dengan status yang sama.

## Cara status pesanan jasa mengikuti pembayaran (Fase 6)

Trigger di database, tanpa mengubah fungsi pembayaran yang ada (`docs/sql/gobi-services/006_gobi_services_payments.sql`):

| Kejadian | Pemicu | Perubahan `service_orders.stage` |
|---|---|---|
| Pembayaran dimulai (percobaan `pending` dibuat) | insert `payments` | `awaiting_payment` → `payment_processing` |
| Percobaan kedaluwarsa, dibatalkan, ditolak, atau gagal dan tidak ada percobaan lain | update `payments.status` | `payment_processing` → `awaiting_payment` |
| Notifikasi lunas diproses | `orders.status` → `in_progress` | `paid` → `in_progress`; `started_at`, `accepted_at`, `due_at` terisi; notifikasi ke penjual dan pembeli (sekali) |
| Penjual mengirim hasil | `orders.status` → `delivered` | `submitted` |
| Pembeli meminta revisi | `delivered` → `in_progress` | `revision_requested`, `revisions_used` + 1 |
| Pembeli menandai selesai | `orders.status` → `completed` | `completed`, `services.orders_completed` + 1, notifikasi ke penjual |
| Pesanan dibatalkan | `orders.status` → `cancelled` | `cancelled` |
| Refund atau chargeback dari Midtrans | `midtrans_apply_notification` membekukan escrow dan menandai `needs_refund` | **Tidak berubah otomatis**; muncul di rekonsiliasi sampai admin menanganinya |

Transisi yang tidak sah menurut mesin status tidak menggagalkan pembayaran: dicatat sebagai `sync_skipped` di `service_order_events` dan muncul di rekonsiliasi (`stage_stale`). Galat tak terduga dicatat sebagai `sync_error`; webhook tetap berhasil.

## Komisi

`midtrans_apply_notification` menghitung komisi dengan `platform_fee()` dan menimpa `orders.fee_amount` saat pembayaran lunas. Supaya komisi khusus jasa (`service_settings.commission_percent`, Fase 1) benar-benar dipakai, SQL 006:

1. menyimpan komisi saat pesanan paket dibuat di `service_orders.commission_fee`;
2. mengembalikan `orders.fee_amount` ke nilai itu bila fungsi lama menimpanya (trigger `before update of fee_amount`);
3. mengisi `escrow_ledger.fee` dan `net` dari nilai itu (trigger `before insert`).

Hasilnya: komisi dikunci saat pesanan dibuat; perubahan komisi oleh admin hanya berlaku untuk pesanan baru. Bila komisi jasa tidak diatur, nilainya mengikuti `app_settings.fee_percent` (sama dengan komisi global). Pesanan lama, karya, dan lowongan tidak tersentuh.

Contoh: harga Rp500.000, komisi 5% → komisi Rp25.000, developer menerima Rp475.000 (sebelum biaya lain).

## Kebutuhan integrasi (belum tentu terpenuhi)

- Kunci Midtrans (server dan client) untuk mode yang dipakai, `midtrans_enabled = true`, dan URL webhook `…/api/midtrans/notification` didaftarkan di dashboard Midtrans. Tanpa ini pembayaran belum aktif; **jangan mengklaim pembayaran nyata sudah aktif sebelum diuji di sandbox lalu produksi**.
- Biaya provider (MDR) tidak dikirim Midtrans dalam notifikasi, sehingga belum dicatat; "nilai bersih" di dashboard admin = dibayar dikurangi komisi GoBi.
