-- GOBI WORK — Fase 1: skema inti, RLS, dan fungsi perubahan status.
-- Dijalankan lewat Lovable / SQL editor (lihat docs/gobi-work/RENCANA.md). Idempotent.
-- Tidak menyentuh tabel pembayaran: dana tetap lewat orders / payments / escrow_ledger / payouts (Midtrans).
-- Prasyarat dari docs/sql/midtrans-escrow: _is_admin(), _audit(), _require_server_proof(), is_banned(_user).

-- ============ Kategori ============
create table if not exists public.job_categories (
  slug text primary key,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.job_categories (slug, label, sort_order) values
  ('web-development','Web Development',1),('mobile-development','Mobile Development',2),
  ('backend-development','Backend Development',3),('frontend-development','Frontend Development',4),
  ('full-stack-development','Full Stack Development',5),('ui-ux-design','UI/UX Design',6),
  ('graphic-design','Graphic Design',7),('api-integration','API Integration',8),
  ('database','Database',9),('devops','DevOps',10),('cybersecurity','Cybersecurity',11),
  ('data-science','Data Science',12),('ai-ml','AI / Machine Learning',13),
  ('it-support','IT Support',14),('digital-marketing','Digital Marketing',15),('other','Other',16)
on conflict (slug) do nothing;

-- ============ Perluasan jobs (hanya menambah kolom) ============
alter table public.jobs
  add column if not exists job_type text not null default 'freelance' check (job_type in ('freelance','full_time','part_time','contract','internship')),
  add column if not exists work_mode text not null default 'remote' check (work_mode in ('remote','hybrid','onsite')),
  add column if not exists location text,
  add column if not exists experience_level text check (experience_level in ('entry','junior','mid','senior','expert')),
  add column if not exists payment_type text not null default 'fixed' check (payment_type in ('fixed','hourly')),
  add column if not exists positions int not null default 1 check (positions between 1 and 100),
  add column if not exists requirements text,
  add column if not exists moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected')),
  add column if not exists moderation_note text;
create index if not exists jobs_browse_idx on public.jobs (status, moderation_status, created_at desc);

-- ============ Profil kerja ============
create table if not exists public.work_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate bigint check (hourly_rate is null or hourly_rate >= 0),
  availability text not null default 'available' check (availability in ('available','busy','unavailable')),
  experience_level text check (experience_level in ('entry','junior','mid','senior','expert')),
  languages text[] not null default '{}',
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Kontrak ============
create table if not exists public.work_contracts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  application_id uuid not null unique references public.job_applications(id),
  client_id uuid not null references public.profiles(id),
  freelancer_id uuid not null references public.profiles(id),
  title text not null,
  description text not null default '',
  scope text not null,
  payment_type text not null check (payment_type in ('fixed','hourly')),
  total_amount bigint not null default 0 check (total_amount >= 0),
  hourly_rate bigint not null default 0 check (hourly_rate >= 0),
  deadline date,
  revision_terms text not null default '',
  usage_rights text not null default '',
  cancellation_terms text not null default '',
  payment_terms text not null default '',
  status text not null default 'draft' check (status in ('draft','waiting_approval','active','completed','cancelled','disputed')),
  client_approved_at timestamptz,
  freelancer_approved_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> freelancer_id)
);
create index if not exists work_contracts_client_idx on public.work_contracts (client_id, status);
create index if not exists work_contracts_freelancer_idx on public.work_contracts (freelancer_id, status);

create table if not exists public.work_contract_events (
  id bigint generated always as identity primary key,
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  actor_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists work_contract_events_idx on public.work_contract_events (contract_id, id);

create table if not exists public.contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  position int not null,
  title text not null,
  description text not null default '',
  amount bigint not null check (amount > 0),
  deadline date,
  status text not null default 'pending' check (status in ('pending','awaiting_payment','funded','in_progress','submitted','revision_requested','approved','released','cancelled','disputed')),
  order_id uuid unique references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, position)
);

