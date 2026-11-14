-- GOBI WORK — Kerja langsung (bawaan) atau per jam, tanggal selesai, batas revisi, kesepakatan dua pihak,
-- dan dana diteruskan otomatis ke freelancer bila client diam sampai 1 hari setelah tanggal selesai.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001, 002, 005
-- dan midtrans-escrow/001, 002. Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Alur yang dibuat:
--   1. Lowongan: bawaannya "Kerja langsung" (payment_type = 'fixed'). "Per jam" hanya jika pemasang mengaktifkannya.
--      Pemasang boleh menetapkan tanggal selesai (jobs.deadline, sudah ada) dan batas revisi (jobs.revision_limit, kosong = tanpa batas).
--   2. Melamar: freelancer mengisi penawaran dan TANGGAL selesai (job_applications.finish_date), tidak boleh lewat tanggal dari client.
--   3. Client menerima lamaran -> work_accept_application: lamaran diterima dan kontrak kerja dibuat otomatis (kerja langsung: satu
--      milestone sebesar penawaran; per jam: tarif per jam). Persetujuan client tercatat saat menerima.
--   4. Freelancer menyetujui (work_respond_contract, sudah ada) -> kontrak aktif -> BARU client membayar lewat Midtrans (escrow).
--   5. Freelancer mengirim hasil. Client menyetujui atau meminta revisi. Revisi ditolak bila jatah habis.
--   6. Jika sampai akhir hari tenggat+1 (WIB) client tidak menyetujui atau meminta revisi, hasil otomatis disetujui dan dana escrow
--      diteruskan ke saldo freelancer (work_auto_release). Masa tahan escrow 1 hari tetap dihormati.
--   7. Per jam: laporan jam memakai jam mulai dan jam selesai (work_submit_timesheet_range).
--
-- CATATAN: ini mengubah aturan lama "dana jasa hanya diteruskan manual oleh admin" menjadi otomatis untuk kasus client tidak menanggapi.
-- Persetujuan client tetap melewati admin_release_escrow seperti biasa; admin juga tetap bisa membekukan dana (status 'frozen' tidak diteruskan).

begin;

-- ============ 1. Kolom baru ============
alter table public.jobs
  add column if not exists revision_limit int check (revision_limit is null or revision_limit between 1 and 20);

alter table public.job_applications
  add column if not exists finish_date date;

alter table public.work_contracts
  add column if not exists revision_limit int check (revision_limit is null or revision_limit between 1 and 20),
  add column if not exists revisions_used int not null default 0 check (revisions_used >= 0);

alter table public.contract_milestones
  add column if not exists auto_approved_at timestamptz;

alter table public.work_timesheets
  add column if not exists start_time time,
  add column if not exists end_time time;

-- ============ 2. Penjaga tanggal selesai pada lamaran ============
-- Jika diisi: tidak boleh lampau dan tidak boleh melewati tanggal selesai dari client. est_days ikut disinkronkan untuk layar lama.
create or replace function public._job_app_finish_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if new.finish_date is null then return new; end if;
  select deadline::date as deadline into j from public.jobs where id = new.job_id;
  if new.finish_date < today then raise exception 'Tanggal selesai tidak boleh di masa lalu'; end if;
  if found and j.deadline is not null and new.finish_date > j.deadline then
    raise exception 'Tanggal selesai tidak boleh melewati tanggal yang ditentukan client';
  end if;
  new.est_days := greatest(1, least(365, new.finish_date - today));
  return new;
end $$;
revoke all on function public._job_app_finish_guard() from public, anon, authenticated;
drop trigger if exists job_app_finish_guard_trg on public.job_applications;
create trigger job_app_finish_guard_trg before insert or update of finish_date on public.job_applications
  for each row execute function public._job_app_finish_guard();

-- ============ 3. Menerima lamaran = kesepakatan kerja otomatis ============
-- Hasil: {accepted, positions, filled, contract_id}. Kuota posisi, peninjauan admin, dan penolakan pelamar lain
-- tetap diatur work_respond_application (005); fungsi ini hanya menambah pembuatan kontrak.
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
    else 'Tarif per jam. Freelancer melaporkan jam mulai dan jam selesai; hanya jam yang disetujui client yang ditagih. Pembayaran lewat Midtrans (escrow).' end;

  insert into public.work_contracts (job_id, application_id, client_id, freelancer_id, title, description, scope, payment_type,
      total_amount, hourly_rate, deadline, revision_terms, usage_rights, cancellation_terms, payment_terms,
      revision_limit, status, client_approved_at)
  values (j.id, a.id, j.client_id, a.developer_id, j.title, left(coalesce(j.description, ''), 8000), scope_txt,
      case when fixed then 'fixed' else 'hourly' end,
      case when fixed then amt else 0 end, case when fixed then 0 else amt end,
      dl, rev_terms, '', '', pay_terms, j.revision_limit, 'waiting_approval', now())
  returning id into cid;

  if fixed then
    insert into public.contract_milestones (contract_id, position, title, amount, deadline, status)
    values (cid, 1, 'Pekerjaan penuh', amt, dl, 'pending');
  end if;

  perform public._work_event(cid, 'created', jsonb_build_object('from_application', a.id, 'auto', true));
  perform public._work_event(cid, 'sent', jsonb_build_object('auto', true));
  perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima. Setujui kesepakatan agar client bisa membayar.', '/kerja/kontrak/' || cid);

  return summary || jsonb_build_object('contract_id', cid);
