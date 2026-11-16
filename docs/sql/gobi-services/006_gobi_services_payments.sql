-- GOBI SERVICES — Fase 6: pembayaran dan transaksi.
-- Prasyarat: 001–005 DAN docs/sql/midtrans-escrow/001_midtrans_escrow.sql sudah dijalankan. Idempotent.
--
-- Prinsip: TIDAK ada sistem pembayaran baru. Pembayaran tetap lewat Midtrans Core API + escrow yang sudah ada
-- (payments, payment_events, escrow_ledger, payouts, midtrans_apply_notification). Fase ini hanya:
--   1. membuat service_orders.stage mengikuti pembayaran dan alur pesanan lama (lewat trigger, tanpa mengubah fungsi pembayaran),
--   2. mengunci komisi jasa pada pesanan paket (fungsi lama menimpa fee_amount dengan platform_fee),
--   3. menegakkan jatah revisi paket di database,
--   4. memberi admin pembacaan transaksi dan rekonsiliasi.
--
-- Semua trigger yang menyentuh jalur pembayaran DIBUNGKUS penanganan galat: bug di lapisan jasa tidak boleh menggagalkan webhook
-- pembayaran (uang sudah diterima provider). Galat dicatat di service_order_events (event 'sync_error').
-- Satu-satunya trigger yang sengaja menolak perubahan adalah jatah revisi (_service_revision_guard).

-- ============ 1. Komisi dikunci saat pesanan dibuat ============
alter table public.service_orders add column if not exists commission_fee bigint check (commission_fee is null or commission_fee >= 0);

-- Isi pesanan paket yang sudah ada (sebelum trigger penjaga dipasang di bawah).
update public.service_orders so set commission_fee = public._service_fee(o.amount::bigint)
from public.orders o where o.id = so.order_id and so.commission_fee is null and o.amount is not null;

create or replace function public._service_orders_snapshot_fee()
returns trigger language plpgsql security definer set search_path = public as $$
declare amt numeric;
begin
  if new.commission_fee is null then
    select amount into amt from public.orders where id = new.order_id;
    if amt is not null then new.commission_fee := public._service_fee(amt::bigint); end if;
  end if;
  return new;
end $$;
revoke all on function public._service_orders_snapshot_fee() from public, anon, authenticated;
drop trigger if exists service_orders_snapshot_fee on public.service_orders;
create trigger service_orders_snapshot_fee before insert on public.service_orders
  for each row execute function public._service_orders_snapshot_fee();

-- midtrans_apply_notification menimpa orders.fee_amount dengan platform_fee dan memakainya untuk escrow.
-- Untuk pesanan paket, kembalikan ke komisi yang dikunci. Pesanan lain tidak tersentuh.
create or replace function public._service_lock_order_fee()
returns trigger language plpgsql security definer set search_path = public as $$
declare snap bigint;
begin
  if new.fee_amount is distinct from old.fee_amount then
    begin
      select commission_fee into snap from public.service_orders where order_id = new.id;
      if snap is not null then new.fee_amount := snap; end if;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke all on function public._service_lock_order_fee() from public, anon, authenticated;
drop trigger if exists service_lock_order_fee on public.orders;
create trigger service_lock_order_fee before update of fee_amount on public.orders
  for each row execute function public._service_lock_order_fee();

create or replace function public._service_lock_escrow_fee()
returns trigger language plpgsql security definer set search_path = public as $$
declare snap bigint;
begin
  begin
    select commission_fee into snap from public.service_orders where order_id = new.order_id;
    if snap is not null then new.fee := snap; new.net := new.gross - snap; end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public._service_lock_escrow_fee() from public, anon, authenticated;
drop trigger if exists service_lock_escrow_fee on public.escrow_ledger;
create trigger service_lock_escrow_fee before insert on public.escrow_ledger
  for each row execute function public._service_lock_escrow_fee();

