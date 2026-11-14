-- GOBI WORK — Setelah client menerima freelancer, client LANGSUNG menyiapkan kontrak lalu mengirimnya ke freelancer.
-- Kontrak berjalan hanya setelah freelancer menyetujui. Kontrak yang belum lengkap tidak bisa dikirim.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001–008.
-- Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Alur baru:
--   1. Client menerima lamaran -> work_accept_application membuat kontrak berstatus DRAFT (kerja langsung maupun per jam).
--      Sebelumnya kerja langsung langsung dikirim otomatis ke freelancer tanpa client menyiapkannya. Client mendapat notifikasi
--      "Siapkan kontrak" dan aplikasi membawanya ke halaman kontrak.
--      Isian awal dari lowongan: ruang lingkup (deskripsi), ketentuan revisi, hak penggunaan hasil, ketentuan pembatalan,
--      ketentuan pembayaran, tanggal selesai, dan satu milestone "Pekerjaan penuh" sebesar penawaran. Semua bisa diubah client.
--   2. Client melengkapi dan menyimpan ketentuan (work_update_contract_terms), mengatur nilai dan milestone / jadwal jam.
--   3. Client mengirim (work_send_contract / work_send_schedule_contract). Kontrak yang belum lengkap DITOLAK database dengan
--      daftar bagian yang kurang (_work_contract_missing).
--   4. Freelancer menyetujui (work_respond_contract, sudah ada) -> kontrak aktif -> client membayar lewat Midtrans (escrow).
--      Jika freelancer meminta perubahan, kontrak kembali ke draft dan client memperbaikinya lalu mengirim ulang.
--
-- Syarat lengkap (sama dengan src/lib/contract-completeness.ts):
--   ruang lingkup >= 20 karakter, ketentuan revisi >= 10, hak penggunaan hasil >= 20, ketentuan pembatalan >= 20,
--   ketentuan pembayaran >= 10, serta tanggal selesai (tidak lampau) untuk kerja langsung. Nilai dan milestone/jadwal diperiksa
--   oleh fungsi kirim seperti sebelumnya.
--
-- Catatan: work_send_schedule_contract tidak lagi menimpa ketentuan pembayaran yang sudah ditulis client.

begin;

-- ============ 1. Pemeriksa kelengkapan ============
-- Panjang teks tanpa spasi, tab, dan baris baru di awal/akhir (sama dengan trim() di TypeScript).
create or replace function public._work_text_len(_t text)
returns int language sql immutable as $$
  select char_length(btrim(coalesce(_t, ''), E' \t\r\n'))
$$;
revoke all on function public._work_text_len(text) from public, anon, authenticated;

