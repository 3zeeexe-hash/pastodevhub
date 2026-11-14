-- GOBI SERVICES — Fase 1: skema inti, RLS, pengaman status jasa, dan fungsi dasar.
-- Dijalankan lewat Lovable / SQL editor (lihat docs/gobi-services/RENCANA.md). Idempotent.
-- Tidak menyentuh tabel pembayaran: dana tetap lewat orders / payments / escrow_ledger / payouts (Midtrans).
-- Prasyarat (sudah ada di database): _is_admin(), _audit(), is_banned(_user), can_access_order(_order_id),
--   tabel services, orders, order_messages, profiles, portfolio_items, app_settings.
-- PERHATIAN: skrip ini memasang trigger di tabel `services` yang sudah dipakai halaman /jasa dan /studio/jasa.
--   Uji dulu di sandbox: buat/ubah/nonaktifkan jasa lewat Studio dan sembunyikan jasa lewat /admin/moderasi.

-- ============ Kategori ============
create table if not exists public.service_categories (
  slug text primary key,
  label text not null,
  group_label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.service_categories (slug, label, group_label, sort_order) values
  ('website-development','Website Development','Development',1),('landing-page','Landing Page','Development',2),
  ('company-profile','Company Profile','Development',3),('e-commerce','E-Commerce','Development',4),
  ('web-application','Web Application','Development',5),('android-application','Android Application','Development',6),
  ('ios-application','iOS Application','Development',7),('api-development','API Development','Development',8),
  ('backend','Backend','Development',9),('frontend','Frontend','Development',10),
  ('database','Database','Development',11),('bug-fixing','Bug Fixing','Development',12),
  ('maintenance','Maintenance','Development',13),('automation','Automation','Development',14),
  ('ui-ux','UI/UX','Design',15),('logo','Logo','Design',16),('graphic-design','Graphic Design','Design',17),
  ('banner','Banner','Design',18),('website-design','Website Design','Design',19),
  ('mobile-app-design','Mobile App Design','Design',20),('branding','Branding','Design',21),
  ('seo','SEO','Digital',22),('digital-marketing','Digital Marketing','Digital',23),
  ('content-writing','Content Writing','Digital',24),('hosting-setup','Hosting Setup','Digital',25),
  ('domain-setup','Domain Setup','Digital',26),('technical-consultation','Technical Consultation','Digital',27)
on conflict (slug) do nothing;

create table if not exists public.service_subcategories (
  slug text primary key,
  category_slug text not null references public.service_categories(slug) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_subcategories_cat_idx on public.service_subcategories (category_slug, sort_order);

-- ============ Pengaturan modul ============
-- Kunci yang dikenal: require_moderation (boolean), commission_percent (0-50, kosong = pakai app_settings.fee_percent),
-- auto_complete_days (0-60, 0 = penyelesaian otomatis mati).
create table if not exists public.service_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.service_settings (key, value) values
  ('require_moderation', 'false'::jsonb),
  ('auto_complete_days', '0'::jsonb)
on conflict (key) do nothing;

-- ============ Profil penyedia jasa ============
create table if not exists public.service_seller_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean not null default false,
  tagline text not null default '',
  response_time_hours int check (response_time_hours is null or response_time_hours between 1 and 720),
  terms_accepted_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Perluasan services (hanya menambah kolom) ============
-- Kolom lama (owner_id, title, summary, description, category, price_from, delivery_days, cover_url, is_active) tetap dipakai.
-- Default 'published' menjaga perilaku lama: jasa yang dibuat lewat Studio lama langsung tampil seperti sebelumnya.
alter table public.services
  add column if not exists status text not null default 'published' check (status in ('draft','pending_review','published','rejected','paused','archived')),
  add column if not exists category_slug text references public.service_categories(slug),
  add column if not exists subcategory_slug text references public.service_subcategories(slug),
  add column if not exists skills text[] not null default '{}',
  add column if not exists buyer_requirements text not null default '',
  add column if not exists revision_terms text not null default '',
  add column if not exists scope_limits text not null default '',
  add column if not exists moderation_note text,
  add column if not exists admin_hold boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_count int not null default 0,
  add column if not exists orders_completed int not null default 0;

-- Isi ulang data lama SEBELUM trigger dipasang: jasa nonaktif menjadi 'paused', semua yang pernah tampil dapat published_at.
update public.services set status = 'paused' where status = 'published' and is_active = false and published_at is null;
update public.services set published_at = created_at where published_at is null and status in ('published','paused');

create index if not exists services_browse_idx on public.services (status, is_active, created_at desc);
create index if not exists services_category_slug_idx on public.services (category_slug, status);
create index if not exists services_owner_status_idx on public.services (owner_id, status);

-- ============ Paket, add-on, galeri, FAQ, favorit ============
create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  tier text not null check (tier in ('basic','standard','premium')),
  name text not null,
  description text not null default '',
  price bigint not null check (price > 0 and price <= 10000000000),
  delivery_days int not null check (delivery_days between 1 and 365),
  revisions int not null default 1 check (revisions between 0 and 99),
  features text[] not null default '{}',
  work_limit text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, tier)
);

