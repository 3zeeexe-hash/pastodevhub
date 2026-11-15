-- GOBI SERVICES — Fase 5: checkout dan pemesanan.
-- Prasyarat: 001–004 sudah dijalankan. Idempotent.
--
-- Pesanan jasa berbasis paket = satu baris `orders` (kind = 'service', status awal 'awaiting_payment', uang tetap di sana)
-- + lapisan detail 1:1 `service_orders` + `service_order_items` + `service_requirements` + riwayat `service_order_events`.
-- Harga SELALU dihitung ulang di database dari tabel paket dan add-on; angka dari klien tidak pernah dipercaya.
-- Pembayaran memakai alur Midtrans yang sudah ada (/pesanan/$id). Sinkronisasi `service_orders.stage` dengan pembayaran adalah Fase 6.
--
-- Fungsi untuk pembeli (harus masuk):
--   service_checkout_quote(_service_id, _package_id, _addons)      -> jsonb  (ringkasan biaya resmi dari server)
--   service_create_order(_service_id, _package_id, _addons, _brief, _references, _accept_terms, _request_key) -> uuid
--   service_request_custom(_service_id, _title, _description, _budget, _deadline, _note, _references) -> uuid

alter table public.service_orders add column if not exists request_key uuid;
create unique index if not exists service_orders_request_key_idx on public.service_orders (request_key) where request_key is not null;

