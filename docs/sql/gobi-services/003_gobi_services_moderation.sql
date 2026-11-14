-- GOBI SERVICES — Fase 3: moderasi jasa oleh admin.
-- Prasyarat: 001 dan 002 sudah dijalankan. Idempotent.
--
-- Alur: seller membuat jasa -> pending_review -> admin: setujui (published) / tolak (rejected) / minta perbaikan (draft + catatan).
-- Jasa terbit juga bisa ditahan admin (paused + admin_hold) dan dibuka lagi oleh admin.
-- Setiap perpindahan status jasa tercatat otomatis di service_moderation_events (trigger), dan aksi admin juga masuk admin_audit_log.
--
-- Fungsi untuk admin:
--   service_admin_moderate(_service_id, _action, _note)  action: approve | reject | request_changes | hold | release
--   service_admin_stats() / service_admin_list(...) / service_admin_detail(_id)

-- ============ Riwayat status & moderasi ============
create table if not exists public.service_moderation_events (
  id bigint generated always as identity primary key,
  service_id uuid not null references public.services(id) on delete cascade,
  actor_id uuid,
  action text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists service_moderation_events_idx on public.service_moderation_events (service_id, id);

alter table public.service_moderation_events enable row level security;
revoke insert, update, delete on public.service_moderation_events from anon, authenticated;
grant select on public.service_moderation_events to authenticated;
grant all on public.service_moderation_events to service_role;
drop policy if exists service_moderation_events_read on public.service_moderation_events;
create policy service_moderation_events_read on public.service_moderation_events for select to authenticated
  using (public.service_can_manage(service_id));

-- Mencatat setiap perubahan status. Nama aksi dan catatan datang dari fungsi server lewat pengaturan transaksi-lokal.
create or replace function public._services_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.service_moderation_events (service_id, actor_id, action, from_status, to_status, note)
    values (new.id, auth.uid(),
      coalesce(nullif(current_setting('gobi.services_action', true), ''), 'status_change'),
      old.status, new.status,
      nullif(current_setting('gobi.services_note', true), ''));
  end if;
  return null;
end $$;
revoke all on function public._services_log() from public, anon, authenticated;

drop trigger if exists services_log on public.services;
create trigger services_log after update on public.services
  for each row execute function public._services_log();

-- ============ Ajukan (menggantikan versi Fase 2: sekarang menamai aksinya di riwayat) ============
create or replace function public.service_submit(_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.services; probs text[]; moderated boolean; target text;
begin
  r := public._service_own(_id);
  perform public._service_require_seller();
  if r.admin_hold then raise exception 'Jasa ini ditahan admin. Hubungi admin'; end if;
  if r.status not in ('draft', 'rejected') then raise exception 'Hanya draft atau jasa yang ditolak yang bisa diajukan'; end if;
  probs := public._service_readiness(r.id);
  if cardinality(probs) > 0 then raise exception 'Lengkapi dulu: %', array_to_string(probs, '; '); end if;
  moderated := coalesce((select (value #>> '{}') = 'true' from public.service_settings where key = 'require_moderation'), false);
  target := case when moderated then 'pending_review' else 'published' end;
  perform set_config('gobi.services_rpc', '1', true);
  perform set_config('gobi.services_action', 'submitted', true);
  perform set_config('gobi.services_note', '', true);
  update public.services set status = target, moderation_note = null where id = r.id;
  perform set_config('gobi.services_action', '', true);
  perform public._service_notify(r.owner_id,
    case when target = 'published' then 'service_published' else 'service_pending_review' end,
    case when target = 'published' then 'Jasa kamu sudah terbit: ' else 'Jasa kamu menunggu moderasi: ' end || left(r.title, 80),
    '/studio/jasa/' || r.id::text);
  return target;
end $$;
revoke all on function public.service_submit(uuid) from public, anon;
grant execute on function public.service_submit(uuid) to authenticated;

-- ============ Aksi moderasi ============
-- approve / reject / request_changes: hanya dari pending_review. hold: hanya dari published. release: hanya dari paused + admin_hold.
-- Alasan wajib (min 10 karakter) untuk semua aksi kecuali approve. request_changes mengembalikan jasa ke draft dengan catatan.
create or replace function public.service_admin_moderate(_service_id uuid, _action text, _note text default '')
returns text language plpgsql security definer set search_path = public as $$
declare r public.services; n text := btrim(coalesce(_note, '')); to_status text; probs text[]; msg text;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _action is null or _action not in ('approve', 'reject', 'request_changes', 'hold', 'release') then
    raise exception 'Aksi moderasi tidak dikenal';
  end if;
  if length(n) > 1000 then raise exception 'Catatan maksimal 1000 karakter'; end if;
  if _action <> 'approve' and length(n) < 10 then raise exception 'Alasan wajib diisi (minimal 10 karakter)'; end if;

  select * into r from public.services where id = _service_id for update;
  if not found then raise exception 'Jasa tidak ditemukan'; end if;

  if _action in ('approve', 'reject', 'request_changes') then
    if r.status <> 'pending_review' then raise exception 'Jasa tidak sedang menunggu moderasi (status: %)', r.status; end if;
    to_status := case _action when 'approve' then 'published' when 'reject' then 'rejected' else 'draft' end;
    if _action = 'approve' then
      probs := public._service_readiness(r.id);
      if cardinality(probs) > 0 then raise exception 'Jasa belum lengkap: %. Minta perbaikan ke penjual', array_to_string(probs, '; '); end if;
    end if;
  elsif _action = 'hold' then
    if r.status <> 'published' then raise exception 'Hanya jasa terbit yang bisa ditahan (status: %)', r.status; end if;
    to_status := 'paused';
  else
    if not (r.status = 'paused' and r.admin_hold) then raise exception 'Jasa tidak sedang ditahan admin'; end if;
    to_status := 'published';
  end if;

  perform set_config('gobi.services_rpc', '1', true);
  perform set_config('gobi.services_action', _action, true);
  perform set_config('gobi.services_note', n, true);
  update public.services set
    status = to_status,
    moderation_note = case when _action in ('approve', 'release') then null else n end,
    admin_hold = case _action when 'hold' then true when 'release' then false else admin_hold end
  where id = r.id;
  perform set_config('gobi.services_action', '', true);
  perform set_config('gobi.services_note', '', true);

  msg := case _action
    when 'approve' then 'Jasa kamu disetujui dan terbit: '
    when 'reject' then 'Jasa kamu ditolak: '
    when 'request_changes' then 'Admin meminta perbaikan pada jasa: '
    when 'hold' then 'Jasa kamu ditahan admin: '
    else 'Tahanan admin pada jasa kamu dibuka: ' end;
  perform public._service_notify(r.owner_id, 'service_' || _action, msg || left(r.title, 80), '/studio/jasa/' || r.id::text);
  perform public._audit(_action => 'service_' || _action, _target_type => 'service', _target_id => r.id::text, _note => left(n, 500));
  return to_status;
end $$;
revoke all on function public.service_admin_moderate(uuid, text, text) from public, anon;
grant execute on function public.service_admin_moderate(uuid, text, text) to authenticated;

-- ============ Baca untuk admin ============
create or replace function public.service_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  return (select jsonb_build_object(
    'sellers', (select count(*) from public.service_seller_profiles where is_active),
    'services', count(*),
    'published', count(*) filter (where status = 'published'),
    'pending_review', count(*) filter (where status = 'pending_review'),
    'draft', count(*) filter (where status = 'draft'),
    'rejected', count(*) filter (where status = 'rejected'),
    'paused', count(*) filter (where status = 'paused'),
    'held_by_admin', count(*) filter (where status = 'paused' and admin_hold),
    'archived', count(*) filter (where status = 'archived')
  ) from public.services);
end $$;
revoke all on function public.service_admin_stats() from public, anon;
grant execute on function public.service_admin_stats() to authenticated;

create or replace function public.service_admin_list(
  _status text default null, _q text default null, _category text default null, _limit int default 25, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(_limit, 25), 1), 50);
  off int := greatest(coalesce(_offset, 0), 0);
  qq text := nullif(btrim(coalesce(_q, '')), '');
  pat text;
  total bigint;
  rows jsonb;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _status is not null and _status not in ('draft', 'pending_review', 'published', 'rejected', 'paused', 'archived') then
    raise exception 'Status tidak valid';
  end if;
  if qq is not null then
    pat := '%' || replace(replace(replace(qq, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select count(*) into total
  from public.services s join public.profiles p on p.id = s.owner_id
  where (_status is null or s.status = _status)
    and (_category is null or s.category_slug = _category)
    and (pat is null or s.title ilike pat escape '\' or p.username ilike pat escape '\' or coalesce(p.display_name, '') ilike pat escape '\');

  select coalesce(jsonb_agg(t.x order by t.rn), '[]'::jsonb) into rows from (
    select row_number() over (order by case when _status = 'pending_review' then s.created_at end asc, s.created_at desc) as rn,
      jsonb_build_object(
        'id', s.id, 'title', s.title, 'status', s.status, 'admin_hold', s.admin_hold, 'cover_url', s.cover_url,
        'category_slug', s.category_slug, 'price_from', s.price_from, 'delivery_days', s.delivery_days,
        'created_at', s.created_at, 'published_at', s.published_at, 'moderation_note', s.moderation_note,
        'owner', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name)) as x
    from public.services s join public.profiles p on p.id = s.owner_id
    where (_status is null or s.status = _status)
      and (_category is null or s.category_slug = _category)
      and (pat is null or s.title ilike pat escape '\' or p.username ilike pat escape '\' or coalesce(p.display_name, '') ilike pat escape '\')
    order by rn
    limit lim offset off
  ) t;

  return jsonb_build_object('total', total, 'rows', rows);
end $$;
revoke all on function public.service_admin_list(text, text, text, int, int) from public, anon;
grant execute on function public.service_admin_list(text, text, text, int, int) to authenticated;

create or replace function public.service_admin_detail(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.services;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  select * into r from public.services where id = _id;
  if not found then raise exception 'Jasa tidak ditemukan'; end if;
  return jsonb_build_object(
    'service', to_jsonb(r),
    'owner', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'account_type', p.account_type)
              from public.profiles p where p.id = r.owner_id),
    'seller', (select to_jsonb(sp) from public.service_seller_profiles sp where sp.user_id = r.owner_id),
    'packages', coalesce((select jsonb_agg(to_jsonb(k) order by k.price) from public.service_packages k where k.service_id = r.id), '[]'::jsonb),
    'addons', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.service_addons a where a.service_id = r.id), '[]'::jsonb),
    'faqs', coalesce((select jsonb_agg(to_jsonb(f) order by f.position) from public.service_faqs f where f.service_id = r.id), '[]'::jsonb),
    'gallery', coalesce((select jsonb_agg(to_jsonb(g) order by g.position) from public.service_gallery g where g.service_id = r.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'created_at', e.created_at, 'actor', (select username from public.profiles where id = e.actor_id)) order by e.id desc)
      from (select * from public.service_moderation_events where service_id = r.id order by id desc limit 50) e), '[]'::jsonb),
    'readiness', to_jsonb(public._service_readiness(r.id)),
    'reports_open', (select count(*) from public.service_reports
                     where target_type = 'service' and target_id = r.id::text and status in ('open', 'reviewing'))
  );
end $$;
revoke all on function public.service_admin_detail(uuid) from public, anon;
grant execute on function public.service_admin_detail(uuid) to authenticated;
