-- GOBI WORK — Hak penggunaan hasil pekerjaan dan ketentuan pembatalan wajib diisi oleh pembuat lowongan.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001–007.
-- Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Yang dibuat:
--   1. Kolom jobs.usage_rights dan jobs.cancellation_terms (teks, bawaan kosong supaya lowongan lama tetap valid).
--   2. Trigger: lowongan BARU (insert) dan perubahan pada dua kolom itu ditolak bila salah satunya kosong atau kurang dari
--      20 karakter. Mengubah kolom lain (mis. menutup lowongan lama yang belum punya isian) tidak terpengaruh.
--   3. work_accept_application (versi 007) menyalin kedua isian itu ke kontrak (work_contracts.usage_rights dan
--      cancellation_terms) saat client menerima lamaran, sebelumnya kolom itu diisi kosong.

begin;

-- ============ 1. Kolom baru ============
alter table public.jobs
  add column if not exists usage_rights text not null default '' check (char_length(usage_rights) <= 2000),
  add column if not exists cancellation_terms text not null default '' check (char_length(cancellation_terms) <= 2000);

-- ============ 2. Isian wajib untuk lowongan baru ============
create or replace function public._job_required_terms_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if char_length(trim(coalesce(new.usage_rights, ''))) < 20 then
    raise exception 'Hak penggunaan hasil pekerjaan wajib diisi (minimal 20 karakter)';
  end if;
  if char_length(trim(coalesce(new.cancellation_terms, ''))) < 20 then
    raise exception 'Ketentuan pembatalan wajib diisi (minimal 20 karakter)';
  end if;
  return new;
end $$;

drop trigger if exists job_required_terms_guard_trg on public.jobs;
create trigger job_required_terms_guard_trg
  before insert or update of usage_rights, cancellation_terms on public.jobs
  for each row execute function public._job_required_terms_guard();

-- ============ 3. Menerima lamaran: isian lowongan masuk ke kontrak ============
-- Sama dengan versi 007; satu-satunya beda: usage_rights dan cancellation_terms kontrak diambil dari lowongan.
create or replace function public.work_accept_application(_application_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; j record; summary jsonb; cid uuid; dl date; amt bigint; fixed boolean;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  rev_terms text; pay_terms text; scope_txt text;
begin
  perform public._work_guard();
  select * into a from public.job_applications where id = _application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id;
  if not found or j.client_id <> auth.uid() then raise exception 'Bukan lowongan kamu'; end if;
  if a.status <> 'pending' then raise exception 'Lamaran ini sudah dijawab'; end if;
  if exists (select 1 from public.work_contracts where application_id = a.id) then raise exception 'Kontrak untuk lamaran ini sudah ada'; end if;
  if exists (select 1 from public.orders where job_application_id = a.id and status not in ('cancelled', 'declined')) then
    raise exception 'Lamaran ini sudah punya pesanan langsung';
  end if;

  fixed := coalesce(j.payment_type, 'fixed') <> 'hourly';
  amt := greatest(coalesce(a.bid_amount, 0), 0)::bigint;
  if amt < 1000 then raise exception 'Penawaran minimal Rp1.000. Minta pelamar mengisi penawaran dulu.'; end if;
  dl := coalesce(a.finish_date, j.deadline::date);
  if fixed and dl is null then raise exception 'Pelamar belum menentukan tanggal selesai pekerjaan'; end if;
  if dl is not null and dl < today then raise exception 'Tanggal selesai sudah lewat'; end if;

  summary := public.work_respond_application(_application_id, true);

  scope_txt := case when length(trim(coalesce(j.description, ''))) >= 20 then left(trim(j.description), 4000) else left(j.title, 120) || ' — sesuai deskripsi lowongan.' end;
  rev_terms := case when j.revision_limit is null
    then 'Revisi tidak dibatasi jumlahnya selama masih dalam ruang lingkup pekerjaan.'
    else 'Maksimal ' || j.revision_limit || ' kali revisi. Permintaan revisi di atas batas ditolak sistem.' end;
  pay_terms := case when fixed
    then 'Client membayar lewat Midtrans setelah kedua pihak setuju; dana ditahan escrow. Jika sampai akhir hari ' || to_char(dl + 1, 'DD-MM-YYYY')
         || ' client tidak menyetujui hasil atau meminta revisi, dana otomatis diteruskan ke freelancer.'
    else 'Per jam dengan jadwal. Client menentukan hari dan jam kerja, freelancer boleh mengajukan pergantian jam. Setelah sepakat, client membayar total semua jam terjadwal di muka lewat Midtrans (escrow).' end;

  insert into public.work_contracts (job_id, application_id, client_id, freelancer_id, title, description, scope, payment_type,
      total_amount, hourly_rate, deadline, revision_terms, usage_rights, cancellation_terms, payment_terms,
      revision_limit, status, client_approved_at, schedule_mode)
  values (j.id, a.id, j.client_id, a.developer_id, j.title, left(coalesce(j.description, ''), 8000), scope_txt,
      'fixed',
      case when fixed then amt else 0 end, case when fixed then 0 else amt end,
      case when fixed then dl else null end, rev_terms,
      left(coalesce(j.usage_rights, ''), 4000), left(coalesce(j.cancellation_terms, ''), 4000), pay_terms,
      j.revision_limit,
      case when fixed then 'waiting_approval' else 'draft' end,
      case when fixed then now() else null end,
      not fixed)
  returning id into cid;

  if fixed then
    insert into public.contract_milestones (contract_id, position, title, amount, deadline, status)
    values (cid, 1, 'Pekerjaan penuh', amt, dl, 'pending');
  end if;

  perform public._work_event(cid, 'created', jsonb_build_object('from_application', a.id, 'auto', true, 'schedule', not fixed));
  if fixed then
    perform public._work_event(cid, 'sent', jsonb_build_object('auto', true));
    perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima. Setujui kesepakatan agar client bisa membayar.', '/kerja/kontrak/' || cid);
  else
    perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima. Client sedang menyusun jadwal jam kerja.', '/kerja/kontrak/' || cid);
  end if;

  return summary || jsonb_build_object('contract_id', cid);
end $$;
revoke all on function public.work_accept_application(uuid) from public, anon;
grant execute on function public.work_accept_application(uuid) to authenticated;

commit;

-- Muat ulang skema API agar kolom baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select column_name from information_schema.columns where table_name = 'jobs' and column_name in ('usage_rights','cancellation_terms');
--   select tgname from pg_trigger where tgname = 'job_required_terms_guard_trg';
