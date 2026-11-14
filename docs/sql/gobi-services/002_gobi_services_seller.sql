-- GOBI SERVICES — Fase 2: aktivasi penyedia jasa dan pembuatan / pengelolaan jasa (fungsi tulis).
-- Prasyarat: docs/sql/gobi-services/001_gobi_services_core.sql sudah dijalankan. Idempotent.
-- Semua perubahan jasa lewat fungsi di bawah (SECURITY DEFINER, divalidasi di database).
-- Perpindahan status oleh pemilik tetap dijaga trigger _services_guard (Fase 1): fungsi di sini hanya
-- menyalakan bendera 'gobi.services_rpc' di service_submit dan saat penyuntingan ulang yang butuh moderasi ulang.
--
-- Fungsi untuk klien:
--   service_activate_seller(_tagline, _response_hours, _accept_terms)
--   service_save(_id, _core, _packages, _addons, _faqs, _gallery) -> uuid   (null pada argumen daftar = tidak diubah)
--   service_submit(_id) -> text      (draft/ditolak -> pending_review atau published, sesuai pengaturan moderasi)
--   service_set_status(_id, _to)     (pause / lanjutkan / arsip / kembali ke draft / tarik dari moderasi)
--   service_delete_draft(_id)

-- ============ Pembantu validasi ============
create or replace function public._service_text(_v jsonb, _key text, _min int, _max int, _label text)
returns text language plpgsql immutable as $$
declare s text := btrim(coalesce(_v ->> _key, ''));
begin
  if length(s) < _min or length(s) > _max then
    raise exception '% harus % sampai % karakter', _label, _min, _max;
  end if;
  return s;
end $$;

create or replace function public._service_int(_v jsonb, _key text, _min bigint, _max bigint, _label text)
returns bigint language plpgsql immutable as $$
declare s text := _v ->> _key;
begin
  if s is null or s !~ '^[0-9]{1,11}$' or s::bigint < _min or s::bigint > _max then
    raise exception '% harus bilangan bulat % sampai %', _label, _min, _max;
  end if;
  return s::bigint;
end $$;

create or replace function public._service_url(_s text, _label text)
returns text language plpgsql immutable as $$
begin
  if _s is null or btrim(_s) = '' then return null; end if;
  if length(_s) > 2000 or btrim(_s) !~ '^https://[^[:space:]]+$' then
    raise exception '% harus berupa tautan https', _label;
  end if;
  return btrim(_s);
end $$;

create or replace function public._service_text_array(_v jsonb, _max_items int, _max_len int, _label text)
returns text[] language plpgsql immutable as $$
declare out text[] := '{}'; x text;
begin
  if _v is null or jsonb_typeof(_v) = 'null' then return out; end if;
  if jsonb_typeof(_v) <> 'array' then raise exception '% tidak valid', _label; end if;
  if jsonb_array_length(_v) > _max_items then raise exception '% maksimal % butir', _label, _max_items; end if;
  for x in select jsonb_array_elements_text(_v) loop
    x := btrim(x);
    if x = '' then continue; end if;
    if length(x) > _max_len then raise exception '% maksimal % karakter per butir', _label, _max_len; end if;
    out := out || x;
  end loop;
  return out;
end $$;

-- Kategori lama (market.ts) tetap diisi supaya halaman /jasa yang ada tetap menampilkan label yang masuk akal.
create or replace function public._service_legacy_category(_slug text)
returns text language sql immutable as $$
  select case
    when _slug in ('website-development','landing-page','company-profile','e-commerce','web-application','frontend','backend',
                   'api-development','database','bug-fixing','maintenance','hosting-setup','domain-setup') then 'website'
    when _slug in ('android-application','ios-application') then 'aplikasi-mobile'
    when _slug in ('ui-ux','logo','graphic-design','banner','website-design','mobile-app-design','branding') then 'desain'
    else 'lainnya'
  end
$$;