end $$;
revoke all on function public.work_accept_application(uuid) from public, anon;
grant execute on function public.work_accept_application(uuid) to authenticated;

-- ============ 4. Batas revisi ============
-- Sama dengan versi 001, ditambah: jatah revisi dan batas waktu menanggapi.
create or replace function public._work_release_due_at(_milestone_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when m.deadline is null then null else
    greatest(
      ((m.deadline + 2)::timestamp at time zone 'Asia/Jakarta'),
      coalesce((select max(s.created_at) from public.work_submissions s where s.milestone_id = m.id), '-infinity'::timestamptz) + interval '1 day'
    ) end
  from public.contract_milestones m where m.id = _milestone_id
$$;
revoke all on function public._work_release_due_at(uuid) from public, anon, authenticated;

create or replace function public.work_request_revision(_milestone_id uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; sid uuid; due timestamptz;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id for update;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if m.status <> 'submitted' then raise exception 'Tidak ada hasil yang menunggu pemeriksaan'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Jelaskan revisi yang diminta (minimal 5 karakter)'; end if;
  due := public._work_release_due_at(_milestone_id);
  if due is not null and now() >= due then
    raise exception 'Batas waktu menanggapi sudah lewat; dana diteruskan otomatis ke freelancer';
  end if;
  if c.revision_limit is not null and c.revisions_used >= c.revision_limit then
    raise exception 'Jatah revisi habis (% dari % kali). Setujui hasil atau ajukan sengketa.', c.revisions_used, c.revision_limit;
  end if;
  select id into sid from public.work_submissions where milestone_id = _milestone_id order by created_at desc limit 1;
  insert into public.work_revisions (milestone_id, submission_id, client_id, note) values (_milestone_id, sid, auth.uid(), left(_note, 4000));
  update public.work_contracts set revisions_used = revisions_used + 1, updated_at = now() where id = c.id;
  update public.contract_milestones set status = 'revision_requested', updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'revision_requested', jsonb_build_object('milestone', _milestone_id, 'used', c.revisions_used + 1, 'limit', c.revision_limit));
  perform public._work_notify(c.freelancer_id, 'revision_requested', 'Client meminta revisi', '/kerja/kontrak/' || c.id);
end $$;
revoke all on function public.work_request_revision(uuid, text) from public, anon;
grant execute on function public.work_request_revision(uuid, text) to authenticated;

-- ============ 5. Dana diteruskan otomatis ============
-- Tahap 1: hasil 'submitted' yang melewati batas -> disetujui otomatis (pesanan 'completed').
-- Tahap 2: yang sudah disetujui otomatis dan masa tahan escrow-nya selesai -> dana 'released' (trigger 002 mengubah milestone jadi 'released').
-- Dana 'frozen' / 'refunded' tidak pernah diteruskan. Milestone dalam sengketa tidak berstatus 'submitted' sehingga tidak ikut.
create or replace function public._work_auto_release(_contract_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select m.id, m.contract_id, m.order_id, c.client_id, c.freelancer_id
    from public.contract_milestones m join public.work_contracts c on c.id = m.contract_id
    where m.status = 'submitted' and c.status = 'active' and m.deadline is not null and m.order_id is not null
      and now() >= public._work_release_due_at(m.id)
      and (_contract_id is null or c.id = _contract_id)
    order by m.id
    for update of m skip locked
  loop
    perform set_config('gobi.work_internal', '1', true);
    update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = r.order_id and status in ('in_progress', 'delivered');
    perform set_config('gobi.work_internal', '', true);
    update public.contract_milestones set status = 'approved', auto_approved_at = now(), updated_at = now() where id = r.id;
    insert into public.work_contract_events (contract_id, actor_id, event, detail)
      values (r.contract_id, null, 'milestone_auto_approved', jsonb_build_object('milestone', r.id));
    perform public._work_notify(r.freelancer_id, 'work_approved', 'Client tidak menanggapi sampai batas waktu: hasil disetujui otomatis', '/kerja/kontrak/' || r.contract_id);
    perform public._work_notify(r.client_id, 'work_approved', 'Batas waktu menanggapi habis: hasil disetujui otomatis dan dana diteruskan ke freelancer', '/kerja/kontrak/' || r.contract_id);
    perform public._work_refresh_contract(r.contract_id);
    n := n + 1;
  end loop;

  for r in
    select m.id, m.contract_id, m.order_id
    from public.contract_milestones m join public.escrow_ledger l on l.order_id = m.order_id
    where m.status = 'approved' and m.auto_approved_at is not null and l.status = 'held' and now() >= l.held_until
      and (_contract_id is null or m.contract_id = _contract_id)
    order by m.id
    for update of l skip locked
  loop
    update public.escrow_ledger
      set status = 'released', released_at = now(), released_by = null,
          note = 'Otomatis: client tidak menyetujui atau meminta revisi sampai 1 hari setelah tanggal selesai', updated_at = now()
      where order_id = r.order_id and status = 'held';
    insert into public.work_contract_events (contract_id, actor_id, event, detail)
      values (r.contract_id, null, 'milestone_auto_released', jsonb_build_object('milestone', r.id, 'order', r.order_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._work_auto_release(uuid) from public, anon, authenticated;

-- Dipanggil aplikasi saat pengguna membuka kontraknya (tanpa menunggu penjadwal). Hanya memproses kontrak milik pemanggil.
create or replace function public.work_sweep_due()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is null then return 0; end if;
  for r in select id from public.work_contracts
           where status in ('active', 'completed') and (client_id = auth.uid() or freelancer_id = auth.uid()) loop
    n := n + public._work_auto_release(r.id);
  end loop;
  return n;
end $$;
revoke all on function public.work_sweep_due() from public, anon;
grant execute on function public.work_sweep_due() to authenticated;

-- ============ 6. Jam kerja memakai jam mulai dan jam selesai ============
create or replace function public.work_submit_timesheet_range(_contract_id uuid, _work_date date, _start time, _end time, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; tid uuid; hrs numeric; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id;
  if not found or c.freelancer_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.payment_type <> 'hourly' or c.status <> 'active' then raise exception 'Laporan jam hanya untuk kontrak per jam yang aktif'; end if;
  if _start is null or _end is null or _end <= _start then raise exception 'Jam selesai harus setelah jam mulai'; end if;
  if _work_date is null or _work_date > today or _work_date < today - 60 then raise exception 'Tanggal kerja tidak valid (maksimal 60 hari ke belakang)'; end if;
  if c.deadline is not null and _work_date > c.deadline then raise exception 'Tanggal kerja melewati tanggal selesai kontrak'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Catat pekerjaan yang dilakukan'; end if;
  if exists (select 1 from public.work_timesheets where contract_id = _contract_id and work_date = _work_date and status <> 'rejected'
             and start_time is not null and end_time is not null and start_time < _end and end_time > _start) then
    raise exception 'Rentang jam bertabrakan dengan catatan lain pada tanggal itu';
  end if;
  hrs := round(extract(epoch from (_end - _start)) / 3600.0, 2);
  if coalesce((select sum(hours) from public.work_timesheets where contract_id = _contract_id and work_date = _work_date and status <> 'rejected'), 0) + hrs > 24 then
    raise exception 'Total jam pada tanggal itu melebihi 24 jam';
  end if;
  insert into public.work_timesheets (contract_id, freelancer_id, work_date, hours, start_time, end_time, note)
  values (_contract_id, auth.uid(), _work_date, hrs, _start, _end, left(_note, 2000)) returning id into tid;
  perform public._work_event(_contract_id, 'timesheet_submitted', jsonb_build_object('timesheet', tid, 'hours', hrs));
  perform public._work_notify(c.client_id, 'work_submitted', 'Laporan jam kerja baru menunggu persetujuan', '/kerja/kontrak/' || _contract_id);
  return tid;
end $$;
revoke all on function public.work_submit_timesheet_range(uuid, date, time, time, text) from public, anon;
grant execute on function public.work_submit_timesheet_range(uuid, date, time, time, text) to authenticated;

commit;

-- ============ 7. Penjadwal (opsional, di luar transaksi) ============
-- Memeriksa tiap 15 menit agar dana diteruskan tepat waktu walau tak ada yang membuka aplikasi.
-- Butuh ekstensi pg_cron; jika tidak ada, lewati: aplikasi tetap menjalankan work_sweep_due() saat kontrak dibuka.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('work-auto-release', '*/15 * * * *', 'select public._work_auto_release(null)');
  else
    raise notice 'pg_cron tidak aktif: pelepasan otomatis hanya berjalan saat pengguna membuka kontrak (work_sweep_due).';
  end if;
exception when others then
  raise notice 'Penjadwal tidak terpasang: %', sqlerrm;
end $$;

-- Muat ulang skema API agar kolom dan fungsi baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select column_name from information_schema.columns where table_name in ('jobs','job_applications','work_contracts') and column_name in ('revision_limit','finish_date','revisions_used');
--   select proname from pg_proc where proname in ('work_accept_application','work_sweep_due','work_submit_timesheet_range','_work_auto_release');
--   select jobname, schedule from cron.job where jobname = 'work-auto-release';   -- hanya bila pg_cron aktif
