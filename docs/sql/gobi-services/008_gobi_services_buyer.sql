-- GOBI SERVICES — Fase 8: dashboard pembeli, pembatalan pesanan, dan ulasan.
-- Prasyarat: 001–007 dan docs/sql/midtrans-escrow/001_midtrans_escrow.sql sudah dijalankan. Idempotent.
--
-- Pembatalan (stage -> cancelled lewat _service_move_stage, uang tetap lewat escrow_ledger/payments yang sudah ada):
--   pembeli, belum diterima penjual (pending_seller_acceptance) -> langsung cancelled, escrow dibekukan, ditandai perlu refund
--   pembeli atau penjual, sedang dikerjakan (in_progress / revision_requested) -> cancel_requested; pihak lawan setuju (cancelled
--   + dibekukan + perlu refund) atau menolak (kembali ke status sebelumnya); peminta bisa menarik permintaannya
--   Refund dikerjakan admin di dashboard Midtrans (perilaku Fase 6/7); sengketa untuk permintaan yang ditolak menyusul di Fase 10.
-- Ulasan: pembeli, sekali per pesanan, hanya setelah stage completed; penjual boleh membalas sekali.
--
-- Fungsi pembeli/penjual: service_buyer_orders, service_cancel_order, service_respond_cancel, service_withdraw_cancel,
--   service_leave_review, service_reply_review

