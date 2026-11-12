# Midtrans Core API + escrow saldo

SQL di folder ini dijalankan **manual oleh owner** (bukan lewat Lovable). Sengaja ada di `docs/`, bukan di `supabase/migrations/` atau `drizzle/` (lihat `AGENTS.md`).

## Cara pasang

1. Buka SQL editor database proyek, tempel seluruh isi `001_midtrans_escrow.sql`, lalu jalankan sekali. Aman diulang. Untuk alur lowongan berbayar, jalankan juga `002_lowongan_pesanan.sql` sesudahnya (juga aman diulang).
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

## Alur lowongan (`002_lowongan_pesanan.sql`)

Client menerima lamaran di halaman lowongan, lalu klik **Buat pesanan & bayar**. Itu membuat pesanan jasa yang terhubung ke lamaran (`orders.job_application_id`, satu lamaran satu pesanan) dan membuka halaman pesanan, tempat tombol **Bayar** memunculkan pop-up Midtrans. Setelah itu alurnya sama dengan jasa biasa: dana ditahan, developer mengirim hasil, client menerima atau minta revisi, admin meneruskan saldo secara manual.

- Penawaran developer minimal Rp1.000: pesanan langsung berstatus **Menunggu pembayaran** dengan harga penawaran.
- Penawaran "Nego" (Rp0): pesanan berstatus **Menunggu jawaban developer**. Developer menetapkan harga final lewat tombol **Terima** yang sudah ada, baru client membayar.
- Sebelum SQL ini dijalankan, tombol **Buat pesanan & bayar** akan menampilkan error dari database dan halaman lowongan lain tetap normal.

## Yang perlu dicek setelah dijalankan

- Fungsi `midtrans_apply_notification` mengubah status pesanan langsung (`awaiting_payment` → `in_progress` untuk jasa, `completed` untuk karya). Kalau database menolak (trigger/aturan lama di tabel `orders`), salin pesan errornya dari `payment_events` / log server dan kirim ke saya.
- Bagian 10 mencabut `request_payout` lama agar saldo tidak dihitung dua kali. Pencairan sekarang lewat `request_wallet_payout`.
- Bagian 11 (backfill pesanan lama) opsional dan dikomentari.

## Batasan versi ini

- Pelepasan dana jasa tidak punya batas waktu otomatis jika client tidak pernah menerima. Admin bisa memantau dan menindaklanjuti di `/admin/pantau`.
- Refund ke pembeli dilakukan manual di dashboard Midtrans; aplikasi hanya menandai status.
- Halaman pesanan tidak lagi menampilkan transfer manual + unggah bukti untuk pesanan baru; semua pembayaran lewat Midtrans supaya selalu masuk escrow. Pesanan lama yang sudah berstatus "Pembayaran diverifikasi admin" tetap bisa disetujui admin seperti sebelumnya.
- `002_lowongan_pesanan.sql` memasukkan baris baru ke `orders` lewat fungsi. Jika database menolak (trigger atau aturan lama yang tidak terlihat dari kode, mis. mewajibkan `service_id` untuk pesanan jasa), salin pesan errornya dan kirim ke saya. Alur ini belum diuji pada database asli.