create table if not exists public.service_addons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  description text not null default '',
  price bigint not null check (price > 0 and price <= 10000000000),
  extra_days int not null default 0 check (extra_days between 0 and 365),
  extra_revisions int not null default 0 check (extra_revisions between 0 and 99),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_addons_service_idx on public.service_addons (service_id);

create table if not exists public.service_gallery (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  url text,
  portfolio_item_id uuid references public.portfolio_items(id) on delete set null,
  caption text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (url is not null or portfolio_item_id is not null)
);
create index if not exists service_gallery_service_idx on public.service_gallery (service_id, position);

create table if not exists public.service_faqs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  question text not null,
  answer text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_faqs_service_idx on public.service_faqs (service_id, position);

create table if not exists public.service_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

-- ============ Detail pesanan jasa (1:1 dengan orders; uang tetap di orders/payments/escrow_ledger) ============
create table if not exists public.service_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  package_id uuid references public.service_packages(id) on delete set null,
  is_custom boolean not null default false,
  stage text not null default 'awaiting_payment' check (stage in (
    'awaiting_payment','payment_processing','paid','pending_seller_acceptance','in_progress','submitted',
    'revision_requested','completed','cancel_requested','cancelled','disputed','refunded','partially_refunded')),
  prev_stage text,
  package_snapshot jsonb not null default '{}'::jsonb,
  delivery_days int not null default 1 check (delivery_days between 1 and 730),
  revisions_included int not null default 0 check (revisions_included >= 0),
  revisions_used int not null default 0 check (revisions_used >= 0),
  terms_accepted_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  due_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  auto_complete_at timestamptz,
  cancel_requested_by uuid references public.profiles(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (revisions_used <= revisions_included)
);
create index if not exists service_orders_stage_idx on public.service_orders (stage, created_at desc);
create index if not exists service_orders_package_idx on public.service_orders (package_id);

create table if not exists public.service_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('package','addon')),
  addon_id uuid references public.service_addons(id) on delete set null,
  name text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity int not null default 1 check (quantity between 1 and 10),
  extra_days int not null default 0 check (extra_days >= 0),
  extra_revisions int not null default 0 check (extra_revisions >= 0),
  created_at timestamptz not null default now()
);
create index if not exists service_order_items_order_idx on public.service_order_items (order_id);

-- Riwayat perubahan status pesanan (setiap perubahan tercatat; ditulis hanya oleh _service_move_stage).
create table if not exists public.service_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid,
  event text not null,
  from_stage text,
  to_stage text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists service_order_events_idx on public.service_order_events (order_id, id);

create table if not exists public.service_requirements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  kind text not null default 'brief' check (kind in ('brief','reference','clarification')),
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists service_requirements_order_idx on public.service_requirements (order_id, created_at);

