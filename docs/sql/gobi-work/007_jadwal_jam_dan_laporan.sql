-- GOBI WORK — Per jam dengan jadwal: client menentukan hari dan jam, freelancer bisa mengajukan pergantian jam,
-- setelah sepakat client membayar TOTAL semua jam terjadwal di muka (escrow), baru pekerjaan dimulai.
-- Ditambah alasan laporan baru (pekerjaan tidak diselesaikan, dana tertahan, tidak responsif).
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001–006
-- dan midtrans-escrow/001, 002. Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Alur lowongan per jam (jobs.payment_type = 'hourly'):
--   1. Client menerima lamaran -> work_accept_application membuat kontrak berstatus DRAFT (schedule_mode = true).
--      Tarif per jam = penawaran pelamar.
--   2. Client menyusun sesi kerja (tanggal + jam mulai + jam selesai): work_add_slot / work_remove_slot.
--   3. Client mengirim jadwal: work_send_schedule_contract -> satu milestone "Jam kerja terjadwal" sebesar total jam x tarif,
--      kontrak berstatus waiting_approval, persetujuan client tercatat.
--   4. Freelancer menyetujui (work_respond_contract, sudah ada) ATAU mengajukan pergantian jam per sesi
--      (work_request_slot_change). Client menerima/menolak (work_decide_slot_change); bila diterima, sesi dan total ikut berubah.
--      Freelancer tidak bisa menyetujui kontrak selama masih ada permintaan perubahan yang belum dijawab.
--   5. Setelah kontrak aktif, client membayar milestone lewat Midtrans (alur milestone yang sudah ada), lalu pekerjaan dimulai.
--      Jadwal terkunci setelah ada tagihan/pembayaran.
--   6. Hasil dikirim, disetujui/direvisi, dan dana diteruskan otomatis bila client diam (SQL 006) — memakai milestone yang sama.
--
-- Kontrak jadwal disimpan sebagai payment_type = 'fixed' (satu milestone) supaya seluruh alur bayar, revisi, sengketa, dan
-- pelepasan dana otomatis yang sudah teruji ikut berlaku tanpa mengubah fungsi lama. Kontrak per jam lama (timesheet) tetap berjalan.

begin;

-- ============ 1. Kolom dan tabel ============
alter table public.work_contracts
  add column if not exists schedule_mode boolean not null default false;

create table if not exists public.work_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists work_schedule_slots_idx on public.work_schedule_slots (contract_id, work_date, start_time);

create table if not exists public.work_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  slot_id uuid not null references public.work_schedule_slots(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  new_date date not null,
  new_start time not null,
  new_end time not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (new_end > new_start)
);
create unique index if not exists work_schedule_changes_one_pending on public.work_schedule_changes (slot_id) where status = 'pending';
create index if not exists work_schedule_changes_idx on public.work_schedule_changes (contract_id, created_at desc);

