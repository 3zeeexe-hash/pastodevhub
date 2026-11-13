# GOBI WORK — Fase 6 (admin kerja): laporan

Branch: `feat/gobi-work`. Status: **PARTIAL** — kode sudah ditulis, belum dijalankan (tidak ada akses runtime/database dari lingkungan penulisan).

## Sudah ada sebelum sesi ini
- `src/routes/admin.kerja.tsx` dengan tab Ringkasan, Lowongan (moderasi), Kontrak, Sengketa (putusan), Laporan, Rekonsiliasi, Kategori.
- Fungsi database `work_admin_*` (SQL 001/002/003), audit lewat `_audit()`.

## Ditambahkan di sesi ini
| Berkas | Isi |
|---|---|
| `src/components/admin-work-extra.tsx` | Tab Pengguna, Lamaran, Transaksi, Pencairan, Audit log (semua hanya baca) + dialog "Bukti & riwayat" sengketa |
| `src/lib/admin-work.ts` | Pembantu murni: `safeHttpUrl`, `evidenceItems`, `pickEscrow`, `summarizeTx` |
| `src/lib/admin-work.test.ts` | Tes vitest untuk pembantu di atas |
| `src/routes/admin.kerja.tsx` | Menambah tab baru dan tombol "Bukti & riwayat" pada sengketa |

## Izin dan keamanan
- Tidak ada SQL baru. Semua pembacaan memakai RLS admin yang sudah ada (`admin_read_*` di midtrans-escrow/001, `jobs_admin_read` di gobi-work/003, `audit_admin_read`).
- Tab baru tidak mengubah data. Aksi uang tetap di `/admin/escrow` dan `/admin/pembayaran`; moderasi/sengketa/laporan tetap lewat fungsi `work_admin_*`.
- Tautan bukti sengketa hanya dirender jika http(s); `rel="noopener noreferrer nofollow"`.
- Nomor rekening tidak ditampilkan pada tab Pencairan.

## Belum dikerjakan (dari master prompt Fase 6)
- Pengaturan: komisi, biaya, batas upload, kebijakan. Lokasi pengaturan komisi (`platform_fee`) belum diperiksa; perlu keputusan sebelum menambah UI.
- Riwayat perubahan lowongan dan filter "dilaporkan" pada tab Lowongan.
- Suspend/verifikasi langsung dari tab Pengguna (saat ini tautan ke `/admin/pengguna`).
- Asumsi yang harus dicek saat dijalankan: kolom `job_messages.body`, nama relasi `escrow_ledger` dan `payments` pada `orders` untuk embed PostgREST, kolom `payouts.bank_name`/`status`.

## Cara menguji
1. `bun install && bun run test` (menjalankan `admin-work.test.ts`), lalu `bun run lint` dan typecheck.
2. Jalankan SQL `docs/sql/gobi-work/001`, `002`, `003` jika belum.
3. Masuk `/admin` → GOBI WORK; buka tiap tab, pastikan tidak ada error; buka "Bukti & riwayat" pada sebuah sengketa.