create table if not exists public.service_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id),
  note text not null,
  demo_url text,
  repo_url text,
  links text[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  revision_no int not null default 0 check (revision_no >= 0),
  created_at timestamptz not null default now()
);
create index if not exists service_submissions_order_idx on public.service_submissions (order_id, created_at);

create table if not exists public.service_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  submission_id uuid references public.service_submissions(id) on delete set null,
  buyer_id uuid not null references public.profiles(id),
  note text not null,
  counted boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_revisions_order_idx on public.service_revisions (order_id, created_at);

-- ============ Ulasan ============
create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  seller_reply text,
  replied_at timestamptz,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_reviews_service_idx on public.service_reviews (service_id, created_at desc);
create index if not exists service_reviews_seller_idx on public.service_reviews (seller_id, created_at desc);

-- ============ Sengketa & laporan ============
create table if not exists public.service_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  opened_by uuid not null references public.profiles(id),
  reason text not null,
  prev_stage text,
  status text not null default 'open' check (status in ('open','under_review','waiting_buyer','waiting_seller','resolved','rejected','closed')),
  decision text check (decision in ('favor_buyer','favor_seller','split','dismissed')),
  refund_amount bigint check (refund_amount is null or refund_amount >= 0),
  decision_note text,
  considered jsonb not null default '[]'::jsonb,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists service_disputes_status_idx on public.service_disputes (status, created_at desc);
-- Satu sengketa aktif per pesanan.
create unique index if not exists service_disputes_one_active on public.service_disputes (order_id)
  where status in ('open','under_review','waiting_buyer','waiting_seller');

create table if not exists public.service_dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.service_disputes(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  note text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists service_dispute_evidence_idx on public.service_dispute_evidence (dispute_id, created_at);

create table if not exists public.service_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('service','profile','order','review')),
  target_id text not null,
  reason text not null check (reason in ('fraud','spam','abuse','policy','other')),
  detail text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  admin_note text,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_reports_status_idx on public.service_reports (status, created_at desc);

-- ============ Notifikasi (dedupe_key mencegah notifikasi ganda akibat webhook / retry) ============
create table if not exists public.service_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists service_notifications_idx on public.service_notifications (user_id, read_at, created_at desc);
create unique index if not exists service_notifications_dedupe on public.service_notifications (user_id, dedupe_key) where dedupe_key is not null;

-- ============ Pembantu akses (dipakai kebijakan baca) ============
create or replace function public.service_visible(_service_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.services s
    where s.id = _service_id
      and ((s.status = 'published' and s.is_active) or s.owner_id = auth.uid() or public._is_admin())
  )
$$;
revoke all on function public.service_visible(uuid) from public;
grant execute on function public.service_visible(uuid) to anon, authenticated;

create or replace function public.service_can_manage(_service_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.services s where s.id = _service_id and (s.owner_id = auth.uid() or public._is_admin())
  )
$$;
revoke all on function public.service_can_manage(uuid) from public;
grant execute on function public.service_can_manage(uuid) to anon, authenticated;

-- Komisi aktif: pengaturan khusus jasa kalau ada, kalau tidak pakai komisi global app_settings.fee_percent.
create or replace function public.service_commission_percent()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (value #>> '{}')::numeric from public.service_settings where key = 'commission_percent' and jsonb_typeof(value) = 'number'),
    (select fee_percent::numeric from public.app_settings order by id limit 1),
    0)
$$;
revoke all on function public.service_commission_percent() from public;
grant execute on function public.service_commission_percent() to anon, authenticated;