-- Akses baca hanya untuk pihak kontrak (dan admin). Tulis hanya lewat fungsi di bawah.
do $$
declare t text;
begin
  foreach t in array array['work_schedule_slots','work_schedule_changes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists work_schedule_slots_read on public.work_schedule_slots;
create policy work_schedule_slots_read on public.work_schedule_slots for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists work_schedule_changes_read on public.work_schedule_changes;
create policy work_schedule_changes_read on public.work_schedule_changes for select to authenticated using (public.can_access_contract(contract_id));

-- ============ 2. Pembantu internal ============
-- Memeriksa satu sesi: tanggal tidak lampau (WIB), jam selesai setelah jam mulai, 30 menit sampai 12 jam, tidak bertabrakan. Mengembalikan jumlah jam.
create or replace function public._work_check_slot(_cid uuid, _date date, _start time, _end time, _exclude uuid default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare hrs numeric; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if _date is null or _start is null or _end is null then raise exception 'Isi tanggal, jam mulai, dan jam selesai'; end if;
  if _date < today then raise exception 'Tanggal kerja tidak boleh di masa lalu'; end if;
  if _end <= _start then raise exception 'Jam selesai harus setelah jam mulai (di hari yang sama)'; end if;
  hrs := round((extract(epoch from (_end - _start)))::numeric / 3600.0, 2);
  if hrs > 12 then raise exception 'Satu sesi maksimal 12 jam'; end if;
  if hrs < 0.5 then raise exception 'Satu sesi minimal 30 menit'; end if;
  if exists (select 1 from public.work_schedule_slots s
             where s.contract_id = _cid and s.work_date = _date and (_exclude is null or s.id <> _exclude)
               and s.start_time < _end and s.end_time > _start) then
    raise exception 'Jam bertabrakan dengan sesi lain pada tanggal itu';
  end if;
  return hrs;
end $$;
revoke all on function public._work_check_slot(uuid, date, time, time, uuid) from public, anon, authenticated;

-- Menghitung ulang total jam dan nilai kontrak dari semua sesi; milestone yang belum dibayar ikut disesuaikan.
create or replace function public._work_recalc_schedule(_cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; th numeric; amt bigint; last_d date;
begin
  select * into c from public.work_contracts where id = _cid;
  select coalesce(sum(hours), 0), max(work_date) into th, last_d from public.work_schedule_slots where contract_id = _cid;
  if th <= 0 then return; end if;
  amt := round(th * c.hourly_rate)::bigint;
  update public.work_contracts set total_amount = amt, deadline = last_d, updated_at = now() where id = _cid;
  update public.contract_milestones set amount = greatest(amt, 1), deadline = last_d, updated_at = now()
    where contract_id = _cid and status in ('pending', 'awaiting_payment');
end $$;
revoke all on function public._work_recalc_schedule(uuid) from public, anon, authenticated;

-- Jadwal terkunci bila milestone sudah dibayar/berjalan atau sudah ada tagihan yang belum dibatalkan.
create or replace function public._work_schedule_locked(_cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contract_milestones where contract_id = _cid and status not in ('pending', 'awaiting_payment', 'cancelled'))
      or exists (select 1 from public.orders o join public.contract_milestones m on m.id = o.work_milestone_id
                 where m.contract_id = _cid and o.status not in ('cancelled', 'declined'))
$$;
revoke all on function public._work_schedule_locked(uuid) from public, anon, authenticated;

-- ============ 3. Menerima lamaran: per jam = kontrak draft berjadwal ============
-- Sama dengan versi 006; bedanya hanya cabang per jam (schedule_mode, status draft, tanpa milestone sampai jadwal dikirim).
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
      case when fixed then dl else null end, rev_terms, '', '', pay_terms,
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

-- ============ 4. Client menyusun jadwal ============
create or replace function public.work_add_slot(_contract_id uuid, _date date, _start time, _end time)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; hrs numeric; sid uuid;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if not c.schedule_mode then raise exception 'Bukan kontrak per jam terjadwal'; end if;
  if c.status <> 'draft' then raise exception 'Jadwal hanya bisa diubah saat kontrak masih draft'; end if;
  if (select count(*) from public.work_schedule_slots where contract_id = _contract_id) >= 60 then raise exception 'Maksimal 60 sesi per kontrak'; end if;
  hrs := public._work_check_slot(_contract_id, _date, _start, _end, null);
  insert into public.work_schedule_slots (contract_id, work_date, start_time, end_time, hours)
  values (_contract_id, _date, _start, _end, hrs) returning id into sid;
  perform public._work_event(_contract_id, 'schedule_slot_added', jsonb_build_object('slot', sid, 'date', _date, 'hours', hrs));
  return sid;
end $$;
revoke all on function public.work_add_slot(uuid, date, time, time) from public, anon;
grant execute on function public.work_add_slot(uuid, date, time, time) to authenticated;

create or replace function public.work_remove_slot(_slot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; c record;
begin
  perform public._work_guard();
  select * into s from public.work_schedule_slots where id = _slot_id;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = s.contract_id for update;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if c.status <> 'draft' then raise exception 'Jadwal hanya bisa diubah saat kontrak masih draft'; end if;
  delete from public.work_schedule_slots where id = _slot_id;
  perform public._work_event(c.id, 'schedule_slot_removed', jsonb_build_object('slot', _slot_id));
end $$;
revoke all on function public.work_remove_slot(uuid) from public, anon;
grant execute on function public.work_remove_slot(uuid) to authenticated;

-- Mengirim jadwal ke freelancer: membuat satu milestone sebesar total jam x tarif dan mencatat persetujuan client.
create or replace function public.work_send_schedule_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; n int; th numeric; last_d date; amt bigint; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if not c.schedule_mode then raise exception 'Bukan kontrak per jam terjadwal'; end if;
  if c.status <> 'draft' then raise exception 'Kontrak sudah dikirim'; end if;
  if c.hourly_rate <= 0 then raise exception 'Tarif per jam belum ada'; end if;
  select count(*), coalesce(sum(hours), 0), max(work_date) into n, th, last_d from public.work_schedule_slots where contract_id = _contract_id;
  if n = 0 then raise exception 'Tambahkan minimal satu sesi jam kerja'; end if;
  if exists (select 1 from public.work_schedule_slots where contract_id = _contract_id and work_date < today) then
    raise exception 'Ada sesi yang tanggalnya sudah lewat. Ubah atau hapus dulu.';
  end if;
  amt := round(th * c.hourly_rate)::bigint;
  if amt < 1000 then raise exception 'Total pembayaran minimal Rp1.000'; end if;
  if exists (select 1 from public.contract_milestones where contract_id = _contract_id and status <> 'pending') then
    raise exception 'Milestone sudah berjalan; jadwal tidak bisa dikirim ulang';
  end if;
  delete from public.contract_milestones where contract_id = _contract_id and status = 'pending';
  insert into public.contract_milestones (contract_id, position, title, description, amount, deadline, status)
  values (_contract_id, 1, 'Jam kerja terjadwal', 'Pembayaran di muka untuk seluruh jam kerja yang disepakati.', amt, last_d, 'pending');
  update public.work_contracts
    set total_amount = amt, deadline = last_d, status = 'waiting_approval', client_approved_at = now(), freelancer_approved_at = null,
        version = version + 1, updated_at = now(),
        payment_terms = 'Client membayar total ' || th || ' jam x tarif per jam di muka lewat Midtrans (escrow) setelah freelancer setuju. '
          || 'Dana ditahan dan diteruskan ke freelancer setelah hasil disetujui; jika sampai akhir hari ' || to_char(last_d + 1, 'DD-MM-YYYY')
          || ' client tidak menanggapi, dana otomatis diteruskan.'
    where id = _contract_id;
  perform public._work_event(_contract_id, 'schedule_sent', jsonb_build_object('hours', th, 'amount', amt, 'sessions', n));
  perform public._work_notify(c.freelancer_id, 'contract_new', 'Jadwal jam kerja menunggu persetujuanmu', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_send_schedule_contract(uuid) from public, anon;
grant execute on function public.work_send_schedule_contract(uuid) to authenticated;

-- ============ 5. Freelancer mengajukan pergantian jam ============
create or replace function public.work_request_slot_change(_slot_id uuid, _new_date date, _new_start time, _new_end time, _note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; c record; cid uuid;
begin
  perform public._work_guard();
  select * into s from public.work_schedule_slots where id = _slot_id;
  if not found then raise exception 'Sesi tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = s.contract_id for update;
  if c.freelancer_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if not c.schedule_mode or c.status not in ('waiting_approval', 'active') then raise exception 'Pergantian jam hanya sebelum pembayaran'; end if;
  if public._work_schedule_locked(c.id) then raise exception 'Jam kerja sudah dibayar atau ada tagihan: jadwal terkunci'; end if;
  perform public._work_check_slot(c.id, _new_date, _new_start, _new_end, _slot_id);
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan pergantian jam'; end if;
  begin
    insert into public.work_schedule_changes (contract_id, slot_id, requested_by, new_date, new_start, new_end, note)
    values (c.id, _slot_id, auth.uid(), _new_date, _new_start, _new_end, left(_note, 1000)) returning id into cid;
  exception when unique_violation then
    raise exception 'Sesi ini sudah punya permintaan perubahan yang menunggu jawaban client';
  end;
  perform public._work_event(c.id, 'slot_change_requested', jsonb_build_object('change', cid, 'slot', _slot_id));
  perform public._work_notify(c.client_id, 'contract_rejected', 'Freelancer mengajukan pergantian jam kerja', '/kerja/kontrak/' || c.id);
  return cid;
end $$;
revoke all on function public.work_request_slot_change(uuid, date, time, time, text) from public, anon;
grant execute on function public.work_request_slot_change(uuid, date, time, time, text) to authenticated;

create or replace function public.work_cancel_slot_change(_change_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ch record;
begin
  perform public._work_guard();
  select * into ch from public.work_schedule_changes where id = _change_id for update;
  if not found or ch.requested_by <> auth.uid() then raise exception 'Permintaan tidak ditemukan'; end if;
  if ch.status <> 'pending' then raise exception 'Permintaan sudah dijawab'; end if;
  update public.work_schedule_changes set status = 'withdrawn', decided_at = now() where id = _change_id;
  perform public._work_event(ch.contract_id, 'slot_change_withdrawn', jsonb_build_object('change', _change_id));
end $$;
revoke all on function public.work_cancel_slot_change(uuid) from public, anon;
grant execute on function public.work_cancel_slot_change(uuid) to authenticated;

create or replace function public.work_decide_slot_change(_change_id uuid, _accept boolean, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare ch record; c record; hrs numeric;
begin
  perform public._work_guard();
  select * into ch from public.work_schedule_changes where id = _change_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = ch.contract_id for update;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if ch.status <> 'pending' then raise exception 'Permintaan sudah dijawab'; end if;
  if _accept then
    if public._work_schedule_locked(c.id) then raise exception 'Sudah ada tagihan atau pembayaran: jadwal terkunci'; end if;
    hrs := public._work_check_slot(c.id, ch.new_date, ch.new_start, ch.new_end, ch.slot_id);
    update public.work_schedule_slots
      set work_date = ch.new_date, start_time = ch.new_start, end_time = ch.new_end, hours = hrs, updated_at = now()
      where id = ch.slot_id;
    perform public._work_recalc_schedule(c.id);
    update public.work_schedule_changes set status = 'accepted', decision_note = nullif(left(coalesce(_note, ''), 1000), ''), decided_at = now() where id = _change_id;
    perform public._work_event(c.id, 'slot_change_accepted', jsonb_build_object('change', _change_id));
    perform public._work_notify(ch.requested_by, 'contract_approved', 'Client menyetujui pergantian jam kerja', '/kerja/kontrak/' || c.id);
  else
    if length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan penolakan'; end if;
    update public.work_schedule_changes set status = 'rejected', decision_note = left(_note, 1000), decided_at = now() where id = _change_id;
    perform public._work_event(c.id, 'slot_change_rejected', jsonb_build_object('change', _change_id));
    perform public._work_notify(ch.requested_by, 'contract_rejected', 'Client menolak pergantian jam kerja', '/kerja/kontrak/' || c.id);
  end if;
end $$;
revoke all on function public.work_decide_slot_change(uuid, boolean, text) from public, anon;
grant execute on function public.work_decide_slot_change(uuid, boolean, text) to authenticated;

-- Freelancer tidak boleh menyetujui kontrak selama masih ada permintaan perubahan jam yang menunggu jawaban client.
create or replace function public._work_schedule_activation_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.schedule_mode and old.status = 'waiting_approval' and new.status = 'active'
     and exists (select 1 from public.work_schedule_changes where contract_id = new.id and status = 'pending') then
    raise exception 'Masih ada permintaan perubahan jam yang belum dijawab client';
  end if;
  return new;
end $$;
drop trigger if exists work_schedule_activation_guard_trg on public.work_contracts;
create trigger work_schedule_activation_guard_trg before update of status on public.work_contracts
  for each row execute function public._work_schedule_activation_guard();

-- ============ 6. Alasan laporan baru ============
-- Untuk kasus pekerjaan tidak diselesaikan atau dana tertahan, dilaporkan oleh client maupun freelancer.
alter table public.work_reports drop constraint if exists work_reports_reason_check;
alter table public.work_reports add constraint work_reports_reason_check
  check (reason in ('fraud', 'spam', 'abuse', 'policy', 'other', 'not_completed', 'funds_held', 'non_response'));

commit;

notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select column_name from information_schema.columns where table_name = 'work_contracts' and column_name = 'schedule_mode';
--   select proname from pg_proc where proname in ('work_add_slot','work_remove_slot','work_send_schedule_contract','work_request_slot_change','work_decide_slot_change','work_cancel_slot_change');
--   select conname from pg_constraint where conname = 'work_reports_reason_check';