-- ============ 2. Status alur kerja mengikuti pembayaran dan alur pesanan ============
-- Memindahkan stage bila transisinya sah; bila tidak, mencatat 'sync_skipped' (bukan galat) dan membiarkan stage apa adanya.
create or replace function public._service_try_move(_order uuid, _to text, _event text, _detail jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  select stage into cur from public.service_orders where order_id = _order;
  if not found then return false; end if;
  if cur = _to then return true; end if;
  if not public._service_stage_ok(cur, _to) then
    insert into public.service_order_events (order_id, actor_id, event, from_stage, to_stage, detail)
    values (_order, auth.uid(), 'sync_skipped', cur, _to, jsonb_build_object('wanted', _to, 'event', _event) || coalesce(_detail, '{}'::jsonb));
    return false;
  end if;
  perform public._service_move_stage(_order, _to, _event, _detail);
  return true;
end $$;
revoke all on function public._service_try_move(uuid, text, text, jsonb) from public, anon, authenticated;

-- Pembayaran terkonfirmasi: paid -> in_progress (alur lama tidak punya langkah penerimaan penjual; Fase 7 menambahkannya),
-- mulai pengerjaan dan tenggat dihitung dari estimasi pesanan, lalu beri tahu penjual dan pembeli (sekali, lewat dedupe_key).
create or replace function public._service_on_paid(_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare so public.service_orders; o public.orders;
begin
  select * into so from public.service_orders where order_id = _order for update;
  if not found then return; end if;
  select * into o from public.orders where id = _order;
  if so.stage in ('awaiting_payment', 'payment_processing') then
    perform public._service_move_stage(_order, 'paid', 'payment_confirmed', jsonb_build_object('amount', o.amount));
  end if;
  perform public._service_try_move(_order, 'in_progress', 'work_started');
  update public.service_orders set
    accepted_at = coalesce(accepted_at, now()), started_at = coalesce(started_at, now()),
    due_at = coalesce(due_at, now() + make_interval(days => delivery_days))
  where order_id = _order;
  perform public._service_notify(o.seller_id, 'order_paid', 'Pesanan baru sudah dibayar: ' || left(o.title, 80), '/pesanan/' || _order::text, 'paid:' || _order::text);
  perform public._service_notify(o.buyer_id, 'payment_confirmed', 'Pembayaran diterima, pesanan mulai dikerjakan: ' || left(o.title, 80), '/pesanan/' || _order::text, 'paid-buyer:' || _order::text);
end $$;
revoke all on function public._service_on_paid(uuid) from public, anon, authenticated;

-- Percobaan pembayaran: pending -> payment_processing; kedaluwarsa / dibatalkan / ditolak (dan tidak ada percobaan lain) -> kembali ke awaiting_payment.
create or replace function public._service_payment_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if not exists (select 1 from public.service_orders where order_id = new.order_id) then return null; end if;
    if tg_op = 'INSERT' then
      if new.status = 'pending' then
        perform public._service_try_move(new.order_id, 'payment_processing', 'payment_started',
          jsonb_build_object('reference', new.midtrans_order_id, 'method', new.method));
      end if;
    elsif new.status is distinct from old.status
          and new.status in ('expired', 'cancelled', 'denied', 'failed')
          and not exists (select 1 from public.payments where order_id = new.order_id and id <> new.id and status in ('pending', 'paid')) then
      perform public._service_try_move(new.order_id, 'awaiting_payment', 'payment_' || new.status,
        jsonb_build_object('reference', new.midtrans_order_id));
    end if;
  exception when others then
    insert into public.service_order_events (order_id, actor_id, event, detail)
    values (new.order_id, null, 'sync_error', jsonb_build_object('source', 'payments', 'error', sqlerrm));
  end;
  return null;
end $$;
revoke all on function public._service_payment_sync() from public, anon, authenticated;
drop trigger if exists service_payment_sync on public.payments;
create trigger service_payment_sync after insert or update of status on public.payments
  for each row execute function public._service_payment_sync();

-- Status pesanan lama (orders.status) -> stage. Dipicu oleh fungsi lama (midtrans_apply_notification, deliver_order, request_revision,
-- complete_order, cancel_order) tanpa mengubahnya.
create or replace function public._service_order_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare prev text;
begin
  begin
    select stage into prev from public.service_orders where order_id = new.id;
    if not found then return null; end if;

    if new.status = 'in_progress' and old.status in ('awaiting_payment', 'payment_review') then
      perform public._service_on_paid(new.id);
    elsif new.status = 'delivered' then
      if public._service_try_move(new.id, 'submitted', 'work_submitted') then
        update public.service_orders set submitted_at = now() where order_id = new.id;
        perform public._service_notify(new.buyer_id, 'work_submitted', 'Hasil dikirim, silakan periksa: ' || left(new.title, 80), '/pesanan/' || new.id::text);
      end if;
    elsif new.status = 'in_progress' and old.status = 'delivered' then
      if public._service_try_move(new.id, 'revision_requested', 'revision_requested') then
        update public.service_orders set revisions_used = revisions_used + 1 where order_id = new.id;
        perform public._service_notify(new.seller_id, 'revision_requested', 'Revisi diminta: ' || left(new.title, 80), '/pesanan/' || new.id::text);
      end if;
    elsif new.status = 'completed' then
      if prev <> 'completed' and public._service_try_move(new.id, 'completed', 'order_completed') then
        update public.service_orders set completed_at = now() where order_id = new.id;
        if new.service_id is not null then
          perform set_config('gobi.services_rpc', '1', true);
          update public.services set orders_completed = orders_completed + 1 where id = new.service_id;
          perform set_config('gobi.services_rpc', '', true);
        end if;
        perform public._service_notify(new.seller_id, 'order_completed', 'Pesanan selesai: ' || left(new.title, 80), '/pesanan/' || new.id::text, 'completed:' || new.id::text);
      end if;
    elsif new.status = 'cancelled' then
      perform public._service_try_move(new.id, 'cancelled', 'order_cancelled');
    end if;
  exception when others then
    insert into public.service_order_events (order_id, actor_id, event, detail)
    values (new.id, null, 'sync_error', jsonb_build_object('source', 'orders', 'from', old.status, 'to', new.status, 'error', sqlerrm));
  end;
  return null;
end $$;
revoke all on function public._service_order_sync() from public, anon, authenticated;
drop trigger if exists service_order_sync on public.orders;
create trigger service_order_sync after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public._service_order_sync();

-- ============ 3. Jatah revisi paket ditegakkan di database ============
-- request_revision (fungsi lama) mengembalikan pesanan dari 'delivered' ke 'in_progress'. Untuk pesanan paket, tolak bila jatah habis.
-- Sengaja TIDAK dibungkus penanganan galat: inilah satu-satunya penolakan yang diinginkan.
create or replace function public._service_revision_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare inc int; used int;
begin
  if old.status = 'delivered' and new.status = 'in_progress' then
    select revisions_included, revisions_used into inc, used from public.service_orders where order_id = new.id;
    if found and used >= inc then
      raise exception 'Jatah revisi paket sudah habis (% dari %). Hubungi penjual untuk revisi tambahan', used, inc;
    end if;
  end if;
  return new;
end $$;
revoke all on function public._service_revision_guard() from public, anon, authenticated;
drop trigger if exists service_revision_guard on public.orders;
create trigger service_revision_guard before update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public._service_revision_guard();

-- ============ 4. Pembacaan transaksi untuk admin ============
-- Satu baris = satu percobaan pembayaran (payments) atas pesanan jasa. Komisi dan nilai bersih mengikuti escrow bila sudah ada.
create or replace function public.service_admin_transactions(
  _status text default null, _q text default null, _from date default null, _to date default null,
  _limit int default 25, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  lim int := least(greatest(coalesce(_limit, 25), 1), 50);
  off int := greatest(coalesce(_offset, 0), 0);
  qq text := nullif(btrim(coalesce(_q, '')), '');
  pat text;
  result jsonb;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _status is not null and _status not in ('pending', 'paid', 'expired', 'cancelled', 'denied', 'failed', 'superseded') then
    raise exception 'Status tidak valid';
  end if;
  if qq is not null then pat := '%' || replace(replace(replace(left(qq, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;

  with base as (
    select
      row_number() over (order by p.created_at desc, p.id) as rn,
      jsonb_build_object(
        'id', p.id, 'reference', p.midtrans_order_id, 'provider', 'midtrans', 'mode', p.mode, 'method', p.method, 'bank', p.bank,
        'status', p.status, 'needs_refund', p.needs_refund, 'created_at', p.created_at, 'paid_at', p.paid_at,
        'gross', p.gross_amount,
        'commission', coalesce(e.fee, so.commission_fee, o.fee_amount),
        'net', coalesce(e.net, p.gross_amount - coalesce(so.commission_fee, o.fee_amount, 0)),
        'escrow_status', e.status,
        'order', jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title, 'status', o.status, 'stage', so.stage, 'is_package', so.order_id is not null),
        'buyer', jsonb_build_object('id', b.id, 'username', b.username),
        'seller', jsonb_build_object('id', s.id, 'username', s.username)) as x
    from public.payments p
    join public.orders o on o.id = p.order_id and o.kind = 'service'
    left join public.service_orders so on so.order_id = o.id
    left join public.escrow_ledger e on e.order_id = o.id
    join public.profiles b on b.id = o.buyer_id
    join public.profiles s on s.id = o.seller_id
    where (_status is null or p.status = _status)
      and (_from is null or p.created_at >= _from::timestamptz)
      and (_to is null or p.created_at < (_to + 1)::timestamptz)
      and (pat is null or p.midtrans_order_id ilike pat escape '\' or o.number::text ilike pat escape '\'
           or b.username ilike pat escape '\' or s.username ilike pat escape '\' or o.title ilike pat escape '\')
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg(t.x order by t.rn) from (select * from base order by rn limit lim offset off) t), '[]'::jsonb))
  into result;
  return result;
end $$;
revoke all on function public.service_admin_transactions(text, text, date, date, int, int) from public, anon;
grant execute on function public.service_admin_transactions(text, text, date, date, int, int) to authenticated;

-- ============ 5. Rekonsiliasi ============
-- Mencari ketidaksesuaian antara pembayaran, pesanan, escrow, dan stage. Hanya membaca; tidak mengubah apa pun.
-- Kode: paid_not_progressed, paid_without_escrow, escrow_amount_mismatch, fee_mismatch, stage_stale, needs_refund, multiple_paid, sync_error.
create or replace function public.service_admin_reconcile()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  with issues as (
    select 'paid_not_progressed' as code, o.id as order_id, o.number, 'Pembayaran lunas tetapi pesanan masih ' || o.status as detail
    from public.orders o where o.kind = 'service' and o.status in ('awaiting_payment', 'payment_review')
      and exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'paid')
    union all
    select 'paid_without_escrow', o.id, o.number, 'Pesanan sudah dibayar (paid_at terisi) tetapi tidak ada baris escrow'
    from public.orders o where o.kind = 'service' and o.paid_at is not null
      and not exists (select 1 from public.escrow_ledger e where e.order_id = o.id)
    union all
    select 'escrow_amount_mismatch', o.id, o.number, 'Escrow ' || e.gross::text || ' tidak sama dengan nilai pesanan ' || o.amount::text
    from public.orders o join public.escrow_ledger e on e.order_id = o.id where o.kind = 'service' and e.gross is distinct from o.amount
    union all
    select 'fee_mismatch', o.id, o.number, 'Komisi escrow ' || e.fee::text || ' tidak sama dengan komisi terkunci ' || so.commission_fee::text
    from public.orders o join public.service_orders so on so.order_id = o.id join public.escrow_ledger e on e.order_id = o.id
    where so.commission_fee is not null and e.fee is distinct from so.commission_fee
    union all
    select 'stage_stale', o.id, o.number, 'Status pesanan ' || o.status || ' tetapi stage ' || so.stage
    from public.orders o join public.service_orders so on so.order_id = o.id
    where not (case o.status
      when 'awaiting_payment' then so.stage in ('awaiting_payment', 'payment_processing')
      when 'payment_review' then so.stage in ('awaiting_payment', 'payment_processing')
      when 'in_progress' then so.stage in ('in_progress', 'revision_requested', 'pending_seller_acceptance', 'cancel_requested', 'disputed')
      when 'delivered' then so.stage in ('submitted', 'disputed')
      when 'completed' then so.stage in ('completed', 'disputed', 'refunded', 'partially_refunded')
      when 'cancelled' then so.stage in ('cancelled', 'refunded', 'partially_refunded')
      else true end)
    union all
    select 'needs_refund', o.id, o.number, 'Pembayaran ' || p.midtrans_order_id || ' ditandai perlu refund'
    from public.payments p join public.orders o on o.id = p.order_id where o.kind = 'service' and p.needs_refund
    union all
    select 'multiple_paid', o.id, o.number, 'Ada ' || count(*)::text || ' pembayaran lunas untuk satu pesanan'
    from public.payments p join public.orders o on o.id = p.order_id where o.kind = 'service' and p.status = 'paid'
    group by o.id, o.number having count(*) > 1
    union all
    select 'sync_error', ev.order_id, o.number, left(coalesce(ev.detail ->> 'error', ''), 200)
    from public.service_order_events ev join public.orders o on o.id = ev.order_id
    where ev.event = 'sync_error' and ev.created_at > now() - interval '30 days'
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'order_id', order_id, 'number', number, 'detail', detail) order by number desc), '[]'::jsonb)
  into result from (select * from issues limit 200) t;
  return result;
end $$;
revoke all on function public.service_admin_reconcile() from public, anon;
grant execute on function public.service_admin_reconcile() to authenticated;
