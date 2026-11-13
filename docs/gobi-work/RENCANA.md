# GOBI WORK — analisis repo & rencana implementasi

Dokumen ini hasil pemeriksaan repo `pastodevhub` (Fase 1 dari master prompt GOBI WORK).
Branch kerja: `feat/gobi-work` (sengaja bukan branch utama yang tersinkron ke Lovable).

## 1. Temuan repo

| Area | Yang sudah ada |
|---|---|
| Stack | TanStack Start + React + Vite, deploy Cloudflare (`wrangler.jsonc`), Supabase (Lovable Cloud), Tailwind + shadcn/ui, Vitest |
| Auth & role | Email/Google/GitHub; `profiles.account_type` (`client` / `developer`); admin via `has_role` + `_is_admin()` + login admin server-side |
| Lowongan | `jobs`, `job_applications`, `job_messages`; halaman `lowongan.index/baru/$id`; aturan di `src/lib/jobs.ts`; RPC `respond_job_application`, `withdraw_job_application`, `create_order_from_application` |
| Chat kerja | `ApplicationThread` (`job_messages`) per lamaran — dipakai ulang, tidak dibuat chat baru |
| Pembayaran | Midtrans Core API + escrow: `orders`, `payments`, `payment_events`, `escrow_ledger`, `payouts`, `developer_wallet()`, `request_wallet_payout()`, webhook diverifikasi server (`midtrans.server.ts`) |
| Admin | `/admin/*` (pengguna, moderasi, escrow, pembayaran, midtrans, laporan, verifikasi, fitur) + `admin_audit_log` / `_audit()` |
| SEO | `seo.functions.ts`, sitemap, JSON-LD untuk lowongan |

## 2. Aturan proyek yang dipatuhi (`AGENTS.md`)

- Skema database **dikelola Lovable**: tidak menambah/mengubah `supabase/migrations/` atau `drizzle/`. SQL baru ditaruh di `docs/sql/gobi-work/` (konvensi yang sama dengan `docs/sql/midtrans-escrow/`), lalu dijalankan lewat Lovable.
- Perubahan status order/payout/lamaran/unduhan lewat fungsi `SECURITY DEFINER`; klien hanya membaca.
- Tidak ada escrow buatan sendiri: dana tetap lewat Midtrans + `escrow_ledger` yang sudah ada.

## 3. Pemetaan master prompt → repo

| Master prompt | Keputusan |
|---|---|
| `jobs`, `job_applications`, `application_messages` | Pakai `jobs`, `job_applications`, `job_messages`. `jobs` hanya ditambah kolom (jenis, metode kerja, lokasi, pengalaman, sistem bayar, posisi, moderasi) |
| `work_transactions`, `work_ledger_entries`, `work_payouts` | **Tidak dibuat** — duplikat `payments`, `escrow_ledger`, `payouts`. Milestone terhubung ke `orders` lewat `contract_milestones.order_id` |
| `work_admin_logs` | **Tidak dibuat** — pakai `admin_audit_log` + `_audit()` |
| `job_skills` | Tetap `jobs.skills text[]` (sudah dipakai filter/kartu) |
| Tabel baru | `job_categories`, `work_profiles`, `work_contracts`, `work_contract_events`, `contract_milestones`, `work_submissions`, `work_revisions`, `work_timesheets`, `work_reviews`, `work_reports`, `work_disputes`, `work_notifications` |

## 4. Fase

- **Fase 1 (branch ini):** analisis, skema + RLS + fungsi status di `docs/sql/gobi-work/001_gobi_work_core.sql`, aturan murni `src/lib/work.ts` + `work.test.ts`.
- **Fase 2:** filter Explore Jobs (jenis/metode/lokasi/pengalaman/budget/urutan), form lowongan lengkap + preview, status lamaran lanjutan (viewed/shortlisted/interview). *Butuh definisi `respond_job_application` dan tipe kolom `job_applications.status` dari database asli sebelum diubah.*
- **Fase 3:** dashboard client & freelancer, notifikasi `work_notifications` di UI.
- **Fase 4:** UI kontrak, milestone, kirim hasil, revisi, persetujuan, timesheet.
- **Fase 5:** `create_order_from_milestone` (membuat `orders` per milestone, nominal dari milestone di server), penandaan `funded` hanya dari pembayaran terverifikasi, komisi dari pengaturan admin.
- **Fase 6:** halaman admin kerja (moderasi lowongan, kontrak, sengketa, laporan, analitik), keputusan sengketa yang menggerakkan `admin_set_escrow`.
- **Fase 7:** tes menyeluruh, responsif, optimasi.

## 5. Cara menjalankan Fase 1

1. Kirim isi `docs/sql/gobi-work/001_gobi_work_core.sql` ke Lovable (atau jalankan di SQL editor Supabase) — skrip idempotent (`if not exists` / `or replace`).
2. `bun install && bun run test` untuk menjalankan `src/lib/work.test.ts`.
3. Setelah skema aktif, regenerasi tipe Supabase (Lovable melakukannya otomatis).

## 6. Belum dikerjakan / risiko

- Belum ada UI GOBI WORK; belum ada kode yang menyentuh tabel baru.
- SQL dan tes **belum dijalankan** dari lingkungan ini (tidak ada akses ke database atau runtime).
- Asumsi yang perlu dicek saat SQL dijalankan: kolom `job_applications.bid_amount`, `jobs.client_id`, `jobs.deadline`, `orders.buyer_id/seller_id/amount/status`, fungsi `is_banned(_user)`, `_require_server_proof()`.
- Untuk lowongan `hourly`, `bid_amount` ditafsirkan sebagai tarif per jam.