revoke all on function public._service_text(jsonb, text, int, int, text) from public, anon, authenticated;
revoke all on function public._service_int(jsonb, text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public._service_url(text, text) from public, anon, authenticated;
revoke all on function public._service_text_array(jsonb, int, int, text) from public, anon, authenticated;
revoke all on function public._service_legacy_category(text) from public, anon, authenticated;

-- ============ Pembantu kepemilikan ============
-- Mengunci baris jasa dan memastikan pemanggil adalah pemiliknya.
create or replace function public._service_own(_id uuid)
returns public.services language plpgsql security definer set search_path = public as $$
declare r public.services;
begin
  perform public._service_guard();
  select * into r from public.services where id = _id for update;
  if not found or r.owner_id <> auth.uid() then raise exception 'Jasa tidak ditemukan'; end if;
  return r;
end $$;
revoke all on function public._service_own(uuid) from public, anon, authenticated;

create or replace function public._service_require_seller()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.service_seller_profiles where user_id = auth.uid() and is_active and suspended_at is null) then
    raise exception 'Aktifkan profil penyedia jasa dulu';
  end if;
end $$;
revoke all on function public._service_require_seller() from public, anon, authenticated;

-- Daftar kekurangan sebelum jasa boleh diajukan. Cermin serviceReadiness di src/lib/services-owner.ts.
create or replace function public._service_readiness(_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare r public.services; probs text[] := '{}'; n int; tiers text[];
begin
  select * into r from public.services where id = _id;
  if length(btrim(r.title)) < 5 then probs := probs || 'Judul minimal 5 karakter'; end if;
  if length(btrim(r.description)) < 30 then probs := probs || 'Deskripsi minimal 30 karakter'; end if;
  if r.category_slug is null then probs := probs || 'Pilih kategori'; end if;
  if r.cover_url is null then probs := probs || 'Unggah gambar sampul'; end if;
  select count(*), array_agg(tier) into n, tiers from public.service_packages where service_id = _id and is_active;
  if n not in (1, 3) then
    probs := probs || 'Isi satu paket atau tiga paket';
  elsif n = 1 and tiers <> array['basic']::text[] then
    probs := probs || 'Paket tunggal memakai tingkat Basic';
  end if;
  return probs;
end $$;
revoke all on function public._service_readiness(uuid) from public, anon, authenticated;

-- ============ Aktivasi penyedia jasa ============
-- Hanya akun developer. Profil yang dibatasi admin (suspended_at) tidak bisa diaktifkan sendiri.
create or replace function public.service_activate_seller(_tagline text, _response_hours int, _accept_terms boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tag text := btrim(coalesce(_tagline, ''));
begin
  perform public._service_guard();
  if not exists (select 1 from public.profiles where id = uid and account_type = 'developer') then
    raise exception 'Hanya akun developer yang bisa membuka jasa';
  end if;
  if not coalesce(_accept_terms, false) then raise exception 'Setujui ketentuan penyedia jasa'; end if;
  if length(tag) > 120 then raise exception 'Tagline maksimal 120 karakter'; end if;
  if _response_hours is not null and (_response_hours < 1 or _response_hours > 720) then
    raise exception 'Waktu respons harus 1 sampai 720 jam';
  end if;
  if exists (select 1 from public.service_seller_profiles where user_id = uid and suspended_at is not null) then
    raise exception 'Profil penyedia jasa kamu sedang dibatasi admin';
  end if;
  insert into public.service_seller_profiles (user_id, is_active, tagline, response_time_hours, terms_accepted_at, activated_at)
  values (uid, true, tag, _response_hours, now(), now())
  on conflict (user_id) do update set
    is_active = true,
    tagline = excluded.tagline,
    response_time_hours = excluded.response_time_hours,
    terms_accepted_at = coalesce(public.service_seller_profiles.terms_accepted_at, now()),
    activated_at = coalesce(public.service_seller_profiles.activated_at, now()),
    updated_at = now();
end $$;
revoke all on function public.service_activate_seller(text, int, boolean) from public, anon;
grant execute on function public.service_activate_seller(text, int, boolean) to authenticated;

-- ============ Simpan jasa (inti + paket + add-on + FAQ + galeri dalam satu transaksi) ============
-- _id null = buat draf baru. _packages/_addons/_faqs/_gallery: null = tidak diubah, array = ganti seluruhnya.
-- Jasa terbit yang diedit judul / deskripsi / kategorinya kembali ke pending_review bila moderasi aktif.
create or replace function public.service_save(
  _id uuid, _core jsonb, _packages jsonb default null, _addons jsonb default null, _faqs jsonb default null, _gallery jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r public.services;
  sid uuid;
  creating boolean := _id is null;
  t text; sm text; descr text; breq text; rterms text; slim text;
  cat text; sub text; skl text[]; cover text; legacy text;
  moderated boolean; new_status text;
  el jsonb; kept uuid[]; k uuid; n int; tiers text[]; pos int;
  pmin bigint; dmin int;
  a_name text; a_desc text; a_price bigint; a_days int; a_revs int; a_active boolean;
begin
  perform public._service_guard();
  perform public._service_require_seller();
  if _core is null or jsonb_typeof(_core) <> 'object' then raise exception 'Data jasa tidak valid'; end if;

  if not creating then
    r := public._service_own(_id);
    if r.status = 'pending_review' then raise exception 'Jasa sedang ditinjau admin. Tarik ke draft dulu untuk mengubahnya'; end if;
    if r.status = 'archived' then raise exception 'Kembalikan jasa ke draft dulu untuk mengubahnya'; end if;
  end if;

  t := public._service_text(_core, 'title', 5, 120, 'Judul');
  sm := public._service_text(_core, 'summary', 0, 300, 'Ringkasan');
  descr := public._service_text(_core, 'description', 0, 20000, 'Deskripsi');
  breq := public._service_text(_core, 'buyer_requirements', 0, 4000, 'Syarat dari pembeli');
  rterms := public._service_text(_core, 'revision_terms', 0, 4000, 'Ketentuan revisi');
  slim := public._service_text(_core, 'scope_limits', 0, 4000, 'Batas ruang lingkup');
  cat := nullif(btrim(coalesce(_core ->> 'category_slug', '')), '');
  if cat is not null and not exists (select 1 from public.service_categories where slug = cat and active) then
    raise exception 'Kategori tidak valid';
  end if;
  sub := nullif(btrim(coalesce(_core ->> 'subcategory_slug', '')), '');
  if sub is not null and (cat is null or not exists (
      select 1 from public.service_subcategories where slug = sub and category_slug = cat and active)) then
    raise exception 'Subkategori tidak valid';
  end if;
  skl := public._service_text_array(_core -> 'skills', 15, 30, 'Skill');
  cover := public._service_url(_core ->> 'cover_url', 'Gambar sampul');
  legacy := case when cat is null then null else public._service_legacy_category(cat) end;

  if creating then
    sid := gen_random_uuid();
    insert into public.services (id, owner_id, title, summary, description, category, status, is_active, price_from, delivery_days,
      cover_url, category_slug, subcategory_slug, skills, buyer_requirements, revision_terms, scope_limits)
    values (sid, uid, t, sm, descr, coalesce(legacy, 'lainnya'), 'draft', false, 0, 7,
      cover, cat, sub, skl, breq, rterms, slim);
  else
    sid := r.id;
    moderated := coalesce((select (value #>> '{}') = 'true' from public.service_settings where key = 'require_moderation'), false);
    new_status := r.status;
    if r.status = 'published' and moderated
       and (r.title is distinct from t or r.description is distinct from descr or r.category_slug is distinct from cat) then
      new_status := 'pending_review';
      perform set_config('gobi.services_rpc', '1', true);
    end if;
    update public.services set
      title = t, summary = sm, description = descr, category = coalesce(legacy, category), cover_url = cover,
      category_slug = cat, subcategory_slug = sub, skills = skl,
      buyer_requirements = breq, revision_terms = rterms, scope_limits = slim, status = new_status
    where id = sid;
  end if;

  -- Paket
  if _packages is not null then
    if jsonb_typeof(_packages) <> 'array' then raise exception 'Paket tidak valid'; end if;
    n := jsonb_array_length(_packages);
    if n not in (0, 1, 3) then raise exception 'Pakai satu paket atau tiga paket'; end if;
    if n = 0 and not creating and r.status <> 'draft'
       and exists (select 1 from public.service_packages where service_id = sid) then
      raise exception 'Jasa yang sudah diajukan harus tetap punya paket';
    end if;
    tiers := array(select distinct (e ->> 'tier') from jsonb_array_elements(_packages) as e);
    if n = 1 and tiers <> array['basic']::text[] then raise exception 'Paket tunggal memakai tingkat Basic'; end if;
    if n = 3 and not (tiers @> array['basic','standard','premium']::text[] and cardinality(tiers) = 3) then
      raise exception 'Tiga paket harus Basic, Standard, dan Premium';
    end if;
    for el in select e from jsonb_array_elements(_packages) as e loop
      if (el ->> 'tier') is null or (el ->> 'tier') not in ('basic','standard','premium') then
        raise exception 'Tingkat paket tidak valid';
      end if;
      insert into public.service_packages (service_id, tier, name, description, price, delivery_days, revisions, features, work_limit, is_active)
      values (sid, el ->> 'tier',
        public._service_text(el, 'name', 2, 80, 'Nama paket'),
        public._service_text(el, 'description', 0, 1000, 'Deskripsi paket'),
        public._service_int(el, 'price', 1, 10000000000, 'Harga paket'),
        public._service_int(el, 'delivery_days', 1, 365, 'Waktu pengerjaan')::int,
        public._service_int(el, 'revisions', 0, 99, 'Jumlah revisi')::int,
        public._service_text_array(el -> 'features', 12, 120, 'Fitur paket'),
        public._service_text(el, 'work_limit', 0, 500, 'Batas pekerjaan'),
        coalesce((el ->> 'is_active')::boolean, true))
      on conflict (service_id, tier) do update set
        name = excluded.name, description = excluded.description, price = excluded.price,
        delivery_days = excluded.delivery_days, revisions = excluded.revisions, features = excluded.features,
        work_limit = excluded.work_limit, is_active = excluded.is_active, updated_at = now();
    end loop;
    delete from public.service_packages where service_id = sid and tier <> all (tiers);
    select min(price), min(delivery_days) into pmin, dmin from public.service_packages where service_id = sid and is_active;
    if pmin is not null then
      update public.services set price_from = pmin, delivery_days = dmin where id = sid;
    end if;
  end if;

  -- Add-on
  if _addons is not null then
    if jsonb_typeof(_addons) <> 'array' or jsonb_array_length(_addons) > 10 then raise exception 'Maksimal 10 add-on'; end if;
    kept := '{}'::uuid[];
    for el in select e from jsonb_array_elements(_addons) as e loop
      a_name := public._service_text(el, 'name', 2, 80, 'Nama add-on');
      a_desc := public._service_text(el, 'description', 0, 500, 'Deskripsi add-on');
      a_price := public._service_int(el, 'price', 1, 10000000000, 'Harga add-on');
      a_days := public._service_int(el, 'extra_days', 0, 365, 'Tambahan hari')::int;
      a_revs := public._service_int(el, 'extra_revisions', 0, 99, 'Tambahan revisi')::int;
      a_active := coalesce((el ->> 'is_active')::boolean, true);
      k := null;
      if coalesce(el ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select id into k from public.service_addons where id = (el ->> 'id')::uuid and service_id = sid;
      end if;
      if k is not null then
        update public.service_addons set name = a_name, description = a_desc, price = a_price,
          extra_days = a_days, extra_revisions = a_revs, is_active = a_active where id = k;
      else
        insert into public.service_addons (service_id, name, description, price, extra_days, extra_revisions, is_active)
        values (sid, a_name, a_desc, a_price, a_days, a_revs, a_active) returning id into k;
      end if;
      kept := kept || k;
    end loop;
    delete from public.service_addons where service_id = sid and id <> all (kept);
  end if;

  -- FAQ
  if _faqs is not null then
    if jsonb_typeof(_faqs) <> 'array' or jsonb_array_length(_faqs) > 10 then raise exception 'Maksimal 10 FAQ'; end if;
    delete from public.service_faqs where service_id = sid;
    pos := 0;
    for el in select e from jsonb_array_elements(_faqs) as e loop
      insert into public.service_faqs (service_id, question, answer, position)
      values (sid, public._service_text(el, 'question', 5, 200, 'Pertanyaan FAQ'), public._service_text(el, 'answer', 5, 2000, 'Jawaban FAQ'), pos);
      pos := pos + 1;
    end loop;
  end if;

  -- Galeri (hanya gambar; penautan portofolio menyusul)
  if _gallery is not null then
    if jsonb_typeof(_gallery) <> 'array' or jsonb_array_length(_gallery) > 8 then raise exception 'Maksimal 8 gambar galeri'; end if;
    delete from public.service_gallery where service_id = sid;
    pos := 0;
    for el in select e from jsonb_array_elements(_gallery) as e loop
      if public._service_url(el ->> 'url', 'Gambar galeri') is null then raise exception 'Gambar galeri tidak valid'; end if;
      insert into public.service_gallery (service_id, url, caption, position)
      values (sid, public._service_url(el ->> 'url', 'Gambar galeri'), public._service_text(el, 'caption', 0, 200, 'Keterangan gambar'), pos);
      pos := pos + 1;
    end loop;
  end if;

  return sid;
end $$;
revoke all on function public.service_save(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.service_save(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ============ Ajukan / terbitkan ============
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
  update public.services set status = target, moderation_note = null where id = r.id;
  perform public._service_notify(r.owner_id,
    case when target = 'published' then 'service_published' else 'service_pending_review' end,
    case when target = 'published' then 'Jasa kamu sudah terbit: ' else 'Jasa kamu menunggu moderasi: ' end || left(r.title, 80),
    '/studio/jasa/' || r.id::text);
  return target;
end $$;
revoke all on function public.service_submit(uuid) from public, anon;
grant execute on function public.service_submit(uuid) to authenticated;

-- ============ Ubah status oleh pemilik ============
-- Aturan perpindahan ditegakkan trigger _services_guard. Menerbitkan dari draft/ditolak wajib lewat service_submit.
create or replace function public.service_set_status(_id uuid, _to text)
returns text language plpgsql security definer set search_path = public as $$
declare r public.services;
begin
  if _to is null or _to not in ('draft', 'paused', 'published', 'archived') then raise exception 'Status tujuan tidak valid'; end if;
  r := public._service_own(_id);
  if r.admin_hold and r.status = 'paused' then raise exception 'Jasa ini ditahan admin. Hubungi admin untuk membukanya'; end if;
  if _to = 'published' and r.status <> 'paused' then raise exception 'Gunakan Ajukan / Terbitkan untuk menerbitkan jasa'; end if;
  if r.status = _to then return _to; end if;
  update public.services set status = _to where id = r.id;
  return _to;
end $$;
revoke all on function public.service_set_status(uuid, text) from public, anon;
grant execute on function public.service_set_status(uuid, text) to authenticated;

-- ============ Hapus draft ============
create or replace function public.service_delete_draft(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.services;
begin
  r := public._service_own(_id);
  if r.status <> 'draft' then raise exception 'Hanya draft yang bisa dihapus. Arsipkan jasa yang sudah pernah diajukan'; end if;
  if exists (select 1 from public.orders where service_id = r.id) then raise exception 'Jasa ini sudah punya pesanan'; end if;
  delete from public.services where id = r.id;
end $$;
revoke all on function public.service_delete_draft(uuid) from public, anon;
grant execute on function public.service_delete_draft(uuid) to authenticated;