-- ============ Pembantu ============
-- Komisi dalam rupiah bulat (pembulatan sama dengan calcCommission di src/lib/work.ts).
create or replace function public._service_fee(_amount bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select round(_amount::numeric * public.service_commission_percent() / 100)::bigint
$$;
revoke all on function public._service_fee(bigint) from public, anon, authenticated;

-- Lampiran referensi: maks 5 tautan https (termasuk gambar yang diunggah). Mengembalikan array [{url, name}] yang sudah bersih.
create or replace function public._service_references(_refs jsonb)
returns jsonb language plpgsql immutable as $$
declare el jsonb; out jsonb := '[]'::jsonb; u text; nm text;
begin
  if _refs is null or jsonb_typeof(_refs) = 'null' then return out; end if;
  if jsonb_typeof(_refs) <> 'array' then raise exception 'Lampiran tidak valid'; end if;
  if jsonb_array_length(_refs) > 5 then raise exception 'Maksimal 5 lampiran'; end if;
  for el in select e from jsonb_array_elements(_refs) as e loop
    u := public._service_url(el ->> 'url', 'Tautan lampiran');
    if u is null then raise exception 'Tautan lampiran kosong'; end if;
    nm := public._service_text(el, 'name', 0, 120, 'Nama lampiran');
    out := out || jsonb_build_array(jsonb_build_object('url', u, 'name', nm));
  end loop;
  return out;
end $$;
revoke all on function public._service_references(jsonb) from public, anon, authenticated;

-- Menghitung harga dari paket + add-on. Satu-satunya sumber angka untuk quote dan pembuatan pesanan.
-- _addons: [{id, quantity}] (quantity 1–10, default 1; add-on yang sama tidak boleh dua kali).
create or replace function public._service_price(_service_id uuid, _package_id uuid, _addons jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pkg public.service_packages; ad public.service_addons; el jsonb;
  qty int; subtotal bigint; days int; revs int; items jsonb := '[]'::jsonb; seen uuid[] := '{}'::uuid[];
begin
  select * into pkg from public.service_packages where id = _package_id and service_id = _service_id and is_active;
  if not found then raise exception 'Paket tidak tersedia'; end if;
  subtotal := pkg.price; days := pkg.delivery_days; revs := pkg.revisions;
  items := items || jsonb_build_array(jsonb_build_object(
    'kind', 'package', 'id', pkg.id, 'name', pkg.name, 'unit_price', pkg.price, 'quantity', 1, 'extra_days', 0, 'extra_revisions', 0));

  if _addons is not null and jsonb_typeof(_addons) <> 'null' then
    if jsonb_typeof(_addons) <> 'array' then raise exception 'Add-on tidak valid'; end if;
    if jsonb_array_length(_addons) > 10 then raise exception 'Maksimal 10 add-on'; end if;
    for el in select e from jsonb_array_elements(_addons) as e loop
      if coalesce(el ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Add-on tidak valid';
      end if;
      if el ? 'quantity' then qty := public._service_int(el, 'quantity', 1, 10, 'Jumlah add-on')::int; else qty := 1; end if;
      select * into ad from public.service_addons where id = (el ->> 'id')::uuid and service_id = _service_id and is_active;
      if not found then raise exception 'Add-on tidak tersedia'; end if;
      if ad.id = any (seen) then raise exception 'Add-on yang sama dipilih dua kali'; end if;
      seen := seen || ad.id;
      subtotal := subtotal + ad.price * qty;
      days := days + ad.extra_days * qty;
      revs := revs + ad.extra_revisions * qty;
      items := items || jsonb_build_array(jsonb_build_object(
        'kind', 'addon', 'id', ad.id, 'name', ad.name, 'unit_price', ad.price, 'quantity', qty,
        'extra_days', ad.extra_days, 'extra_revisions', ad.extra_revisions));
    end loop;
  end if;

  if subtotal > 10000000000 then raise exception 'Total melebihi batas'; end if;
  if days > 730 then raise exception 'Total waktu pengerjaan melebihi batas'; end if;
  return jsonb_build_object('subtotal', subtotal, 'total', subtotal, 'delivery_days', days, 'revisions', revs, 'items', items, 'package', to_jsonb(pkg));
end $$;
revoke all on function public._service_price(uuid, uuid, jsonb) from public, anon, authenticated;

-- ============ Ringkasan biaya resmi ============
create or replace function public.service_checkout_quote(_service_id uuid, _package_id uuid, _addons jsonb default '[]'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p jsonb;
begin
  perform public._service_guard();
  if not exists (select 1 from public.services where id = _service_id and status = 'published' and is_active) then
    raise exception 'Jasa tidak tersedia';
  end if;
  p := public._service_price(_service_id, _package_id, _addons);
  return p - 'package';
end $$;
revoke all on function public.service_checkout_quote(uuid, uuid, jsonb) from public, anon;
grant execute on function public.service_checkout_quote(uuid, uuid, jsonb) to authenticated;

-- ============ Buat pesanan paket ============
-- Status awal Awaiting Payment. _request_key (uuid dari klien) membuat pemanggilan ulang (retry, klik ganda) mengembalikan
-- pesanan yang sama, bukan pesanan baru. Maksimal 10 pesanan jasa belum dibayar per pembeli.
create or replace function public.service_create_order(
  _service_id uuid, _package_id uuid, _addons jsonb default '[]'::jsonb, _brief text default '',
  _references jsonb default '[]'::jsonb, _accept_terms boolean default false, _request_key uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); svc public.services; price jsonb; pkg jsonb; it jsonb; refs jsonb;
  oid uuid; existing uuid; unpaid int; total bigint; fee bigint; b text := btrim(coalesce(_brief, ''));
begin
  perform public._service_guard();

  if _request_key is not null then
    select so.order_id into existing from public.service_orders so where so.request_key = _request_key;
    if existing is not null then
      if not exists (select 1 from public.orders where id = existing and buyer_id = uid) then raise exception 'Kunci permintaan tidak valid'; end if;
      return existing;
    end if;
  end if;

  if not coalesce(_accept_terms, false) then raise exception 'Setujui detail pesanan dan ketentuan jasa dulu'; end if;
  if length(b) < 10 or length(b) > 5000 then raise exception 'Kebutuhan harus 10 sampai 5000 karakter'; end if;

  select * into svc from public.services where id = _service_id and status = 'published' and is_active for share;
  if not found then raise exception 'Jasa tidak tersedia'; end if;
  if svc.owner_id = uid then raise exception 'Kamu tidak bisa memesan jasa milikmu sendiri'; end if;
  if public.is_banned(svc.owner_id) then raise exception 'Jasa tidak tersedia'; end if;
  if not exists (select 1 from public.service_seller_profiles where user_id = svc.owner_id and is_active and suspended_at is null) then
    raise exception 'Penjual belum aktif';
  end if;

  select count(*) into unpaid from public.orders o join public.service_orders so on so.order_id = o.id
  where o.buyer_id = uid and o.status = 'awaiting_payment';
  if unpaid >= 10 then raise exception 'Kamu punya terlalu banyak pesanan yang belum dibayar. Selesaikan atau batalkan dulu'; end if;

  refs := public._service_references(_references);
  price := public._service_price(_service_id, _package_id, _addons);
  pkg := price -> 'package';
  total := (price ->> 'total')::bigint;
  fee := public._service_fee(total);

  insert into public.orders (buyer_id, seller_id, kind, service_id, status, amount, fee_amount, title, brief)
  values (uid, svc.owner_id, 'service', svc.id, 'awaiting_payment', total, fee, left(svc.title || ' — ' || (pkg ->> 'name'), 150), b)
  returning id into oid;

  insert into public.service_orders (order_id, package_id, is_custom, stage, package_snapshot, delivery_days, revisions_included,
    terms_accepted_at, request_key)
  values (oid, _package_id, false, 'awaiting_payment',
    jsonb_build_object('service_title', svc.title, 'tier', pkg ->> 'tier', 'name', pkg ->> 'name', 'description', pkg ->> 'description',
      'price', (pkg ->> 'price')::bigint, 'delivery_days', (pkg ->> 'delivery_days')::int, 'revisions', (pkg ->> 'revisions')::int,
      'features', pkg -> 'features', 'work_limit', pkg ->> 'work_limit'),
    (price ->> 'delivery_days')::int, (price ->> 'revisions')::int, now(), _request_key);

  for it in select e from jsonb_array_elements(price -> 'items') as e loop
    insert into public.service_order_items (order_id, kind, addon_id, name, unit_price, quantity, extra_days, extra_revisions)
    values (oid, it ->> 'kind', case when it ->> 'kind' = 'addon' then (it ->> 'id')::uuid end, it ->> 'name',
      (it ->> 'unit_price')::bigint, (it ->> 'quantity')::int, (it ->> 'extra_days')::int, (it ->> 'extra_revisions')::int);
  end loop;

  insert into public.service_requirements (order_id, author_id, kind, body, attachments) values (oid, uid, 'brief', b, refs);

  insert into public.service_order_events (order_id, actor_id, event, from_stage, to_stage, detail)
  values (oid, uid, 'created', null, 'awaiting_payment',
    jsonb_build_object('total', total, 'package', pkg ->> 'name', 'items', jsonb_array_length(price -> 'items')));

  insert into public.order_messages (order_id, sender_id, body, is_system)
  values (oid, uid, 'Pesanan jasa dibuat (paket ' || (pkg ->> 'name') || '). Menunggu pembayaran.', true);

  return oid;
end $$;
revoke all on function public.service_create_order(uuid, uuid, jsonb, text, jsonb, boolean, uuid) from public, anon;
grant execute on function public.service_create_order(uuid, uuid, jsonb, text, jsonb, boolean, uuid) to authenticated;

-- ============ Permintaan khusus (custom order) ============
-- Memakai alur yang sudah ada: request_service membuat pesanan berstatus 'requested', lalu penjual menjawab dengan harga final
-- (respond_service_order) dan pembeli membayar. Fungsi ini menambahkan judul, tenggat, catatan, dan lampiran terstruktur.
-- Catatan: estimasi waktu dari penjual belum punya kolom di alur lama.
create or replace function public.service_request_custom(
  _service_id uuid, _title text, _description text, _budget bigint default null, _deadline date default null,
  _note text default '', _references jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); t text := btrim(coalesce(_title, '')); d text := btrim(coalesce(_description, ''));
  nt text := btrim(coalesce(_note, '')); refs jsonb; brief text; oid uuid;
begin
  perform public._service_guard();
  if length(t) < 5 or length(t) > 120 then raise exception 'Judul kebutuhan harus 5 sampai 120 karakter'; end if;
  if length(d) < 20 or length(d) > 4000 then raise exception 'Deskripsi harus 20 sampai 4000 karakter'; end if;
  if length(nt) > 1000 then raise exception 'Catatan maksimal 1000 karakter'; end if;
  if _budget is not null and (_budget < 1000 or _budget > 10000000000) then raise exception 'Budget harus antara Rp1.000 dan Rp10 miliar'; end if;
  if _deadline is not null and (_deadline < current_date or _deadline > current_date + 730) then
    raise exception 'Deadline harus antara hari ini dan 2 tahun ke depan';
  end if;
  if not exists (select 1 from public.services where id = _service_id and status = 'published' and is_active) then
    raise exception 'Jasa tidak tersedia';
  end if;
  refs := public._service_references(_references);

  brief := 'Permintaan khusus: ' || t || E'\n\n' || d
    || case when _deadline is not null then E'\n\nDeadline: ' || to_char(_deadline, 'DD-MM-YYYY') else '' end
    || case when nt <> '' then E'\n\nCatatan: ' || nt else '' end;

  -- Tipe parameter request_service tidak terlihat dari repo; literal teks mengikuti tipenya (integer / bigint / numeric).
  execute format('select public.request_service(%L, %L, %L)', _service_id, left(brief, 5000), _budget) into oid;

  insert into public.service_requirements (order_id, author_id, kind, body, attachments) values (oid, uid, 'brief', left(brief, 5000), refs);
  return oid;
end $$;
revoke all on function public.service_request_custom(uuid, text, text, bigint, date, text, jsonb) from public, anon;
grant execute on function public.service_request_custom(uuid, text, text, bigint, date, text, jsonb) to authenticated;