create or replace function public._work_contract_missing(_contract_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare c record; m text[] := '{}'; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into c from public.work_contracts where id = _contract_id;
  if not found then return array['kontrak tidak ditemukan']; end if;
  if public._work_text_len(c.scope) < 20 then m := m || 'ruang lingkup pekerjaan (minimal 20 karakter)'; end if;
  if public._work_text_len(c.revision_terms) < 10 then m := m || 'ketentuan revisi (minimal 10 karakter)'; end if;
  if public._work_text_len(c.usage_rights) < 20 then m := m || 'hak penggunaan hasil pekerjaan (minimal 20 karakter)'; end if;
  if public._work_text_len(c.cancellation_terms) < 20 then m := m || 'ketentuan pembatalan (minimal 20 karakter)'; end if;
  if public._work_text_len(c.payment_terms) < 10 then m := m || 'ketentuan pembayaran (minimal 10 karakter)'; end if;
  if c.payment_type = 'fixed' and not coalesce(c.schedule_mode, false) then
    if c.deadline is null then m := m || 'tanggal selesai';
    elsif c.deadline < today then m := m || 'tanggal selesai (sudah lewat)'; end if;
  end if;
  return m;
end $$;
revoke all on function public._work_contract_missing(uuid) from public, anon, authenticated;

-- ============ 2. Client mengubah ketentuan kontrak (hanya saat draft) ============
-- Boleh disimpan sebagian; kelengkapan diperiksa saat kontrak dikirim. Untuk kontrak per jam terjadwal, tanggal selesai
-- mengikuti sesi terakhir sehingga parameter _deadline diabaikan.
create or replace function public.work_update_contract_terms(
  _contract_id uuid, _scope text, _revision_terms text, _usage_rights text,
  _cancellation_terms text, _payment_terms text, _deadline date default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record; today date := (now() at time zone 'Asia/Jakarta')::date; new_deadline date;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draft' then raise exception 'Ketentuan hanya bisa diubah saat kontrak masih draft'; end if;
  if char_length(coalesce(_scope, '')) > 4000 or char_length(coalesce(_revision_terms, '')) > 4000
     or char_length(coalesce(_usage_rights, '')) > 4000 or char_length(coalesce(_cancellation_terms, '')) > 4000
     or char_length(coalesce(_payment_terms, '')) > 4000 then
    raise exception 'Setiap ketentuan maksimal 4000 karakter';
  end if;
  if coalesce(c.schedule_mode, false) then
    new_deadline := c.deadline;
  else
    if _deadline is not null and _deadline < today then raise exception 'Tanggal selesai tidak boleh di masa lalu'; end if;
    new_deadline := _deadline;
  end if;
  update public.work_contracts
    set scope = btrim(coalesce(_scope, ''), E' \t\r\n'),
        revision_terms = btrim(coalesce(_revision_terms, ''), E' \t\r\n'),
        usage_rights = btrim(coalesce(_usage_rights, ''), E' \t\r\n'),
        cancellation_terms = btrim(coalesce(_cancellation_terms, ''), E' \t\r\n'),
        payment_terms = btrim(coalesce(_payment_terms, ''), E' \t\r\n'),
        deadline = new_deadline, updated_at = now()
    where id = _contract_id;
  -- Milestone yang tenggatnya masih mengikuti tanggal selesai lama ikut berpindah ke tanggal baru.
  if not coalesce(c.schedule_mode, false) and new_deadline is distinct from c.deadline then
    update public.contract_milestones set deadline = new_deadline, updated_at = now()
      where contract_id = _contract_id and status = 'pending' and deadline is not distinct from c.deadline;
  end if;
  perform public._work_event(_contract_id, 'terms_updated', '{}'::jsonb);
end $$;
revoke all on function public.work_update_contract_terms(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.work_update_contract_terms(uuid, text, text, text, text, text, date) to authenticated;

-- ============ 3. Kirim kontrak: wajib lengkap ============
-- Sama dengan versi 001; bedanya hanya pemeriksaan kelengkapan.
create or replace function public.work_send_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; s bigint; n int; miss text[];
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draft' then raise exception 'Kontrak sudah dikirim'; end if;
  miss := public._work_contract_missing(_contract_id);
  if coalesce(array_length(miss, 1), 0) > 0 then
    raise exception 'Kontrak belum lengkap. Lengkapi: %', array_to_string(miss, ', ');
  end if;
  if c.payment_type = 'fixed' then
    if c.total_amount <= 0 then raise exception 'Isi nilai kontrak dulu'; end if;
    select count(*), coalesce(sum(amount), 0) into n, s from public.contract_milestones where contract_id = _contract_id;
    if n = 0 then raise exception 'Tambahkan minimal satu milestone'; end if;
    if s <> c.total_amount then raise exception 'Total milestone (%) harus sama dengan nilai kontrak (%)', s, c.total_amount; end if;
  elsif c.hourly_rate <= 0 then
    raise exception 'Isi tarif per jam dulu';
  end if;
  update public.work_contracts
    set status = 'waiting_approval', client_approved_at = now(), freelancer_approved_at = null, version = version + 1, updated_at = now()
    where id = _contract_id;
  perform public._work_event(_contract_id, 'sent', jsonb_build_object('version', c.version + 1));
  perform public._work_notify(c.freelancer_id, 'contract_new', 'Kontrak menunggu persetujuanmu', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_send_contract(uuid) from public, anon;
grant execute on function public.work_send_contract(uuid) to authenticated;

-- Kirim jadwal per jam: sama dengan versi 007, ditambah pemeriksaan kelengkapan, dan ketentuan pembayaran client tidak ditimpa.
create or replace function public.work_send_schedule_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; n int; th numeric; last_d date; amt bigint; miss text[]; today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if not c.schedule_mode then raise exception 'Bukan kontrak per jam terjadwal'; end if;
  if c.status <> 'draft' then raise exception 'Kontrak sudah dikirim'; end if;
  miss := public._work_contract_missing(_contract_id);
  if coalesce(array_length(miss, 1), 0) > 0 then
    raise exception 'Kontrak belum lengkap. Lengkapi: %', array_to_string(miss, ', ');
  end if;
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
        version = version + 1, updated_at = now()
    where id = _contract_id;
  perform public._work_event(_contract_id, 'schedule_sent', jsonb_build_object('hours', th, 'amount', amt, 'sessions', n));
  perform public._work_notify(c.freelancer_id, 'contract_new', 'Jadwal jam kerja menunggu persetujuanmu', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_send_schedule_contract(uuid) from public, anon;
grant execute on function public.work_send_schedule_contract(uuid) to authenticated;

-- ============ 4. Menerima lamaran = kontrak DRAFT untuk disiapkan client ============
-- Sama dengan versi 008; bedanya: kerja langsung juga berstatus draft (tidak dikirim otomatis, persetujuan client belum tercatat)
-- dan client menerima notifikasi untuk menyiapkan kontrak.
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
      'draft', null, not fixed)
  returning id into cid;

  if fixed then
    insert into public.contract_milestones (contract_id, position, title, amount, deadline, status)
    values (cid, 1, 'Pekerjaan penuh', amt, dl, 'pending');
  end if;

  perform public._work_event(cid, 'created', jsonb_build_object('from_application', a.id, 'auto', true, 'schedule', not fixed));
  perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima. Client sedang menyiapkan kontrak; kamu diberi tahu saat dikirim.', '/kerja/kontrak/' || cid);
  perform public._work_notify(j.client_id, 'contract_new', 'Siapkan kontrak untuk freelancer yang kamu terima, lalu kirim agar bisa disetujui.', '/kerja/kontrak/' || cid);

  return summary || jsonb_build_object('contract_id', cid);
end $$;
revoke all on function public.work_accept_application(uuid) from public, anon;
grant execute on function public.work_accept_application(uuid) to authenticated;

commit;

-- Muat ulang skema API agar fungsi baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select proname from pg_proc where proname in ('work_update_contract_terms','_work_contract_missing','_work_text_len');
--   select public._work_contract_missing(id) from public.work_contracts where status = 'draft' limit 5;
