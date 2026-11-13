# GOBI WORK — Fase 6 (admin kerja): laporan

Branch: `feat/gobi-work`. Status: **PARTIAL** — kode sudah ditulis, belum dijalankan (tidak ada akses runtime/database dari lingkungan penulisan).

## Isi halaman `/admin/kerja`
Tab: Ringkasan, Pengguna, Lowongan, Lamaran, Kontrak, Transaksi, Pencairan, Sengketa, Laporan, Rekonsiliasi, Kategori, Pengaturan, Audit log.

| Berkas | Isi |
|---|---|
| `src/routes/admin.kerja.tsx` | Rute dan tab Ringkasan, Kontrak, Sengketa (putusan), Laporan, Rekonsiliasi, Kategori |
| `src/components/admin-work-extra.tsx` | Tab Lamaran, Transaksi, Pencairan, Audit log (hanya baca) + dialog "Bukti & riwayat" sengketa |
| `src/components/admin-work-manage.tsx` | Pengguna (blokir/buka blokir beralasan, verifikasi), Lowongan (filter dilaporkan, riwayat moderasi), Pengaturan komisi |
| `src/lib/admin-work.ts` + `.test.ts` | Pembantu murni: `safeHttpUrl`, `evidenceItems`, `pickEscrow`, `summarizeTx` |
| `src/lib/work-commission.ts` + `.test.ts` | `parseCommissionInput`, `commissionFor` |
| `docs/sql/gobi-work/004_gobi_work_settings.sql` | Tabel `work_settings`, fungsi `work_admin_set_commission` / `work_admin_clear_commission`, trigger komisi pada escrow baru |

## Izin dan keamanan
- Pembacaan memakai RLS admin yang sudah ada (`admin_read_*`, `jobs_admin_read`, `audit_admin_read`); `work_settings` hanya bisa dibaca admin dan ditulis lewat fungsi `_is_admin()`.
- Blokir/verifikasi memakai `admin_set_ban` / `admin_set_verified` yang sudah ada, lalu `admin_log_event` mencatat alasan di audit log.
- Komisi: 0–30%, wajib alasan, tercatat di audit. **Hanya** berlaku untuk pesanan GOBI WORK baru; `platform_fee()` dan pesanan jasa/karya biasa tidak diubah; tanpa nilai tersimpan perilaku lama tetap.
- Tautan bukti sengketa hanya dirender jika http(s). Nomor rekening tidak ditampilkan.

## Belum ada / keterbatasan
- Batas upload dan teks kebijakan tidak dibuat: belum ada bagian aplikasi yang membacanya (akan jadi kontrol dekoratif).
- Riwayat lowongan hanya mencatat keputusan moderasi admin; edit oleh pemilik lowongan tidak dicatat.
- Perubahan komisi tidak menghitung ulang escrow yang sudah ada.
- Tab Pengaturan akan menampilkan error sampai SQL 004 dijalankan.
- Asumsi yang harus dicek saat dijalankan: kolom `job_messages.body`, `payouts.bank_name`/`status`, tabel `user_bans`, nama relasi `escrow_ledger`/`payments` pada `orders` untuk embed PostgREST, tipe kolom `orders.fee_amount` dan `escrow_ledger.fee/net`.

## Cara menguji
1. `bun install && bun run test`, lalu lint dan typecheck.
2. Jalankan SQL `docs/sql/gobi-work/001`–`004` (berurutan) di SQL editor database.
3. Sandbox: `/admin/kerja` → Pengaturan, set komisi 7%; bayar satu milestone lewat Midtrans sandbox; cek `select gross, fee, net from escrow_ledger order by created_at desc limit 1` (fee = 7% gross) dan tab Transaksi.
4. Buka tiap tab; coba blokir lalu buka blokir satu akun uji dan periksa tab Audit log; set laporan lowongan lalu filter "Dilaporkan".