create or replace function public.service_public_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'require_moderation', coalesce((select (value #>> '{}') = 'true' from public.service_settings where key = 'require_moderation'), false),
    'auto_complete_days', coalesce((select (value #>> '{}')::int from public.service_settings where key = 'auto_complete_days' and jsonb_typeof(value) = 'number'), 0),
    'commission_percent', public.service_commission_percent())
$$;
revoke all on function public.service_public_config() from public;
grant execute on function public.service_public_config() to anon, authenticated;

-- ============ Akses baca (RLS). Tulis hanya lewat fungsi SECURITY DEFINER ============
do $$
declare t text;
begin
  foreach t in array array[
    'service_categories','service_subcategories','service_settings','service_seller_profiles','service_packages','service_addons',
    'service_gallery','service_faqs','service_favorites','service_orders','service_order_items','service_order_events',
    'service_requirements','service_submissions','service_revisions','service_reviews','service_disputes',
    'service_dispute_evidence','service_reports','service_notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant select on public.service_categories, public.service_subcategories, public.service_seller_profiles,
  public.service_packages, public.service_addons, public.service_gallery, public.service_faqs, public.service_reviews to anon;

drop policy if exists service_categories_read on public.service_categories;
create policy service_categories_read on public.service_categories for select using (active);
drop policy if exists service_categories_admin_read on public.service_categories;
create policy service_categories_admin_read on public.service_categories for select to authenticated using (public._is_admin());
drop policy if exists service_subcategories_read on public.service_subcategories;
create policy service_subcategories_read on public.service_subcategories for select using (active);
drop policy if exists service_subcategories_admin_read on public.service_subcategories;
create policy service_subcategories_admin_read on public.service_subcategories for select to authenticated using (public._is_admin());

drop policy if exists service_settings_read on public.service_settings;
create policy service_settings_read on public.service_settings for select to authenticated using (public._is_admin());

drop policy if exists service_seller_profiles_read on public.service_seller_profiles;
create policy service_seller_profiles_read on public.service_seller_profiles for select using (is_active);
drop policy if exists service_seller_profiles_own_read on public.service_seller_profiles;
create policy service_seller_profiles_own_read on public.service_seller_profiles for select to authenticated using (user_id = auth.uid() or public._is_admin());

-- Paket, add-on, galeri, FAQ ikut terlihat hanya kalau jasanya terlihat (terbit, milik sendiri, atau admin).
drop policy if exists service_packages_read on public.service_packages;
create policy service_packages_read on public.service_packages for select using (public.service_visible(service_id) and (is_active or public.service_can_manage(service_id)));
drop policy if exists service_addons_read on public.service_addons;
create policy service_addons_read on public.service_addons for select using (public.service_visible(service_id) and (is_active or public.service_can_manage(service_id)));
drop policy if exists service_gallery_read on public.service_gallery;
create policy service_gallery_read on public.service_gallery for select using (public.service_visible(service_id));
drop policy if exists service_faqs_read on public.service_faqs;
create policy service_faqs_read on public.service_faqs for select using (public.service_visible(service_id));

drop policy if exists service_favorites_read on public.service_favorites;
create policy service_favorites_read on public.service_favorites for select to authenticated using (user_id = auth.uid());

-- Pesanan dan turunannya: hanya pembeli, penjual, dan admin (can_access_order yang sudah ada).
drop policy if exists service_orders_read on public.service_orders;
create policy service_orders_read on public.service_orders for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_order_items_read on public.service_order_items;
create policy service_order_items_read on public.service_order_items for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_order_events_read on public.service_order_events;
create policy service_order_events_read on public.service_order_events for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_requirements_read on public.service_requirements;
create policy service_requirements_read on public.service_requirements for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_submissions_read on public.service_submissions;
create policy service_submissions_read on public.service_submissions for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_revisions_read on public.service_revisions;
create policy service_revisions_read on public.service_revisions for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_disputes_read on public.service_disputes;
create policy service_disputes_read on public.service_disputes for select to authenticated using (public.can_access_order(order_id));
drop policy if exists service_dispute_evidence_read on public.service_dispute_evidence;
create policy service_dispute_evidence_read on public.service_dispute_evidence for select to authenticated using (
  exists (select 1 from public.service_disputes d where d.id = dispute_id and public.can_access_order(d.order_id)));

-- Ulasan terlihat publik kecuali disembunyikan moderator; pihak terkait dan admin tetap bisa melihatnya.
drop policy if exists service_reviews_read on public.service_reviews;
create policy service_reviews_read on public.service_reviews for select using (is_visible);
drop policy if exists service_reviews_party_read on public.service_reviews;
create policy service_reviews_party_read on public.service_reviews for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid() or public._is_admin());

drop policy if exists service_reports_read on public.service_reports;
create policy service_reports_read on public.service_reports for select to authenticated using (reporter_id = auth.uid() or public._is_admin());
drop policy if exists service_notifications_read on public.service_notifications;
create policy service_notifications_read on public.service_notifications for select to authenticated using (user_id = auth.uid());

-- ============ Pengaman status jasa ============
-- Perpindahan status yang boleh dilakukan pemilik jasa. Admin / fungsi server tidak dibatasi oleh daftar ini.
create or replace function public._service_owner_move_ok(_from text, _to text, _moderated boolean, _hold boolean, _was_published boolean)
returns boolean language sql immutable as $$
  select case
    when _from = _to then true
    when _from = 'draft' then _to in ('pending_review','archived') or (_to = 'published' and not _moderated)
    when _from = 'pending_review' then _to = 'draft'
    when _from = 'published' then _to in ('paused','archived')
    when _from = 'paused' then (_to = 'archived' and not _hold) or (_to = 'published' and not _hold and (not _moderated or _was_published))
    when _from = 'rejected' then _to in ('draft','pending_review')
    when _from = 'archived' then _to = 'draft'
    else false
  end
$$;
revoke all on function public._service_owner_move_ok(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public._service_owner_move_ok(text, text, boolean, boolean, boolean) to authenticated;

-- Trigger: pemilik tidak bisa menerbitkan jasa yang butuh moderasi, tidak bisa membuka jasa yang ditahan admin,
-- tidak bisa mengubah rating/penghitung/catatan moderasi; is_active selalu mengikuti status.
-- Toggle is_active lama (Studio) diterjemahkan ke status: aktif <-> published/paused.
-- Fungsi server yang sah menyalakan bendera transaksi: perform set_config('gobi.services_rpc', '1', true).
create or replace function public._services_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin_actor boolean := coalesce(public._is_admin(), false);
  privileged boolean;
  moderated boolean;
  st text;
begin
  privileged := auth.uid() is null or admin_actor or coalesce(current_setting('gobi.services_rpc', true), '') = '1';
  moderated := coalesce((select (value #>> '{}') = 'true' from public.service_settings where key = 'require_moderation'), false);

  if tg_op = 'INSERT' then
    if not privileged then
      new.admin_hold := false; new.moderation_note := null; new.published_at := null;
      new.rating_avg := 0; new.rating_count := 0; new.orders_completed := 0;
      st := new.status;
      if st not in ('draft','published','paused') then st := 'draft'; end if;
      if st = 'published' and moderated then st := 'pending_review'; end if;
      new.status := st;
    end if;
  else
    if not privileged then
      new.owner_id := old.owner_id;
      new.admin_hold := old.admin_hold; new.moderation_note := old.moderation_note; new.published_at := old.published_at;
      new.rating_avg := old.rating_avg; new.rating_count := old.rating_count; new.orders_completed := old.orders_completed;
    end if;
    if new.status = old.status and new.is_active is distinct from old.is_active then
      if old.status = 'published' and not new.is_active then new.status := 'paused';
      elsif old.status = 'paused' and new.is_active then new.status := 'published';
      end if;
    end if;
    if new.status is distinct from old.status then
      if not privileged and not public._service_owner_move_ok(old.status, new.status, moderated, old.admin_hold, old.published_at is not null) then
        raise exception 'Perubahan status jasa dari % ke % tidak diizinkan', old.status, new.status;
      end if;
      if admin_actor then
        if new.status = 'paused' then new.admin_hold := true;
        elsif new.status = 'published' then new.admin_hold := false;
        end if;
      end if;
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  new.is_active := (new.status = 'published');
  return new;
end $$;
revoke all on function public._services_guard() from public, anon, authenticated;

drop trigger if exists services_guard on public.services;
create trigger services_guard before insert or update on public.services
  for each row execute function public._services_guard();

-- ============ Pembantu internal ============
create or replace function public._service_guard()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if public.is_banned(_user => auth.uid()) then raise exception 'Akun diblokir'; end if;
end $$;
revoke all on function public._service_guard() from public, anon, authenticated;

create or replace function public._service_notify(_user uuid, _kind text, _title text, _link text default null, _dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.service_notifications (user_id, kind, title, link, dedupe_key) values (_user, _kind, _title, _link, _dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke all on function public._service_notify(uuid, text, text, text, text) from public, anon, authenticated;

-- Alur status pesanan jasa. Cermin dari SERVICE_STAGE_TRANSITIONS di src/lib/services.ts.
-- 'paid' hanya dari pembayaran terverifikasi (webhook), dan 'refunded' / 'partially_refunded' hanya setelah konfirmasi refund.
create or replace function public._service_stage_ok(_from text, _to text)
returns boolean language sql immutable as $$
  select _to = any(case _from
    when 'awaiting_payment' then array['payment_processing','paid','cancelled']::text[]
    when 'payment_processing' then array['paid','awaiting_payment','cancelled']::text[]
    when 'paid' then array['pending_seller_acceptance','in_progress','refunded']::text[]
    when 'pending_seller_acceptance' then array['in_progress','cancelled','refunded']::text[]
    when 'in_progress' then array['submitted','cancel_requested','disputed']::text[]
    when 'submitted' then array['completed','revision_requested','disputed']::text[]
    when 'revision_requested' then array['submitted','cancel_requested','disputed']::text[]
    when 'cancel_requested' then array['cancelled','in_progress','submitted','revision_requested','disputed','refunded']::text[]
    when 'disputed' then array['in_progress','submitted','revision_requested','completed','cancelled','refunded','partially_refunded']::text[]
    when 'cancelled' then array['refunded','partially_refunded']::text[]
    else array[]::text[]
  end)
$$;
revoke all on function public._service_stage_ok(text, text) from public, anon;
grant execute on function public._service_stage_ok(text, text) to authenticated;

-- Satu-satunya pintu perubahan status pesanan jasa: memvalidasi transisi, mengunci baris, dan mencatat riwayat.
-- Memanggil dengan status yang sama dianggap berhasil (aman untuk retry webhook).
create or replace function public._service_move_stage(_order uuid, _to text, _event text, _detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select stage into cur from public.service_orders where order_id = _order for update;
  if not found then raise exception 'Pesanan jasa tidak ditemukan'; end if;
  if cur = _to then return; end if;
  if not public._service_stage_ok(cur, _to) then
    raise exception 'Perubahan status pesanan dari % ke % tidak diizinkan', cur, _to;
  end if;
  update public.service_orders set stage = _to, prev_stage = cur, updated_at = now() where order_id = _order;
  insert into public.service_order_events (order_id, actor_id, event, from_stage, to_stage, detail)
  values (_order, auth.uid(), _event, cur, _to, coalesce(_detail, '{}'::jsonb));
end $$;
revoke all on function public._service_move_stage(uuid, text, text, jsonb) from public, anon, authenticated;

-- ============ Admin ============
create or replace function public.service_admin_set_category(_slug text, _label text, _group text, _active boolean default true, _sort int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _slug is null or length(_slug) > 60 or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug tidak valid (huruf kecil, angka, tanda hubung)'; end if;
  if length(trim(coalesce(_label, ''))) < 2 or length(_label) > 80 then raise exception 'Nama kategori 2 sampai 80 karakter'; end if;
  if length(trim(coalesce(_group, ''))) < 2 or length(_group) > 40 then raise exception 'Nama grup 2 sampai 40 karakter'; end if;
  insert into public.service_categories (slug, label, group_label, sort_order, active)
  values (_slug, trim(_label), trim(_group), coalesce(_sort, 0), coalesce(_active, true))
  on conflict (slug) do update set label = excluded.label, group_label = excluded.group_label, sort_order = excluded.sort_order, active = excluded.active;
  perform public._audit(_action => 'service_category_set', _target_type => 'service_category', _target_id => _slug,
    _note => case when coalesce(_active, true) then 'aktif' else 'nonaktif' end);
end $$;
revoke all on function public.service_admin_set_category(text, text, text, boolean, int) from public, anon;
grant execute on function public.service_admin_set_category(text, text, text, boolean, int) to authenticated;

create or replace function public.service_admin_set_subcategory(_slug text, _category_slug text, _label text, _active boolean default true, _sort int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _slug is null or length(_slug) > 80 or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug tidak valid (huruf kecil, angka, tanda hubung)'; end if;
  if not exists (select 1 from public.service_categories where slug = _category_slug) then raise exception 'Kategori induk tidak ditemukan'; end if;
  if length(trim(coalesce(_label, ''))) < 2 or length(_label) > 80 then raise exception 'Nama subkategori 2 sampai 80 karakter'; end if;
  insert into public.service_subcategories (slug, category_slug, label, sort_order, active)
  values (_slug, _category_slug, trim(_label), coalesce(_sort, 0), coalesce(_active, true))
  on conflict (slug) do update set category_slug = excluded.category_slug, label = excluded.label, sort_order = excluded.sort_order, active = excluded.active;
  perform public._audit(_action => 'service_subcategory_set', _target_type => 'service_subcategory', _target_id => _slug,
    _note => case when coalesce(_active, true) then 'aktif' else 'nonaktif' end);
end $$;
revoke all on function public.service_admin_set_subcategory(text, text, text, boolean, int) from public, anon;
grant execute on function public.service_admin_set_subcategory(text, text, text, boolean, int) to authenticated;

-- Biaya layanan untuk pembeli sengaja belum ada: butuh keputusan desain escrow di Fase 6.
create or replace function public.service_admin_set_setting(_key text, _value jsonb, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare n numeric;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Isi alasan perubahan (minimal 5 karakter)'; end if;
  if _key = 'require_moderation' then
    if jsonb_typeof(_value) is distinct from 'boolean' then raise exception 'Nilai harus true atau false'; end if;
  elsif _key = 'commission_percent' then
    if jsonb_typeof(_value) is distinct from 'number' then raise exception 'Komisi harus berupa angka'; end if;
    n := (_value #>> '{}')::numeric;
    if n < 0 or n > 50 then raise exception 'Komisi harus antara 0 dan 50 persen'; end if;
  elsif _key = 'auto_complete_days' then
    if jsonb_typeof(_value) is distinct from 'number' then raise exception 'Nilai harus berupa angka'; end if;
    n := (_value #>> '{}')::numeric;
    if n <> trunc(n) or n < 0 or n > 60 then raise exception 'Hari penyelesaian otomatis harus bilangan bulat 0 sampai 60'; end if;
  else
    raise exception 'Pengaturan tidak dikenal';
  end if;
  insert into public.service_settings (key, value, updated_at, updated_by) values (_key, _value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public._audit(_action => 'service_setting_set', _target_type => 'service_setting', _target_id => _key, _note => left(_note, 500));
end $$;
revoke all on function public.service_admin_set_setting(text, jsonb, text) from public, anon;
grant execute on function public.service_admin_set_setting(text, jsonb, text) to authenticated;

-- Hapus komisi khusus jasa: kembali memakai komisi global.
create or replace function public.service_admin_clear_commission(_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Isi alasan perubahan (minimal 5 karakter)'; end if;
  delete from public.service_settings where key = 'commission_percent';
  perform public._audit(_action => 'service_commission_clear', _target_type => 'service_setting', _target_id => 'commission_percent', _note => left(_note, 500));
end $$;
revoke all on function public.service_admin_clear_commission(text) from public, anon;
grant execute on function public.service_admin_clear_commission(text) to authenticated;

create or replace function public.service_mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.service_notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.service_mark_notifications_read() from public, anon;
grant execute on function public.service_mark_notifications_read() to authenticated;
