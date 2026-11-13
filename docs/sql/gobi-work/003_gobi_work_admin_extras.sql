-- GOBI WORK — Fase 6–7: pelengkap kecil. Jalankan MANUAL di SQL editor database SETELAH 001 dan 002. Aman dijalankan ulang.
--
--   * Admin boleh membaca semua lowongan (termasuk yang menunggu moderasi / ditolak) untuk halaman /admin/kerja.
--     Kebijakan SELECT bersifat menambah (permissive): tidak mengurangi akses yang sudah ada.
--   * Indeks untuk pesan belum dibaca, tagihan per kontrak, dan daftar sengketa/laporan.

begin;

drop policy if exists jobs_admin_read on public.jobs;
create policy jobs_admin_read on public.jobs for select to authenticated using (public._is_admin());

create index if not exists job_messages_unread_idx on public.job_messages (application_id) where read_at is null;
create index if not exists work_milestones_contract_idx on public.contract_milestones (contract_id, position);
create index if not exists work_submissions_contract_idx on public.work_submissions (contract_id, created_at);
create index if not exists work_timesheets_billing_idx on public.work_timesheets (contract_id, status) where billed_order_id is null;

commit;

notify pgrst, 'reload schema';

-- Cek cepat:
--   select policyname from pg_policies where tablename = 'jobs' and policyname = 'jobs_admin_read';
