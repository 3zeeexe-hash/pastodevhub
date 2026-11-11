# Midtrans Core API + escrow saldo

SQL di folder ini dijalankan **manual oleh owner** (bukan lewat Lovable). Sengaja ada di `docs/`, bukan di `supabase/migrations/` atau `drizzle/` (lihat `AGENTS.md`).

## Cara pasang

1. Buka SQL editor database proyek, tempel seluruh isi `001_midtrans_escrow.sql`, lalu jalankan sekali. Aman diulang.
2. Cek hasilnya:
   ```sql
   select count(*) from public.payments;        -- harus 0, tanpa error
   select * from public.developer_wallet('00000000-0000-0000-0000-000000000000');  -- boleh kosong
   ```
3. Buka `/admin/midtrans`, isi **Server Key** dan **Client Key** sandbox dari dashboard Midtrans, pilih mode **Sandbox**, aktifkan, lalu klik **Tes koneksi**.
4. (Cadangan) Di dashboard Midtrans: Settings → Configuration → **Payment Notification URL**, isi URL yang tampil di `/admin/midtrans`. Setiap permintaan bayar sudah mengirim URL notifikasi sendiri lewat header `X-Override-Notification`, jadi langkah ini hanya cadangan.
5. Uji di sandbox: buat pesanan jasa → developer terima + harga → client klik **Bayar** → bayar lewat simulator Midtrans (https://simulator.sandbox.midtrans.com). Pesanan harus berubah ke **Sedang dikerjakan** dan dana tampil sebagai **Ditahan** di `/admin/escrow`.
6. Setelah semua lancar, simpan key produksi, ganti mode ke **Produksi**.

## Aturan saldo

| Jenis | Saat dibayar | Kapan masuk saldo developer |
| --- | --- | --- |
| Karya (beli) | Ditahan admin 1 hari | Otomatis tersedia setelah 1 hari (admin bisa membekukan jika ada sengketa) |
| Jasa | Ditahan admin | Hanya setelah: developer mengirim hasil, client menerima (tidak ada revisi), lewat 1 hari, **dan admin menekan "Teruskan saldo"**. Tidak pernah otomatis. |

Admin dapat membekukan, menandai refund, dan semua tindakannya tercatat di `admin_audit_log` (lihat `/admin/pantau`).

## Alur callback

`POST /api/midtrans/notification` → verifikasi `signature_key` (SHA-512) → cek ulang ke API status Midtrans → cocokkan nominal → `midtrans_apply_notification` (idempoten). Notifikasi ganda tidak memproses dua kali. Pembayaran ganda atau refund dari Midtrans otomatis ditandai **perlu refund** / dana dibekukan.

## Yang perlu dicek setelah dijalankan

- Fungsi `midtrans_apply_notification` mengubah status pesanan langsung (`awaiting_payment` → `in_progress` untuk jasa, `completed` untuk karya). Kalau database menolak (trigger/aturan lama di tabel `orders`), salin pesan errornya dari `payment_events` / log server dan kirim ke saya.
- Bagian 10 mencabut `request_payout` lama agar saldo tidak dihitung dua kali. Pencairan sekarang lewat `request_wallet_payout`.
- Bagian 11 (backfill pesanan lama) opsional dan dikomentari.

## Batasan versi ini

- Pelepasan dana jasa tidak punya batas waktu otomatis jika client tidak pernah menerima. Admin bisa memantau dan menindaklanjuti di `/admin/pantau`.
- Refund ke pembeli dilakukan manual di dashboard Midtrans; aplikasi hanya menandai status.
- Pembayaran untuk lamaran lowongan (`jobs`) belum memakai alur ini; lowongan dan chat-nya sudah bisa dipantau admin.
