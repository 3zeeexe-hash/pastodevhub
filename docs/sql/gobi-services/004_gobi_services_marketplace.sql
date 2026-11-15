-- GOBI SERVICES — Fase 4: marketplace (pencarian, filter, jasa populer/terbaru/rating, seller unggulan, favorit).
-- Prasyarat: 001–003 sudah dijalankan. Idempotent.
--
-- Hanya jasa terbit (status = 'published' dan is_active) dari penjual yang tidak diblokir yang pernah muncul di hasil.
-- Draft, menunggu moderasi, ditolak, dijeda, dan arsip tidak pernah tampil di marketplace publik.
--
-- Fungsi:
--   service_explore(...)            -> jsonb {total, rows[]}   (publik)
--   service_top_sellers(_limit)     -> jsonb []                (publik)
--   service_toggle_favorite(_id)    -> boolean                 (masuk dulu; true = sekarang difavoritkan)

create index if not exists services_popular_idx on public.services (orders_completed desc, rating_count desc) where status = 'published';
create index if not exists services_price_idx on public.services (price_from) where status = 'published';
create index if not exists service_favorites_service_idx on public.service_favorites (service_id);

-- ============ Jelajahi jasa ============
-- _sort: newest | popular | rating | price_asc | price_desc (nilai lain dianggap newest).
-- Pencarian: judul, ringkasan, skill, nama kategori, username / nama penjual. Harga 0 = "Nego": tidak ikut filter harga maksimum.
create or replace function public.service_explore(
  _q text default null, _category text default null, _subcategory text default null,
  _min_price bigint default null, _max_price bigint default null, _max_days int default null,
  _min_rating numeric default null, _verified_only boolean default false, _favorites_only boolean default false,
  _sort text default 'newest', _limit int default 24, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(_limit, 24), 1), 48);
  off int := greatest(coalesce(_offset, 0), 0);
  qq text := nullif(btrim(coalesce(_q, '')), '');
  pat text;
  srt text := case when _sort in ('newest', 'popular', 'rating', 'price_asc', 'price_desc') then _sort else 'newest' end;
  result jsonb;
begin
  if qq is not null then
    pat := '%' || replace(replace(replace(left(qq, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if _favorites_only and uid is null then
    return jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;

  with base as (
    select
      row_number() over (order by
        case when srt = 'popular' then s.orders_completed end desc nulls last,
        case when srt = 'popular' then s.rating_count end desc nulls last,
        case when srt = 'rating' then (s.rating_count > 0) end desc nulls last,
        case when srt = 'rating' then s.rating_avg end desc nulls last,
        case when srt = 'rating' then s.rating_count end desc nulls last,
        case when srt = 'price_asc' then (s.price_from = 0) end asc nulls last,
        case when srt = 'price_asc' then s.price_from end asc nulls last,
        case when srt = 'price_desc' then s.price_from end desc nulls last,
        s.published_at desc nulls last, s.created_at desc, s.id) as rn,
      jsonb_build_object(
        'id', s.id, 'title', s.title, 'summary', s.summary, 'cover_url', s.cover_url,
        'price_from', s.price_from, 'delivery_days', s.delivery_days,
        'category_slug', s.category_slug, 'category_label', c.label,
        'rating_avg', s.rating_avg, 'rating_count', s.rating_count, 'orders_completed', s.orders_completed,
        'created_at', s.created_at,
        'is_favorite', case when uid is null then false else exists (
          select 1 from public.service_favorites f where f.service_id = s.id and f.user_id = uid) end,
        'owner', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                    'avatar_url', p.avatar_url, 'is_verified', coalesce(p.is_verified, false))) as x
    from public.services s
    join public.profiles p on p.id = s.owner_id
    left join public.service_categories c on c.slug = s.category_slug
    where s.status = 'published' and s.is_active
      and not public.is_banned(s.owner_id)
      and (_category is null or s.category_slug = _category)
      and (_subcategory is null or s.subcategory_slug = _subcategory)
      and (_min_price is null or s.price_from >= _min_price)
      and (_max_price is null or (s.price_from > 0 and s.price_from <= _max_price))
      and (_max_days is null or s.delivery_days <= _max_days)
      and (_min_rating is null or (s.rating_count > 0 and s.rating_avg >= _min_rating))
      and (not coalesce(_verified_only, false) or coalesce(p.is_verified, false))
      and (not coalesce(_favorites_only, false) or exists (
            select 1 from public.service_favorites f where f.service_id = s.id and f.user_id = uid))
      and (pat is null
           or s.title ilike pat escape '\'
           or s.summary ilike pat escape '\'
           or array_to_string(s.skills, ' ') ilike pat escape '\'
           or coalesce(c.label, '') ilike pat escape '\'
           or p.username ilike pat escape '\'
           or coalesce(p.display_name, '') ilike pat escape '\')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(b.x order by b.rn) from (select * from base order by rn limit lim offset off) b), '[]'::jsonb))
  into result;
  return result;
end $$;
revoke all on function public.service_explore(text, text, text, bigint, bigint, int, numeric, boolean, boolean, text, int, int) from public;
grant execute on function public.service_explore(text, text, text, bigint, bigint, int, numeric, boolean, boolean, text, int, int) to anon, authenticated;

-- ============ Penjual unggulan ============
-- Diurut berdasarkan pesanan selesai, lalu rating, lalu jumlah jasa terbit. Penjual tanpa jasa terbit tidak muncul.
create or replace function public.service_top_sellers(_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(_limit, 8), 1), 24); result jsonb;
begin
  select coalesce(jsonb_agg(t.x order by t.rn), '[]'::jsonb) into result from (
    select row_number() over (order by sum(s.orders_completed) desc,
             (case when sum(s.rating_count) > 0 then sum(s.rating_avg * s.rating_count) / sum(s.rating_count) else 0 end) desc,
             count(*) desc, p.username) as rn,
      jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'headline', p.headline, 'is_verified', coalesce(p.is_verified, false),
        'services', count(*), 'orders_completed', coalesce(sum(s.orders_completed), 0),
        'reviews', coalesce(sum(s.rating_count), 0),
        'rating', case when sum(s.rating_count) > 0 then round((sum(s.rating_avg * s.rating_count) / sum(s.rating_count))::numeric, 2) else 0 end) as x
    from public.services s join public.profiles p on p.id = s.owner_id
    where s.status = 'published' and s.is_active and not public.is_banned(s.owner_id)
    group by p.id
    order by rn
    limit lim
  ) t;
  return result;
end $$;
revoke all on function public.service_top_sellers(int) from public;
grant execute on function public.service_top_sellers(int) to anon, authenticated;

-- ============ Favorit ============
-- Hanya jasa terbit milik orang lain. Memanggil dua kali membatalkan favorit.
create or replace function public.service_toggle_favorite(_service_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  perform public._service_guard();
  if not exists (select 1 from public.services where id = _service_id and status = 'published' and is_active and owner_id <> uid) then
    raise exception 'Jasa tidak tersedia untuk difavoritkan';
  end if;
  delete from public.service_favorites where user_id = uid and service_id = _service_id;
  if found then return false; end if;
  insert into public.service_favorites (user_id, service_id) values (uid, _service_id) on conflict do nothing;
  return true;
end $$;
revoke all on function public.service_toggle_favorite(uuid) from public, anon;
grant execute on function public.service_toggle_favorite(uuid) to authenticated;