create table if not exists public.work_submissions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.contract_milestones(id) on delete cascade,
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id),
  note text not null,
  links text[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists work_submissions_ms_idx on public.work_submissions (milestone_id, created_at);

create table if not exists public.work_revisions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.contract_milestones(id) on delete cascade,
  submission_id uuid references public.work_submissions(id) on delete set null,
  client_id uuid not null references public.profiles(id),
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.work_timesheets (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id),
  work_date date not null,
  hours numeric(4,2) not null check (hours > 0 and hours <= 24),
  note text not null default '',
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists work_timesheets_idx on public.work_timesheets (contract_id, work_date);

create table if not exists public.work_reviews (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  reviewee_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (contract_id, reviewer_id)
);

create table if not exists public.work_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('profile','job','application','contract','conversation','project')),
  target_id text not null,
  reason text not null check (reason in ('fraud','spam','abuse','policy','other')),
  detail text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_note text,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_reports_status_idx on public.work_reports (status, created_at desc);

create table if not exists public.work_disputes (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.work_contracts(id) on delete cascade,
  milestone_id uuid references public.contract_milestones(id) on delete set null,
  opened_by uuid not null references public.profiles(id),
  reason text not null,
  evidence jsonb not null default '[]'::jsonb,
  prev_milestone_status text,
  status text not null default 'open' check (status in ('open','under_review','resolved')),
  decision text check (decision in ('favor_client','favor_freelancer','split','dismissed')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists work_disputes_idx on public.work_disputes (status, created_at desc);

create table if not exists public.work_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists work_notifications_idx on public.work_notifications (user_id, read_at, created_at desc);

-- ============ Akses baca (RLS). Tulis hanya lewat fungsi di bawah ============
create or replace function public.can_access_contract(_contract_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public._is_admin()
    or exists (select 1 from public.work_contracts c where c.id = _contract_id and auth.uid() in (c.client_id, c.freelancer_id))
  )
$$;
revoke all on function public.can_access_contract(uuid) from public, anon;
grant execute on function public.can_access_contract(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['job_categories','work_profiles','work_contracts','work_contract_events','contract_milestones','work_submissions','work_revisions','work_timesheets','work_reviews','work_reports','work_disputes','work_notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant select on public.job_categories, public.work_profiles, public.work_reviews to anon;

drop policy if exists job_categories_read on public.job_categories;
create policy job_categories_read on public.job_categories for select using (active);

-- Profil kerja & ulasan bersifat publik; profil boleh diubah pemiliknya sendiri.
drop policy if exists work_profiles_read on public.work_profiles;
create policy work_profiles_read on public.work_profiles for select using (true);
grant insert, update on public.work_profiles to authenticated;
drop policy if exists work_profiles_insert on public.work_profiles;
create policy work_profiles_insert on public.work_profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists work_profiles_update on public.work_profiles;
create policy work_profiles_update on public.work_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists work_reviews_read on public.work_reviews;
create policy work_reviews_read on public.work_reviews for select using (true);

drop policy if exists work_contracts_read on public.work_contracts;
create policy work_contracts_read on public.work_contracts for select to authenticated using (public.can_access_contract(id));
drop policy if exists work_contract_events_read on public.work_contract_events;
create policy work_contract_events_read on public.work_contract_events for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists contract_milestones_read on public.contract_milestones;
create policy contract_milestones_read on public.contract_milestones for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists work_submissions_read on public.work_submissions;
create policy work_submissions_read on public.work_submissions for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists work_revisions_read on public.work_revisions;
create policy work_revisions_read on public.work_revisions for select to authenticated using (
  exists (select 1 from public.contract_milestones m where m.id = milestone_id and public.can_access_contract(m.contract_id)));
drop policy if exists work_timesheets_read on public.work_timesheets;
create policy work_timesheets_read on public.work_timesheets for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists work_disputes_read on public.work_disputes;
create policy work_disputes_read on public.work_disputes for select to authenticated using (public.can_access_contract(contract_id));
drop policy if exists work_reports_read on public.work_reports;
create policy work_reports_read on public.work_reports for select to authenticated using (reporter_id = auth.uid() or public._is_admin());
drop policy if exists work_notifications_read on public.work_notifications;
create policy work_notifications_read on public.work_notifications for select to authenticated using (user_id = auth.uid());

-- ============ Pembantu internal ============
create or replace function public._work_notify(_user uuid, _kind text, _title text, _link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.work_notifications (user_id, kind, title, link) values (_user, _kind, _title, _link);
$$;
revoke all on function public._work_notify(uuid, text, text, text) from public, anon, authenticated;

create or replace function public._work_event(_contract uuid, _event text, _detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.work_contract_events (contract_id, actor_id, event, detail)
  values (_contract, auth.uid(), _event, coalesce(_detail, '{}'::jsonb));
$$;
revoke all on function public._work_event(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public._work_guard()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if public.is_banned(_user => auth.uid()) then raise exception 'Akun diblokir'; end if;
end $$;
revoke all on function public._work_guard() from public, anon, authenticated;

-- Status kontrak diturunkan dari milestone & sengketa; tidak pernah dari klien.
create or replace function public._work_refresh_contract(_cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record; n_all int; n_live int; n_done int; has_dispute boolean; ns text;
begin
  select * into c from public.work_contracts where id = _cid for update;
  if not found or c.status in ('draft','waiting_approval','cancelled') then return; end if;
  select exists (select 1 from public.work_disputes where contract_id = _cid and status in ('open','under_review')) into has_dispute;
  if has_dispute then
    ns := 'disputed';
  elsif c.payment_type = 'fixed' then
    select count(*), count(*) filter (where status <> 'cancelled'), count(*) filter (where status in ('approved','released'))
      into n_all, n_live, n_done from public.contract_milestones where contract_id = _cid;
    ns := case when n_all > 0 and n_live = 0 then 'cancelled'
               when n_live > 0 and n_done = n_live then 'completed'
               else 'active' end;
  else
    ns := case when c.status = 'disputed' then 'active' else c.status end;
  end if;
  if ns <> c.status then
    update public.work_contracts set status = ns, updated_at = now() where id = _cid;
    perform public._work_event(_cid, 'status_' || ns, '{}'::jsonb);
  end if;
end $$;
revoke all on function public._work_refresh_contract(uuid) from public, anon, authenticated;

-- ============ Kontrak ============
create or replace function public.work_create_contract(
  _application_id uuid, _scope text, _revision_terms text default '', _usage_rights text default '',
  _cancellation_terms text default '', _payment_terms text default '', _deadline date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record; j record; cid uuid;
begin
  perform public._work_guard();
  select * into a from public.job_applications where id = _application_id for update;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id;
  if j.client_id <> auth.uid() then raise exception 'Bukan lowongan kamu'; end if;
  if a.status <> 'accepted' then raise exception 'Lamaran belum diterima'; end if;
  if exists (select 1 from public.work_contracts where application_id = _application_id) then raise exception 'Kontrak untuk lamaran ini sudah ada'; end if;
  if length(trim(coalesce(_scope, ''))) < 20 then raise exception 'Ruang lingkup minimal 20 karakter'; end if;
  if _deadline is not null and _deadline < current_date then raise exception 'Deadline tidak boleh di masa lalu'; end if;
  insert into public.work_contracts (job_id, application_id, client_id, freelancer_id, title, description, scope, payment_type,
      total_amount, hourly_rate, deadline, revision_terms, usage_rights, cancellation_terms, payment_terms)
  values (j.id, a.id, j.client_id, a.developer_id, j.title, left(coalesce(j.description, ''), 8000), trim(_scope), j.payment_type,
      case when j.payment_type = 'fixed' then greatest(a.bid_amount, 0)::bigint else 0 end,
      case when j.payment_type = 'hourly' then greatest(a.bid_amount, 0)::bigint else 0 end,
      coalesce(_deadline, j.deadline::date),
      left(coalesce(_revision_terms, ''), 4000), left(coalesce(_usage_rights, ''), 4000),
      left(coalesce(_cancellation_terms, ''), 4000), left(coalesce(_payment_terms, ''), 4000))
  returning id into cid;
  perform public._work_event(cid, 'created', jsonb_build_object('from_application', a.id));
  perform public._work_notify(a.developer_id, 'contract_new', 'Client menyiapkan kontrak untuk kamu', '/kerja/kontrak/' || cid);
  return cid;
end $$;
revoke all on function public.work_create_contract(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.work_create_contract(uuid, text, text, text, text, text, date) to authenticated;

-- Nilai/tarif hanya bisa diubah client saat draft; freelancer menyetujui nilai akhir saat persetujuan.
create or replace function public.work_set_contract_amount(_contract_id uuid, _amount bigint)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draft' then raise exception 'Nilai hanya bisa diubah saat kontrak masih draft'; end if;
  if _amount is null or _amount <= 0 or _amount > 10000000000 then raise exception 'Nilai tidak valid'; end if;
  if c.payment_type = 'fixed' then
    update public.work_contracts set total_amount = _amount, updated_at = now() where id = _contract_id;
  else
    update public.work_contracts set hourly_rate = _amount, updated_at = now() where id = _contract_id;
  end if;
  perform public._work_event(_contract_id, 'amount_changed', jsonb_build_object('amount', _amount));
end $$;
revoke all on function public.work_set_contract_amount(uuid, bigint) from public, anon;
grant execute on function public.work_set_contract_amount(uuid, bigint) to authenticated;

create or replace function public.work_add_milestone(_contract_id uuid, _title text, _description text, _amount bigint, _deadline date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; pos int; mid uuid;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draft' then raise exception 'Milestone hanya bisa diubah saat kontrak masih draft'; end if;
  if c.payment_type <> 'fixed' then raise exception 'Milestone hanya untuk kontrak harga tetap'; end if;
  if length(trim(coalesce(_title, ''))) < 3 then raise exception 'Nama milestone minimal 3 huruf'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Nilai milestone tidak valid'; end if;
  if _deadline is not null and _deadline < current_date then raise exception 'Deadline tidak boleh di masa lalu'; end if;
  select coalesce(max(position), 0) + 1 into pos from public.contract_milestones where contract_id = _contract_id;
  insert into public.contract_milestones (contract_id, position, title, description, amount, deadline)
  values (_contract_id, pos, trim(_title), left(coalesce(_description, ''), 4000), _amount, _deadline) returning id into mid;
  perform public._work_event(_contract_id, 'milestone_added', jsonb_build_object('milestone', mid, 'amount', _amount));
  return mid;
end $$;
revoke all on function public.work_add_milestone(uuid, text, text, bigint, date) from public, anon;
grant execute on function public.work_add_milestone(uuid, text, text, bigint, date) to authenticated;

create or replace function public.work_remove_milestone(_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id for update;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if c.status <> 'draft' then raise exception 'Milestone hanya bisa dihapus saat kontrak masih draft'; end if;
  delete from public.contract_milestones where id = _milestone_id;
  perform public._work_event(c.id, 'milestone_removed', jsonb_build_object('milestone', _milestone_id));
end $$;
revoke all on function public.work_remove_milestone(uuid) from public, anon;
grant execute on function public.work_remove_milestone(uuid) to authenticated;

-- Client mengirim kontrak: persetujuan client tercatat, menunggu freelancer.
create or replace function public.work_send_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record; s bigint; n int;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draft' then raise exception 'Kontrak sudah dikirim'; end if;
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

-- Freelancer menyetujui (-> active) atau menolak (-> kembali draft). Aktif hanya jika kedua persetujuan tercatat.
create or replace function public.work_respond_contract(_contract_id uuid, _accept boolean, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.freelancer_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'waiting_approval' or c.client_approved_at is null then raise exception 'Kontrak tidak sedang menunggu persetujuan'; end if;
  if _accept then
    update public.work_contracts set status = 'active', freelancer_approved_at = now(), updated_at = now() where id = _contract_id;
    update public.contract_milestones set status = 'awaiting_payment', updated_at = now() where contract_id = _contract_id and status = 'pending';
    perform public._work_event(_contract_id, 'approved_by_both', '{}'::jsonb);
    perform public._work_notify(c.client_id, 'contract_approved', 'Kontrak disetujui freelancer', '/kerja/kontrak/' || _contract_id);
  else
    if length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan penolakan'; end if;
    update public.work_contracts set status = 'draft', client_approved_at = null, updated_at = now() where id = _contract_id;
    perform public._work_event(_contract_id, 'rejected_by_freelancer', jsonb_build_object('note', left(_note, 1000)));
    perform public._work_notify(c.client_id, 'contract_rejected', 'Freelancer meminta perubahan kontrak', '/kerja/kontrak/' || _contract_id);
  end if;
end $$;
revoke all on function public.work_respond_contract(uuid, boolean, text) from public, anon;
grant execute on function public.work_respond_contract(uuid, boolean, text) to authenticated;

create or replace function public.work_cancel_contract(_contract_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or auth.uid() not in (c.client_id, c.freelancer_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status not in ('draft','waiting_approval','active') then raise exception 'Kontrak dengan status % tidak bisa dibatalkan', c.status; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'Isi alasan pembatalan'; end if;
  if exists (select 1 from public.contract_milestones where contract_id = _contract_id
             and status in ('funded','in_progress','submitted','revision_requested','approved','released','disputed')) then
    raise exception 'Sudah ada dana atau pekerjaan berjalan: ajukan sengketa, bukan pembatalan';
  end if;
  if c.payment_type = 'hourly' and exists (select 1 from public.work_timesheets where contract_id = _contract_id) then
    raise exception 'Sudah ada catatan jam kerja: ajukan sengketa, bukan pembatalan';
  end if;
  update public.contract_milestones set status = 'cancelled', updated_at = now() where contract_id = _contract_id;
  update public.work_contracts set status = 'cancelled', updated_at = now() where id = _contract_id;
  perform public._work_event(_contract_id, 'cancelled', jsonb_build_object('reason', left(_reason, 1000)));
  perform public._work_notify(case when auth.uid() = c.client_id then c.freelancer_id else c.client_id end, 'contract_cancelled', 'Kontrak dibatalkan', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_cancel_contract(uuid, text) from public, anon;
grant execute on function public.work_cancel_contract(uuid, text) to authenticated;

-- Kontrak per jam selesai hanya atas persetujuan client dan tanpa timesheet yang menggantung.
create or replace function public.work_complete_hourly_contract(_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.payment_type <> 'hourly' or c.status <> 'active' then raise exception 'Hanya kontrak per jam yang aktif'; end if;
  if exists (select 1 from public.work_timesheets where contract_id = _contract_id and status = 'submitted') then
    raise exception 'Masih ada timesheet yang belum diputuskan';
  end if;
  update public.work_contracts set status = 'completed', updated_at = now() where id = _contract_id;
  perform public._work_event(_contract_id, 'completed', '{}'::jsonb);
  perform public._work_notify(c.freelancer_id, 'work_approved', 'Client menyelesaikan kontrak', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_complete_hourly_contract(uuid) from public, anon;
grant execute on function public.work_complete_hourly_contract(uuid) to authenticated;

-- ============ Milestone ============
-- 'funded' HANYA dari backend (bukti server) dan hanya jika pesanan Midtrans-nya benar-benar sudah dibayar,
-- nominal cocok, dan pembeli/penjualnya adalah pihak kontrak. Status pekerjaan tidak pernah mengubah status bayar.
create or replace function public.work_mark_milestone_funded(_milestone_id uuid, _order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; o record;
begin
  perform public._require_server_proof();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  if m.status <> 'awaiting_payment' then raise exception 'Milestone tidak sedang menunggu pembayaran'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.status <> 'active' then raise exception 'Kontrak belum aktif'; end if;
  select * into o from public.orders where id = _order_id;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.buyer_id <> c.client_id or o.seller_id <> c.freelancer_id then raise exception 'Pesanan bukan milik kontrak ini'; end if;
  if o.amount <> m.amount then raise exception 'Nominal pesanan tidak cocok dengan milestone'; end if;
  if o.status not in ('in_progress','completed') or o.paid_at is null then raise exception 'Pesanan belum dibayar'; end if;
  update public.contract_milestones set status = 'funded', order_id = _order_id, updated_at = now() where id = _milestone_id;
  perform public._work_event(m.contract_id, 'milestone_funded', jsonb_build_object('milestone', _milestone_id, 'order', _order_id));
  perform public._work_notify(c.freelancer_id, 'payment_received', 'Pembayaran milestone diterima, kamu bisa mulai', '/kerja/kontrak/' || c.id);
end $$;
revoke all on function public.work_mark_milestone_funded(uuid, uuid) from public, anon, authenticated;
grant execute on function public.work_mark_milestone_funded(uuid, uuid) to anon, authenticated;

create or replace function public.work_start_milestone(_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.freelancer_id <> auth.uid() then raise exception 'Bukan pekerjaan kamu'; end if;
  if c.status <> 'active' then raise exception 'Kontrak belum aktif'; end if;
  if m.status <> 'funded' then raise exception 'Milestone belum didanai'; end if;
  update public.contract_milestones set status = 'in_progress', updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'milestone_started', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.client_id, 'milestone_started', 'Freelancer mulai mengerjakan milestone', '/kerja/kontrak/' || c.id);
end $$;
revoke all on function public.work_start_milestone(uuid) from public, anon;
grant execute on function public.work_start_milestone(uuid) to authenticated;

create or replace function public.work_submit_milestone(_milestone_id uuid, _note text, _links text[] default '{}', _attachments jsonb default '[]'::jsonb)
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
  update public.contract_milestones set status = 'submitted', updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'milestone_submitted', jsonb_build_object('milestone', _milestone_id, 'submission', sid));
  perform public._work_notify(c.client_id, 'work_submitted', 'Hasil pekerjaan dikirim, mohon diperiksa', '/kerja/kontrak/' || c.id);
  return sid;
end $$;
revoke all on function public.work_submit_milestone(uuid, text, text[], jsonb) from public, anon;
grant execute on function public.work_submit_milestone(uuid, text, text[], jsonb) to authenticated;

create or replace function public.work_request_revision(_milestone_id uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; sid uuid;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if m.status <> 'submitted' then raise exception 'Tidak ada hasil yang menunggu pemeriksaan'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Jelaskan revisi yang diminta (minimal 5 karakter)'; end if;
  select id into sid from public.work_submissions where milestone_id = _milestone_id order by created_at desc limit 1;
  insert into public.work_revisions (milestone_id, submission_id, client_id, note) values (_milestone_id, sid, auth.uid(), left(_note, 4000));
  update public.contract_milestones set status = 'revision_requested', updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'revision_requested', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.freelancer_id, 'revision_requested', 'Client meminta revisi', '/kerja/kontrak/' || c.id);
end $$;
revoke all on function public.work_request_revision(uuid, text) from public, anon;
grant execute on function public.work_request_revision(uuid, text) to authenticated;

-- Persetujuan client HANYA mengubah status pekerjaan. Pencairan dana tetap lewat admin_release_escrow / payouts.
create or replace function public.work_approve_milestone(_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if m.status <> 'submitted' then raise exception 'Tidak ada hasil yang menunggu persetujuan'; end if;
  update public.contract_milestones set status = 'approved', updated_at = now() where id = _milestone_id;
  perform public._work_event(c.id, 'milestone_approved', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.freelancer_id, 'work_approved', 'Client menyetujui hasil pekerjaan', '/kerja/kontrak/' || c.id);
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_approve_milestone(uuid) from public, anon;
grant execute on function public.work_approve_milestone(uuid) to authenticated;

-- ============ Hourly ============
create or replace function public.work_submit_timesheet(_contract_id uuid, _work_date date, _hours numeric, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; tid uuid;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id;
  if not found or c.freelancer_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.payment_type <> 'hourly' or c.status <> 'active' then raise exception 'Timesheet hanya untuk kontrak per jam yang aktif'; end if;
  if _hours is null or _hours <= 0 or _hours > 24 then raise exception 'Jam kerja harus antara 0 dan 24'; end if;
  if _work_date is null or _work_date > current_date or _work_date < current_date - 60 then raise exception 'Tanggal kerja tidak valid (maksimal 60 hari ke belakang)'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Catat pekerjaan yang dilakukan'; end if;
  if coalesce((select sum(hours) from public.work_timesheets where contract_id = _contract_id and work_date = _work_date and status <> 'rejected'), 0) + _hours > 24 then
    raise exception 'Total jam pada tanggal itu melebihi 24 jam';
  end if;
  insert into public.work_timesheets (contract_id, freelancer_id, work_date, hours, note)
  values (_contract_id, auth.uid(), _work_date, _hours, left(_note, 2000)) returning id into tid;
  perform public._work_event(_contract_id, 'timesheet_submitted', jsonb_build_object('timesheet', tid, 'hours', _hours));
  perform public._work_notify(c.client_id, 'work_submitted', 'Laporan jam kerja baru menunggu persetujuan', '/kerja/kontrak/' || _contract_id);
  return tid;
end $$;
revoke all on function public.work_submit_timesheet(uuid, date, numeric, text) from public, anon;
grant execute on function public.work_submit_timesheet(uuid, date, numeric, text) to authenticated;

create or replace function public.work_decide_timesheet(_timesheet_id uuid, _approve boolean, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare t record; c record;
begin
  perform public._work_guard();
  select * into t from public.work_timesheets where id = _timesheet_id for update;
  if not found then raise exception 'Timesheet tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = t.contract_id;
  if c.client_id <> auth.uid() then raise exception 'Bukan kontrak kamu'; end if;
  if t.status <> 'submitted' then raise exception 'Timesheet sudah diputuskan'; end if;
  if not _approve and length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan penolakan'; end if;
  update public.work_timesheets
    set status = case when _approve then 'approved' else 'rejected' end, decision_note = nullif(left(coalesce(_note, ''), 1000), ''), decided_at = now()
    where id = _timesheet_id;
  perform public._work_event(t.contract_id, case when _approve then 'timesheet_approved' else 'timesheet_rejected' end, jsonb_build_object('timesheet', _timesheet_id));
  perform public._work_notify(t.freelancer_id, case when _approve then 'work_approved' else 'revision_requested' end,
    case when _approve then 'Jam kerja disetujui' else 'Jam kerja ditolak' end, '/kerja/kontrak/' || t.contract_id);
end $$;
revoke all on function public.work_decide_timesheet(uuid, boolean, text) from public, anon;
grant execute on function public.work_decide_timesheet(uuid, boolean, text) to authenticated;

-- ============ Ulasan ============
create or replace function public.work_leave_review(_contract_id uuid, _rating int, _comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id;
  if not found or auth.uid() not in (c.client_id, c.freelancer_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'completed' then raise exception 'Ulasan hanya setelah kontrak selesai'; end if;
  if _rating is null or _rating < 1 or _rating > 5 then raise exception 'Rating 1 sampai 5'; end if;
  insert into public.work_reviews (contract_id, reviewer_id, reviewee_id, rating, comment)
  values (_contract_id, auth.uid(), case when auth.uid() = c.client_id then c.freelancer_id else c.client_id end, _rating, left(coalesce(_comment, ''), 2000));
exception when unique_violation then
  raise exception 'Kamu sudah memberi ulasan untuk kontrak ini';
end $$;
revoke all on function public.work_leave_review(uuid, int, text) from public, anon;
grant execute on function public.work_leave_review(uuid, int, text) to authenticated;

-- ============ Laporan & sengketa ============
create or replace function public.work_file_report(_target_type text, _target_id text, _reason text, _detail text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  perform public._work_guard();
  if (select count(*) from public.work_reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Batas laporan harian tercapai';
  end if;
  if length(trim(coalesce(_target_id, ''))) = 0 then raise exception 'Target laporan kosong'; end if;
  insert into public.work_reports (reporter_id, target_type, target_id, reason, detail)
  values (auth.uid(), _target_type, left(trim(_target_id), 200), _reason, left(coalesce(_detail, ''), 2000)) returning id into rid;
  return rid;
end $$;
revoke all on function public.work_file_report(text, text, text, text) from public, anon;
grant execute on function public.work_file_report(text, text, text, text) to authenticated;

create or replace function public.work_open_dispute(_contract_id uuid, _milestone_id uuid, _reason text, _evidence jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; m record; did uuid; prev text;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or auth.uid() not in (c.client_id, c.freelancer_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status not in ('active','disputed') then raise exception 'Sengketa hanya untuk kontrak aktif'; end if;
  if length(trim(coalesce(_reason, ''))) < 20 then raise exception 'Jelaskan masalahnya (minimal 20 karakter)'; end if;
  if _milestone_id is not null then
    select * into m from public.contract_milestones where id = _milestone_id and contract_id = _contract_id for update;
    if not found then raise exception 'Milestone tidak ditemukan'; end if;
    if m.status not in ('funded','in_progress','submitted','revision_requested','approved') then raise exception 'Milestone ini tidak bisa disengketakan'; end if;
    prev := m.status;
    update public.contract_milestones set status = 'disputed', updated_at = now() where id = _milestone_id;
  end if;
  insert into public.work_disputes (contract_id, milestone_id, opened_by, reason, evidence, prev_milestone_status)
  values (_contract_id, _milestone_id, auth.uid(), left(_reason, 4000), coalesce(_evidence, '[]'::jsonb), prev) returning id into did;
  perform public._work_event(_contract_id, 'dispute_opened', jsonb_build_object('dispute', did));
  perform public._work_refresh_contract(_contract_id);
  perform public._work_notify(case when auth.uid() = c.client_id then c.freelancer_id else c.client_id end, 'dispute_update', 'Sengketa diajukan pada kontrak', '/kerja/kontrak/' || _contract_id);
  return did;
end $$;
revoke all on function public.work_open_dispute(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.work_open_dispute(uuid, uuid, text, jsonb) to authenticated;

-- ============ Admin ============
-- Keputusan sengketa hanya mencatat putusan + status pekerjaan. Dana digerakkan admin lewat
-- admin_set_escrow / admin_release_escrow yang sudah ada (diintegrasikan di Fase 6).
create or replace function public.work_admin_decide_dispute(_dispute_id uuid, _decision text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _decision not in ('favor_client','favor_freelancer','split','dismissed') then raise exception 'Keputusan tidak dikenal'; end if;
  if length(trim(coalesce(_note, ''))) < 10 then raise exception 'Catatan keputusan minimal 10 karakter'; end if;
  select * into d from public.work_disputes where id = _dispute_id for update;
  if not found then raise exception 'Sengketa tidak ditemukan'; end if;
  if d.status = 'resolved' then raise exception 'Sengketa sudah diputuskan'; end if;
  update public.work_disputes set status = 'resolved', decision = _decision, decision_note = left(_note, 4000), decided_by = auth.uid(), decided_at = now() where id = _dispute_id;
  if d.milestone_id is not null then
    update public.contract_milestones
      set status = case _decision when 'favor_client' then 'cancelled' when 'favor_freelancer' then 'approved' else coalesce(d.prev_milestone_status, 'funded') end,
          updated_at = now()
      where id = d.milestone_id and status = 'disputed';
  end if;
  perform public._audit('work_dispute_' || _decision, 'work_dispute', _dispute_id::text, _note);
  perform public._work_event(d.contract_id, 'dispute_resolved', jsonb_build_object('dispute', _dispute_id, 'decision', _decision));
  perform public._work_refresh_contract(d.contract_id);
  perform public._work_notify((select client_id from public.work_contracts where id = d.contract_id), 'dispute_update', 'Sengketa diputuskan admin', '/kerja/kontrak/' || d.contract_id);
  perform public._work_notify((select freelancer_id from public.work_contracts where id = d.contract_id), 'dispute_update', 'Sengketa diputuskan admin', '/kerja/kontrak/' || d.contract_id);
end $$;
revoke all on function public.work_admin_decide_dispute(uuid, text, text) from public, anon;
grant execute on function public.work_admin_decide_dispute(uuid, text, text) to authenticated;

create or replace function public.work_admin_set_report(_report_id uuid, _status text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _status not in ('reviewing','resolved','dismissed') then raise exception 'Status tidak dikenal'; end if;
  update public.work_reports set status = _status, admin_note = nullif(left(coalesce(_note, ''), 2000), ''), resolved_by = auth.uid(), updated_at = now() where id = _report_id;
  if not found then raise exception 'Laporan tidak ditemukan'; end if;
  perform public._audit('work_report_' || _status, 'work_report', _report_id::text, _note);
end $$;
revoke all on function public.work_admin_set_report(uuid, text, text) from public, anon;
grant execute on function public.work_admin_set_report(uuid, text, text) to authenticated;

create or replace function public.work_admin_moderate_job(_job_id uuid, _status text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _status not in ('pending','approved','rejected') then raise exception 'Status tidak dikenal'; end if;
  if _status = 'rejected' and length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan penolakan'; end if;
  update public.jobs set moderation_status = _status, moderation_note = nullif(left(coalesce(_note, ''), 1000), '') where id = _job_id;
  if not found then raise exception 'Lowongan tidak ditemukan'; end if;
  perform public._audit('work_job_' || _status, 'job', _job_id::text, _note);
end $$;
revoke all on function public.work_admin_moderate_job(uuid, text, text) from public, anon;
grant execute on function public.work_admin_moderate_job(uuid, text, text) to authenticated;

create or replace function public.work_mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.work_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.work_mark_notifications_read() from public, anon;
grant execute on function public.work_mark_notifications_read() to authenticated;