-- ============ 1. Pembantu ============
-- Membatalkan pesanan sekarang: stage cancelled, orders.status cancelled, pembayaran ditandai perlu refund, escrow dibekukan.
-- Sama dengan yang dilakukan service_decline_order (SQL 007).
create or replace function public._service_cancel_now(_order uuid, _event text, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('gobi.order_flow', '1', true);
  perform public._service_move_stage(_order, 'cancelled', _event, jsonb_build_object('reason', _reason));
  update public.service_orders set cancel_reason = _reason where order_id = _order;
  update public.orders set status = 'cancelled' where id = _order;
  update public.payments set needs_refund = true where order_id = _order and status = 'paid';
  update public.escrow_ledger set status = 'frozen' where order_id = _order and status = 'held';
  perform set_config('gobi.order_flow', '', true);
end $$;
revoke all on function public._service_cancel_now(uuid, text, text) from public, anon, authenticated;

-- Menghitung ulang rating jasa dari ulasan yang terlihat. Memakai bendera gobi.services_rpc supaya _services_guard mengizinkannya.
create or replace function public._service_review_recalc(_service uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a numeric; c int;
begin
  select coalesce(round(avg(rating)::numeric, 2), 0), count(*) into a, c from public.service_reviews where service_id = _service and is_visible;
  perform set_config('gobi.services_rpc', '1', true);
  update public.services set rating_avg = a, rating_count = c where id = _service;
  perform set_config('gobi.services_rpc', '', true);
end $$;
revoke all on function public._service_review_recalc(uuid) from public, anon, authenticated;

-- ============ 2. Pembatalan ============
-- Mengembalikan 'cancelled' (langsung dibatalkan) atau 'requested' (menunggu jawaban pihak lawan).
create or replace function public.service_cancel_order(_order_id uuid, _reason text)
returns text language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; o public.orders; r text := btrim(coalesce(_reason, '')); me uuid := auth.uid(); other uuid;
begin
  so := public._service_order_lock(_order_id, null);
  if length(r) < 10 or length(r) > 1000 then raise exception 'Alasan pembatalan harus 10 sampai 1000 karakter'; end if;
  select * into o from public.orders where id = _order_id;
  other := case when me = o.buyer_id then o.seller_id else o.buyer_id end;

  if so.stage = 'pending_seller_acceptance' then
    if me <> o.buyer_id then raise exception 'Penjual menolak pesanan lewat tombol Tolak'; end if;
    perform public._service_cancel_now(_order_id, 'buyer_cancelled', r);
    perform public._service_system_message(_order_id, me, 'Pembeli membatalkan pesanan sebelum diterima: ' || r || ' Dana akan dikembalikan melalui admin.');
    perform public._service_notify(o.seller_id, 'order_cancelled', 'Pembeli membatalkan pesanan: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'cancelled:' || _order_id::text);
    return 'cancelled';
  elsif so.stage in ('in_progress', 'revision_requested') then
    perform public._service_move_stage(_order_id, 'cancel_requested', 'cancel_requested', jsonb_build_object('reason', r, 'by', me));
    update public.service_orders set cancel_requested_by = me, cancel_reason = r where order_id = _order_id;
    perform public._service_system_message(_order_id, me, 'Permintaan pembatalan: ' || r);
    perform public._service_notify(other, 'cancel_requested', 'Ada permintaan pembatalan pesanan: ' || left(o.title, 80), '/pesanan/' || _order_id::text,
      'cancel-req:' || _order_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text);
    return 'requested';
  else
    raise exception 'Pesanan tidak bisa dibatalkan pada status ini (status: %)', so.stage;
  end if;
end $$;
revoke all on function public.service_cancel_order(uuid, text) from public, anon;
grant execute on function public.service_cancel_order(uuid, text) to authenticated;

-- Pihak lawan menjawab permintaan pembatalan. Setuju = dibatalkan + dana dibekukan + perlu refund. Menolak wajib beralasan.
create or replace function public.service_respond_cancel(_order_id uuid, _accept boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; o public.orders; n text := btrim(coalesce(_note, '')); me uuid := auth.uid(); back text;
begin
  so := public._service_order_lock(_order_id, null);
  if so.stage <> 'cancel_requested' then raise exception 'Tidak ada permintaan pembatalan (status: %)', so.stage; end if;
  if so.cancel_requested_by is null or so.cancel_requested_by = me then raise exception 'Permintaan pembatalan harus dijawab pihak lawan'; end if;
  select * into o from public.orders where id = _order_id;

  if coalesce(_accept, false) then
    perform public._service_cancel_now(_order_id, 'cancel_accepted', coalesce(so.cancel_reason, ''));
    perform public._service_system_message(_order_id, me, 'Pembatalan disetujui. Dana akan dikembalikan melalui admin.');
    perform public._service_notify(so.cancel_requested_by, 'cancel_accepted', 'Pembatalan pesanan disetujui: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'cancel-ok:' || _order_id::text);
  else
    if length(n) < 10 or length(n) > 1000 then raise exception 'Alasan menolak pembatalan harus 10 sampai 1000 karakter'; end if;
    back := case when so.prev_stage in ('in_progress', 'revision_requested') then so.prev_stage else 'in_progress' end;
    perform public._service_move_stage(_order_id, back, 'cancel_rejected', jsonb_build_object('note', n));
    update public.service_orders set cancel_requested_by = null, cancel_reason = null where order_id = _order_id;
    perform public._service_system_message(_order_id, me, 'Permintaan pembatalan ditolak: ' || n);
    perform public._service_notify(so.cancel_requested_by, 'cancel_rejected', 'Permintaan pembatalan ditolak: ' || left(o.title, 80), '/pesanan/' || _order_id::text,
      'cancel-no:' || _order_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text);
  end if;
end $$;
revoke all on function public.service_respond_cancel(uuid, boolean, text) from public, anon;
grant execute on function public.service_respond_cancel(uuid, boolean, text) to authenticated;

-- Peminta menarik permintaan pembatalannya: pesanan kembali ke status sebelumnya.
create or replace function public.service_withdraw_cancel(_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; o public.orders; me uuid := auth.uid(); back text; other uuid;
begin
  so := public._service_order_lock(_order_id, null);
  if so.stage <> 'cancel_requested' then raise exception 'Tidak ada permintaan pembatalan (status: %)', so.stage; end if;
  if so.cancel_requested_by is distinct from me then raise exception 'Hanya peminta yang bisa menarik permintaan pembatalan'; end if;
  select * into o from public.orders where id = _order_id;
  other := case when me = o.buyer_id then o.seller_id else o.buyer_id end;
  back := case when so.prev_stage in ('in_progress', 'revision_requested') then so.prev_stage else 'in_progress' end;
  perform public._service_move_stage(_order_id, back, 'cancel_withdrawn');
  update public.service_orders set cancel_requested_by = null, cancel_reason = null where order_id = _order_id;
  perform public._service_system_message(_order_id, me, 'Permintaan pembatalan ditarik.');
  perform public._service_notify(other, 'cancel_withdrawn', 'Permintaan pembatalan ditarik: ' || left(o.title, 80), '/pesanan/' || _order_id::text,
    'cancel-wd:' || _order_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text);
end $$;
revoke all on function public.service_withdraw_cancel(uuid) from public, anon;
grant execute on function public.service_withdraw_cancel(uuid) to authenticated;

-- ============ 3. Ulasan ============
create or replace function public.service_leave_review(_order_id uuid, _rating int, _comment text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; o public.orders; c text := btrim(coalesce(_comment, '')); rid uuid;
begin
  so := public._service_order_lock(_order_id, 'buyer');
  if so.stage <> 'completed' then raise exception 'Ulasan hanya bisa diberikan setelah pesanan selesai (status: %)', so.stage; end if;
  if _rating is null or _rating not between 1 and 5 then raise exception 'Nilai ulasan harus 1 sampai 5'; end if;
  if length(c) > 1000 then raise exception 'Ulasan maksimal 1000 karakter'; end if;
  select * into o from public.orders where id = _order_id;
  if o.service_id is null then raise exception 'Jasa untuk pesanan ini sudah tidak tersedia'; end if;
  if exists (select 1 from public.service_reviews where order_id = _order_id) then raise exception 'Kamu sudah memberi ulasan untuk pesanan ini'; end if;
  insert into public.service_reviews (order_id, service_id, buyer_id, seller_id, rating, comment)
  values (_order_id, o.service_id, o.buyer_id, o.seller_id, _rating, c) returning id into rid;
  perform public._service_review_recalc(o.service_id);
  perform public._service_notify(o.seller_id, 'review_received', 'Kamu mendapat ulasan ' || _rating::text || ' bintang: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'review:' || _order_id::text);
  return rid;
end $$;
revoke all on function public.service_leave_review(uuid, int, text) from public, anon;
grant execute on function public.service_leave_review(uuid, int, text) to authenticated;

-- Penjual membalas ulasan pesanannya, sekali saja.
create or replace function public.service_reply_review(_order_id uuid, _reply text)
returns void language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; o public.orders; r text := btrim(coalesce(_reply, '')); rv public.service_reviews;
begin
  so := public._service_order_lock(_order_id, 'seller');
  select * into rv from public.service_reviews where order_id = _order_id for update;
  if not found then raise exception 'Belum ada ulasan untuk pesanan ini'; end if;
  if rv.seller_reply is not null then raise exception 'Ulasan ini sudah kamu balas'; end if;
  if length(r) < 2 or length(r) > 1000 then raise exception 'Balasan harus 2 sampai 1000 karakter'; end if;
  update public.service_reviews set seller_reply = r, replied_at = now() where id = rv.id;
  select * into o from public.orders where id = _order_id;
  perform public._service_notify(o.buyer_id, 'review_replied', 'Penjual membalas ulasanmu: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'review-reply:' || _order_id::text);
end $$;
revoke all on function public.service_reply_review(uuid, text) from public, anon;
grant execute on function public.service_reply_review(uuid, text) to authenticated;

-- ============ 4. Daftar pesanan pembeli (jasa paket) ============
-- _group: needs_action | working | issues | done | closed (kosong = semua).
-- needs_action = menunggu pembayaran atau hasil menunggu diperiksa. Mengembalikan {counts, total, rows[]}.
create or replace function public.service_buyer_orders(_group text default null, _limit int default 25, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(_limit, 25), 1), 50);
  off int := greatest(coalesce(_offset, 0), 0);
  wanted text := nullif(_group, '');
  result jsonb;
begin
  perform public._service_guard();
  if wanted is not null and wanted not in ('needs_action', 'working', 'issues', 'done', 'closed') then
    raise exception 'Kelompok tidak valid';
  end if;

  with mine as (
    select o.id, o.number, o.title, o.amount, o.created_at, o.seller_id,
      so.stage, so.due_at, so.delivery_days, so.revisions_included, so.revisions_used, so.package_snapshot, so.cancel_requested_by,
      exists (select 1 from public.service_reviews r where r.order_id = o.id) as has_review,
      case when so.stage in ('awaiting_payment', 'submitted') then 'needs_action'
           when so.stage in ('payment_processing', 'paid', 'pending_seller_acceptance', 'in_progress', 'revision_requested') then 'working'
           when so.stage in ('cancel_requested', 'disputed') then 'issues'
           when so.stage = 'completed' then 'done'
           else 'closed' end as bucket
    from public.orders o join public.service_orders so on so.order_id = o.id
    where o.buyer_id = uid and o.kind = 'service'
  ),
  ordered as (
    select m.*, row_number() over (order by
        case when m.bucket in ('done', 'closed') then m.created_at end desc nulls last,
        case when m.bucket not in ('done', 'closed') then coalesce(m.due_at, m.created_at) end asc nulls last,
        m.created_at desc) as rn
    from mine m where wanted is null or m.bucket = wanted
  )
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
        'all', count(*),
        'needs_action', count(*) filter (where bucket = 'needs_action'),
        'working', count(*) filter (where bucket = 'working'),
        'issues', count(*) filter (where bucket = 'issues'),
        'done', count(*) filter (where bucket = 'done'),
        'closed', count(*) filter (where bucket = 'closed')) from mine),
    'total', (select count(*) from ordered),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'number', p.number, 'title', p.title, 'amount', p.amount,
          'stage', p.stage, 'group', p.bucket, 'due_at', p.due_at, 'created_at', p.created_at, 'delivery_days', p.delivery_days,
          'revisions_included', p.revisions_included, 'revisions_used', p.revisions_used, 'package', p.package_snapshot ->> 'name',
          'has_review', p.has_review, 'cancel_requested_by', p.cancel_requested_by,
          'seller', jsonb_build_object('id', s.id, 'username', s.username, 'display_name', s.display_name, 'avatar_url', s.avatar_url))
        order by p.rn)
      from ordered p join public.profiles s on s.id = p.seller_id
      where p.rn > off and p.rn <= off + lim), '[]'::jsonb))
  into result;
  return result;
end $$;
revoke all on function public.service_buyer_orders(text, int, int) from public, anon;
grant execute on function public.service_buyer_orders(text, int, int) to authenticated;
