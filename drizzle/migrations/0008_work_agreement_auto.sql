-- Kesepakatan kerja lowongan: tanggal selesai + batas revisi dari lamaran, kontrak dibuat otomatis saat lamaran diterima,
-- dan dana otomatis diteruskan ke freelancer jika client tidak merespons sampai 1 hari setelah tanggal selesai.

alter table public.job_applications
  add column if not exists finish_date date,
  add column if not exists max_revisions integer;
alter table public.job_applications drop constraint if exists job_applications_max_revisions_check;
alter table public.job_applications add constraint job_applications_max_revisions_check check (max_revisions is null or (max_revisions between 0 and 20));

alter table public.work_contracts add column if not exists max_revisions integer;
alter table public.work_contracts drop constraint if exists work_contracts_max_revisions_check;
alter table public.work_contracts add constraint work_contracts_max_revisions_check check (max_revisions is null or (max_revisions between 0 and 20));

alter table public.contract_milestones
  add column if not exists submitted_at timestamptz,
  add column if not exists auto_release_at timestamptz,
  add column if not exists auto_approved_at timestamptz;
create index if not exists contract_milestones_auto_release_idx on public.contract_milestones (auto_release_at) where status = 'submitted';

-- Batas pemeriksaan client: akhir hari (WIB) sesudah tanggal selesai, tapi minimal 1 hari sejak hasil dikirim.
create or replace function public.work_auto_release_time(_due date, _submitted timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select greatest(
    coalesce(((_due + 2)::timestamp at time zone 'Asia/Jakarta'), _submitted + interval '1 day'),
    _submitted + interval '1 day'
  )
$$;

-- Lamaran: tanggal selesai mengikuti batas dari client, est_days dihitung dari tanggal.
create or replace function public._work_application_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select deadline, payment_type into j from public.jobs where id = new.job_id;
  if j.deadline is not null then
    if j.deadline < current_date then raise exception 'Tanggal selesai dari client sudah lewat, lowongan ini tidak bisa dilamar'; end if;
    if new.finish_date is null then new.finish_date := j.deadline; end if;
    if new.finish_date > j.deadline then
      raise exception 'Tanggal selesai tidak boleh melewati batas dari client (%)', to_char(j.deadline, 'DD-MM-YYYY');
    end if;
  end if;
  if new.finish_date is null and j.payment_type = 'fixed' then raise exception 'Pilih tanggal pekerjaan selesai'; end if;
  if new.finish_date is not null then
    if new.finish_date < current_date then raise exception 'Tanggal selesai tidak boleh di masa lalu'; end if;
    new.est_days := least(365, greatest(1, new.finish_date - current_date));
  end if;
  if j.payment_type = 'hourly' then new.max_revisions := null; end if;
  return new;
end $$;
drop trigger if exists work_application_terms_trg on public.job_applications;
create trigger work_application_terms_trg before insert on public.job_applications
  for each row execute function public._work_application_terms();

-- Kontrak otomatis dari lamaran yang diterima. Client dianggap setuju saat menerima; freelancer tinggal menyetujui.
create or replace function public._work_auto_contract(_application_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record; j record; cid uuid; dl date; rev text; ready boolean;
begin
  select * into a from public.job_applications where id = _application_id;
  if not found or a.status <> 'accepted' then return null; end if;
  select * into j from public.jobs where id = a.job_id;
  select id into cid from public.work_contracts where application_id = a.id;
  if cid is not null then return cid; end if;
  if exists (select 1 from public.orders where job_application_id = a.id and status not in ('cancelled', 'declined')) then return null; end if;

  dl := coalesce(a.finish_date, j.deadline);
  if dl is not null and dl < current_date then dl := null; end if;
  ready := coalesce(a.bid_amount, 0) >= 1000;
  rev := case
    when j.payment_type = 'hourly' then 'Per jam: client menyetujui atau menolak setiap laporan jam kerja.'
    when a.max_revisions is null then 'Revisi tanpa batas jumlah selama masih sesuai ruang lingkup.'
    when a.max_revisions = 0 then 'Tanpa revisi.'
    else 'Maksimal ' || a.max_revisions || ' kali revisi.'
  end;

  insert into public.work_contracts (job_id, application_id, client_id, freelancer_id, title, description, scope, payment_type,
      total_amount, hourly_rate, deadline, revision_terms, usage_rights, cancellation_terms, payment_terms, max_revisions,
      status, client_approved_at)
  values (j.id, a.id, j.client_id, a.developer_id, j.title, left(coalesce(j.description, ''), 8000),
      left(coalesce(nullif(trim(j.description), ''), j.title), 4000), j.payment_type,
      case when j.payment_type = 'fixed' then greatest(a.bid_amount, 0) else 0 end,
      case when j.payment_type = 'hourly' then greatest(a.bid_amount, 0) else 0 end,
      dl, rev,
      'Hak penuh atas hasil pekerjaan pindah ke client setelah dana diteruskan ke freelancer.',
      'Kontrak bisa dibatalkan selama belum ada dana masuk. Setelah dibayar, masalah diselesaikan lewat sengketa.',
      case when j.payment_type = 'hourly'
        then 'Freelancer mencatat jam kerja; client menyetujui lalu membayar tagihan jam yang disetujui lewat Midtrans.'
        else 'Client membayar penuh lewat Midtrans setelah kedua pihak setuju; dana ditahan escrow. Jika hasil sudah dikirim dan client tidak menyetujui atau meminta revisi sampai 1 hari setelah tanggal selesai, dana otomatis diteruskan ke freelancer.'
      end,
      case when j.payment_type = 'fixed' then a.max_revisions else null end,
      case when ready then 'waiting_approval' else 'draft' end,
      case when ready then now() else null end)
  returning id into cid;

  if j.payment_type = 'fixed' and ready then
    insert into public.contract_milestones (contract_id, position, title, description, amount, deadline)
    values (cid, 1, 'Pekerjaan lengkap', 'Seluruh pekerjaan sesuai ruang lingkup lowongan.', a.bid_amount, dl);
  end if;

  perform public._work_event(cid, 'created', jsonb_build_object('from_application', a.id, 'auto', true));
  if ready then
    perform public._work_event(cid, 'sent', '{}'::jsonb);
    perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima — periksa dan setujui kesepakatan kerja', '/kerja/kontrak/' || cid);
  else
    perform public._work_notify(a.developer_id, 'contract_new', 'Lamaranmu diterima — client sedang menetapkan nilai pekerjaan', '/kerja/kontrak/' || cid);
  end if;
  return cid;
end $$;
revoke all on function public._work_auto_contract(uuid) from public, anon, authenticated;

create or replace function public.work_respond_application(_application_id uuid, _accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; j record; n int; filled boolean := false; cid uuid;
begin
  perform public._work_guard();
  select * into a from public.job_applications where id = _application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id for update;
  if not found or j.client_id <> auth.uid() then raise exception 'Bukan lowongan kamu'; end if;
  select * into a from public.job_applications where id = _application_id for update;
  if a.status <> 'pending' then raise exception 'Lamaran ini sudah dijawab'; end if;
  if j.moderation_status <> 'approved' then raise exception 'Lowongan belum disetujui admin'; end if;
  if j.status <> 'open' then raise exception 'Lowongan sudah tidak dibuka'; end if;

  select count(*) into n from public.job_applications where job_id = j.id and status = 'accepted';

  if not _accept then
    update public.job_applications set status = 'rejected' where id = _application_id;
    return jsonb_build_object('accepted', n, 'positions', j.positions, 'filled', false);
  end if;

  if n >= j.positions then raise exception 'Kuota % freelancer sudah terpenuhi', j.positions; end if;

  update public.job_applications set status = 'accepted' where id = _application_id;
  n := n + 1;
  if n >= j.positions then
    update public.job_applications set status = 'rejected' where job_id = j.id and status = 'pending';
    update public.jobs set status = 'in_progress' where id = j.id;
    filled := true;
  end if;
  cid := public._work_auto_contract(_application_id);
  return jsonb_build_object('accepted', n, 'positions', j.positions, 'filled', filled, 'contract_id', cid);
end $$;

-- Kirim hasil: catat waktu kirim dan batas pemeriksaan client.
create or replace function public.work_submit_milestone(_milestone_id uuid, _note text, _links text[] default '{}'::text[], _attachments jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m record; c record; sid uuid;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.freelancer_id <> auth.uid() then raise exception 'Bukan pekerjaan kamu'; end if;
  if c.status <> 'active' then raise exception 'Kontrak tidak aktif'; end if;
  if m.status not in ('in_progress','revision_requested') then raise exception 'Milestone belum bisa dikirim (status: %)', m.status; end if;
  if length(trim(coalesce(_note, ''))) < 10 then raise exception 'Jelaskan hasil pekerjaan minimal 10 karakter'; end if;
  if coalesce(array_length(_links, 1), 0) > 10 then raise exception 'Maksimal 10 tautan'; end if;
  insert into public.work_submissions (milestone_id, contract_id, freelancer_id, note, links, attachments)
  values (_milestone_id, c.id, auth.uid(), left(_note, 4000), coalesce(_links, '{}'), coalesce(_attachments, '[]'::jsonb)) returning id into sid;
  update public.contract_milestones
    set status = 'submitted', submitted_at = now(),
        auto_release_at = public.work_auto_release_time(coalesce(m.deadline, c.deadline), now()),
        updated_at = now()
    where id = _milestone_id;
  perform public._work_event(c.id, 'milestone_submitted', jsonb_build_object('milestone', _milestone_id, 'submission', sid));
  perform public._work_notify(c.client_id, 'work_submitted', 'Hasil pekerjaan dikirim — setujui atau minta revisi sebelum batas waktu', '/kerja/kontrak/' || c.id);
  return sid;
end $$;

-- Minta revisi: hormati batas revisi yang disepakati dan batas waktu pemeriksaan.
create or replace function public.work_request_revision(_milestone_id uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; sid uuid; used int;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if m.status <> 'submitted' then raise exception 'Tidak ada hasil yang menunggu pemeriksaan'; end if;
  if m.auto_release_at is not null and m.auto_release_at <= now() then
    raise exception 'Batas waktu pemeriksaan sudah lewat; hasil dianggap diterima dan dana diteruskan ke freelancer';
  end if;
  select count(*) into used from public.work_revisions where milestone_id = _milestone_id;
  if c.max_revisions is not null and used >= c.max_revisions then
    raise exception 'Jatah revisi sudah habis (% kali). Setujui hasil atau ajukan sengketa.', c.max_revisions;
  end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Jelaskan revisi yang diminta (minimal 5 karakter)'; end if;
  select id into sid from public.work_submissions where milestone_id = _milestone_id order by created_at desc limit 1;
  insert into public.work_revisions (milestone_id, submission_id, client_id, note) values (_milestone_id, sid, auth.uid(), left(_note, 4000));
  update public.contract_milestones set status = 'revision_requested', auto_release_at = null, updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'revision_requested', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.freelancer_id, 'revision_requested', 'Client meminta revisi', '/kerja/kontrak/' || c.id);
end $$;

-- Menerima hasil otomatis lalu meneruskan dana escrow. Aman dipanggil berulang (cron per jam + saat halaman kontrak dibuka).
create or replace function public.work_auto_release_due()
returns integer language plpgsql security definer set search_path = public as $$
declare m record; c record; n int := 0;
begin
  for m in
    select * from public.contract_milestones
    where status = 'submitted' and auto_release_at is not null and auto_release_at <= now()
    order by auto_release_at limit 200 for update skip locked
  loop
    select * into c from public.work_contracts where id = m.contract_id;
    if c.status <> 'active' then continue; end if;
    update public.contract_milestones set status = 'approved', auto_approved_at = now(), updated_at = now() where id = m.id;
    if m.order_id is not null then
      perform set_config('gobi.work_internal', '1', true);
      update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
        where id = m.order_id and status in ('in_progress', 'delivered');
      perform set_config('gobi.work_internal', '', true);
    end if;
    perform public._work_event(c.id, 'milestone_auto_approved', jsonb_build_object('milestone', m.id));
    perform public._work_notify(c.client_id, 'work_approved', 'Batas pemeriksaan lewat: hasil diterima otomatis dan dana diteruskan ke freelancer', '/kerja/kontrak/' || c.id);
    perform public._work_notify(c.freelancer_id, 'work_approved', 'Client tidak merespons sampai batas waktu: hasil diterima otomatis', '/kerja/kontrak/' || c.id);
    perform public._work_refresh_contract(c.id);
    n := n + 1;
  end loop;

  for m in
    select cm.order_id from public.contract_milestones cm
    join public.escrow_ledger e on e.order_id = cm.order_id
    where cm.status = 'approved' and cm.auto_approved_at is not null and e.status = 'held' and e.held_until <= now()
    limit 200
  loop
    update public.escrow_ledger
      set status = 'released', released_at = now(), released_by = null,
          note = 'Otomatis: client tidak merespons sampai 1 hari setelah tanggal selesai', updated_at = now()
      where order_id = m.order_id and status = 'held';
    insert into public.order_messages (order_id, sender_id, body, is_system)
      select o.id, o.buyer_id, 'Dana otomatis diteruskan ke freelancer karena client tidak menyetujui atau meminta revisi sampai batas waktu.', true
      from public.orders o where o.id = m.order_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.work_auto_release_due() from public, anon;
grant execute on function public.work_auto_release_due() to authenticated, service_role;
grant execute on function public.work_auto_release_time(date, timestamptz) to anon, authenticated, service_role;
