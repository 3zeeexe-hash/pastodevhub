-- GOBI SERVICES — Fase 7: dashboard penjual dan alur pengerjaan.
-- Prasyarat: 001–006 dan docs/sql/midtrans-escrow/001_midtrans_escrow.sql sudah dijalankan. Idempotent.
--
-- Alur pesanan paket setelah Fase 7:
--   dibayar -> pending_seller_acceptance -> (penjual menerima) in_progress -> (kirim hasil) submitted
--           -> (pembeli setuju) completed   |   (pembeli minta revisi) revision_requested -> submitted ...
--           -> (penjual menolak) cancelled + dana dibekukan + ditandai perlu refund (refund dikerjakan admin)
--
-- Perubahan status uang tetap lewat fungsi lama (deliver_order, request_revision, complete_order). Fungsi baru di sini
-- membungkusnya: memeriksa peran dan status alur kerja, menyimpan catatan terstruktur (hasil, permintaan revisi), lalu
-- memanggil fungsi lama. Trigger penjaga memastikan pesanan paket TIDAK bisa melewati pembungkus ini.
--
-- Fungsi untuk penjual: service_accept_order, service_decline_order, service_submit_work, service_seller_orders
-- Fungsi untuk pembeli: service_request_revision, service_approve_work

-- ============ 1. Setelah dibayar, menunggu penjual menerima ============
-- Menggantikan versi Fase 6 (yang langsung in_progress). Tenggat baru dihitung saat penjual menerima.
create or replace function public._service_on_paid(_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare so public.service_orders; o public.orders;
begin
  select * into so from public.service_orders where order_id = _order for update;
  if not found then return; end if;
  select * into o from public.orders where id = _order;
  if so.stage in ('awaiting_payment', 'payment_processing') then
    perform public._service_move_stage(_order, 'paid', 'payment_confirmed', jsonb_build_object('amount', o.amount));
    perform public._service_move_stage(_order, 'pending_seller_acceptance', 'awaiting_seller');
  end if;
  perform public._service_notify(o.seller_id, 'order_paid', 'Pesanan baru sudah dibayar, terima atau tolak: ' || left(o.title, 80), '/pesanan/' || _order::text, 'paid:' || _order::text);
  perform public._service_notify(o.buyer_id, 'payment_confirmed', 'Pembayaran diterima, menunggu penjual menerima pesanan: ' || left(o.title, 80), '/pesanan/' || _order::text, 'paid-buyer:' || _order::text);
end $$;
revoke all on function public._service_on_paid(uuid) from public, anon, authenticated;

-- ============ 2. Penjaga: pesanan paket hanya lewat pembungkus ============
-- Menolak perubahan status ke delivered / completed / revisi langsung dari fungsi lama oleh pengguna biasa.
-- Pembungkus menyalakan bendera 'gobi.order_flow'. Admin dan konteks server (auth.uid() kosong) tidak dibatasi.
create or replace function public._service_flow_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'delivered' and old.status <> 'delivered')
     or (new.status = 'completed' and old.status <> 'completed')
     or (old.status = 'delivered' and new.status = 'in_progress') then
    if exists (select 1 from public.service_orders where order_id = new.id)
       and not (coalesce(current_setting('gobi.order_flow', true), '') = '1' or auth.uid() is null or coalesce(public._is_admin(), false)) then
      raise exception 'Pesanan jasa berbasis paket diproses lewat halaman pesanan (kirim hasil, revisi, atau setujui hasil)';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._service_flow_guard() from public, anon, authenticated;
drop trigger if exists service_flow_guard on public.orders;
create trigger service_flow_guard before update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function public._service_flow_guard();

-- ============ 3. Pembantu ============
-- Mengunci service_orders dan memastikan pemanggil adalah peran yang benar. Bukan peserta = "tidak ditemukan" (tidak membocorkan keberadaan).
create or replace function public._service_order_lock(_order uuid, _role text)
returns public.service_orders language plpgsql security definer set search_path = public as $$
declare so public.service_orders; o public.orders;
begin
  perform public._service_guard();
  select * into o from public.orders where id = _order;
  if not found or o.kind <> 'service' or auth.uid() not in (o.buyer_id, o.seller_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if _role = 'seller' and o.seller_id <> auth.uid() then raise exception 'Hanya penjual yang bisa melakukan ini'; end if;
  if _role = 'buyer' and o.buyer_id <> auth.uid() then raise exception 'Hanya pembeli yang bisa melakukan ini'; end if;
  select * into so from public.service_orders where order_id = _order for update;
  if not found then raise exception 'Ini bukan pesanan paket'; end if;
  return so;
end $$;
revoke all on function public._service_order_lock(uuid, text) from public, anon, authenticated;

create or replace function public._service_system_message(_order uuid, _sender uuid, _body text)
returns void language sql security definer set search_path = public as $$
  insert into public.order_messages (order_id, sender_id, body, is_system) values (_order, _sender, left(_body, 2000), true);
$$;
revoke all on function public._service_system_message(uuid, uuid, text) from public, anon, authenticated;

-- ============ 4. Penjual menerima atau menolak ============
create or replace function public.service_accept_order(_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare so public.service_orders; o public.orders; due timestamptz;
begin
  so := public._service_order_lock(_order_id, 'seller');
  if so.stage <> 'pending_seller_acceptance' then raise exception 'Pesanan tidak sedang menunggu persetujuanmu (status: %)', so.stage; end if;
  perform public._service_move_stage(_order_id, 'in_progress', 'seller_accepted');
  due := now() + make_interval(days => so.delivery_days);
  update public.service_orders set accepted_at = now(), started_at = now(), due_at = due where order_id = _order_id;
  select * into o from public.orders where id = _order_id;
  perform public._service_system_message(_order_id, o.seller_id, 'Penjual menerima pesanan. Estimasi selesai ' || to_char(due, 'DD-MM-YYYY') || '.');
  perform public._service_notify(o.buyer_id, 'seller_accepted', 'Penjual menerima pesananmu: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'accepted:' || _order_id::text);
end $$;
revoke all on function public.service_accept_order(uuid) from public, anon;
grant execute on function public.service_accept_order(uuid) to authenticated;

-- Menolak pesanan yang sudah dibayar: pesanan dibatalkan, escrow dibekukan, pembayaran ditandai perlu refund.
-- Refund sendiri dikerjakan admin di dashboard Midtrans lalu ditandai di aplikasi; stage menjadi 'refunded' saat escrow ditandai refund.
create or replace function public.service_decline_order(_order_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare so public.service_orders; o public.orders; r text := btrim(coalesce(_reason, ''));
begin
  so := public._service_order_lock(_order_id, 'seller');
  if so.stage <> 'pending_seller_acceptance' then raise exception 'Pesanan tidak sedang menunggu persetujuanmu (status: %)', so.stage; end if;
  if length(r) < 10 or length(r) > 1000 then raise exception 'Alasan penolakan harus 10 sampai 1000 karakter'; end if;
  select * into o from public.orders where id = _order_id;
  perform set_config('gobi.order_flow', '1', true);
  perform public._service_move_stage(_order_id, 'cancelled', 'seller_declined', jsonb_build_object('reason', r));
  update public.service_orders set cancel_reason = r where order_id = _order_id;
  update public.orders set status = 'cancelled' where id = _order_id;
  update public.payments set needs_refund = true where order_id = _order_id and status = 'paid';
  update public.escrow_ledger set status = 'frozen' where order_id = _order_id and status = 'held';
  perform set_config('gobi.order_flow', '', true);
  perform public._service_system_message(_order_id, o.seller_id, 'Penjual menolak pesanan: ' || r || ' Dana akan dikembalikan melalui admin.');
  perform public._service_notify(o.buyer_id, 'seller_declined', 'Penjual menolak pesananmu, dana akan dikembalikan: ' || left(o.title, 80), '/pesanan/' || _order_id::text, 'declined:' || _order_id::text);
end $$;
revoke all on function public.service_decline_order(uuid, text) from public, anon;
grant execute on function public.service_decline_order(uuid, text) to authenticated;

-- Refund yang sudah ditandai admin pada escrow -> stage 'refunded' (dari 'cancelled'; transisi lain dicatat sebagai sync_skipped).
create or replace function public._service_escrow_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'refunded' and exists (select 1 from public.service_orders where order_id = new.order_id) then
      perform public._service_try_move(new.order_id, 'refunded', 'escrow_refunded');
    end if;
  exception when others then
    insert into public.service_order_events (order_id, actor_id, event, detail)
    values (new.order_id, null, 'sync_error', jsonb_build_object('source', 'escrow', 'error', sqlerrm));
  end;
  return null;
end $$;
revoke all on function public._service_escrow_sync() from public, anon, authenticated;
drop trigger if exists service_escrow_sync on public.escrow_ledger;
create trigger service_escrow_sync after update of status on public.escrow_ledger
  for each row when (old.status is distinct from new.status) execute function public._service_escrow_sync();

-- ============ 5. Kirim hasil ============
-- Menyimpan catatan, link demo, link repositori, dan lampiran (maks 5) sebagai riwayat pengiriman, lalu memanggil deliver_order.
-- Catatan lama (orders.delivery_note) diisi dari gabungan catatan dan tautan, supaya tampilan lama tetap menunjukkan hasilnya.
create or replace function public.service_submit_work(
  _order_id uuid, _note text, _demo_url text default null, _repo_url text default null, _attachments jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  so public.service_orders; n text := btrim(coalesce(_note, '')); demo text; repo text; refs jsonb; att text; composed text; sid uuid;
begin
  so := public._service_order_lock(_order_id, 'seller');
  if so.stage not in ('in_progress', 'revision_requested') then raise exception 'Pesanan belum bisa dikirimi hasil (status: %)', so.stage; end if;
  if length(n) < 10 or length(n) > 3000 then raise exception 'Catatan hasil harus 10 sampai 3000 karakter'; end if;
  demo := public._service_url(_demo_url, 'Link demo');
  repo := public._service_url(_repo_url, 'Link repositori');
  refs := public._service_references(_attachments);
  att := coalesce((select string_agg(E'\n' || coalesce(nullif(e ->> 'name', ''), 'Lampiran') || ': ' || (e ->> 'url'), '') from jsonb_array_elements(refs) as e), '');

  insert into public.service_submissions (order_id, seller_id, note, demo_url, repo_url, attachments, revision_no)
  values (_order_id, auth.uid(), n, demo, repo, refs, so.revisions_used) returning id into sid;

  composed := left(n || case when demo is not null then E'\n\nDemo: ' || demo else '' end
                     || case when repo is not null then E'\n\nRepositori: ' || repo else '' end || att, 4000);
  perform set_config('gobi.order_flow', '1', true);
  perform public.deliver_order(_order_id => _order_id, _note => composed);
  perform set_config('gobi.order_flow', '', true);
  return sid;
end $$;
revoke all on function public.service_submit_work(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.service_submit_work(uuid, text, text, text, jsonb) to authenticated;

-- ============ 6. Pembeli: revisi dan persetujuan ============
create or replace function public.service_request_revision(_order_id uuid, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare so public.service_orders; n text := btrim(coalesce(_note, '')); sub uuid; rid uuid;
begin
  so := public._service_order_lock(_order_id, 'buyer');
  if so.stage <> 'submitted' then raise exception 'Revisi hanya bisa diminta setelah hasil dikirim (status: %)', so.stage; end if;
  if length(n) < 10 or length(n) > 2000 then raise exception 'Catatan revisi harus 10 sampai 2000 karakter'; end if;
  if so.revisions_used >= so.revisions_included then
    raise exception 'Jatah revisi paket sudah habis (% dari %). Hubungi penjual untuk revisi tambahan', so.revisions_used, so.revisions_included;
  end if;
  select id into sub from public.service_submissions where order_id = _order_id order by created_at desc limit 1;
  insert into public.service_revisions (order_id, submission_id, buyer_id, note, counted) values (_order_id, sub, auth.uid(), n, true) returning id into rid;
  perform set_config('gobi.order_flow', '1', true);
  perform public.request_revision(_order_id => _order_id);
  perform set_config('gobi.order_flow', '', true);
  perform public._service_system_message(_order_id, auth.uid(), 'Revisi diminta: ' || n);
  return rid;
end $$;
revoke all on function public.service_request_revision(uuid, text) from public, anon;
grant execute on function public.service_request_revision(uuid, text) to authenticated;

-- Menyetujui hasil = pesanan selesai. Syarat: hasil sudah dikirim, pembayaran valid, tidak ada sengketa aktif.
create or replace function public.service_approve_work(_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare so public.service_orders;
begin
  so := public._service_order_lock(_order_id, 'buyer');
  if so.stage <> 'submitted' then raise exception 'Hasil belum dikirim atau sudah diproses (status: %)', so.stage; end if;
  if not exists (select 1 from public.service_submissions where order_id = _order_id) then raise exception 'Belum ada hasil yang dikirim'; end if;
  if not exists (select 1 from public.payments where order_id = _order_id and status = 'paid') then raise exception 'Pembayaran pesanan belum valid'; end if;
  if exists (select 1 from public.service_disputes where order_id = _order_id and status in ('open', 'under_review', 'waiting_buyer', 'waiting_seller')) then
    raise exception 'Ada sengketa aktif pada pesanan ini';
  end if;
  perform set_config('gobi.order_flow', '1', true);
  perform public.complete_order(_order_id => _order_id);
  perform set_config('gobi.order_flow', '', true);
end $$;
revoke all on function public.service_approve_work(uuid) from public, anon;
grant execute on function public.service_approve_work(uuid) to authenticated;

-- ============ 7. Daftar pesanan masuk penjual ============
-- _group: needs_action | working | submitted | issues | done | closed (kosong = semua). Pesanan yang belum dibayar tidak ditampilkan ke penjual.
create or replace function public.service_seller_orders(_group text default null, _limit int default 25, _offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim int := least(greatest(coalesce(_limit, 25), 1), 50);
  off int := greatest(coalesce(_offset, 0), 0);
  grp text := nullif(_group, '');
  counts jsonb; total bigint; rows jsonb;
begin
  perform public._service_guard();
  if grp is not null and grp not in ('needs_action', 'working', 'submitted', 'issues', 'done', 'closed') then raise exception 'Kelompok tidak valid'; end if;

  with mine as (
    select o.*, so.stage, so.due_at, so.accepted_at, so.delivery_days, so.revisions_included, so.revisions_used, so.package_snapshot,
      case when so.stage in ('pending_seller_acceptance', 'revision_requested') then 'needs_action'
           when so.stage in ('paid', 'in_progress') then 'working'
           when so.stage = 'submitted' then 'submitted'
           when so.stage in ('cancel_requested', 'disputed') then 'issues'
           when so.stage = 'completed' then 'done'
           else 'closed' end as grp
    from public.orders o join public.service_orders so on so.order_id = o.id
    where o.seller_id = uid and o.kind = 'service' and so.stage not in ('awaiting_payment', 'payment_processing')
  )
  select jsonb_build_object(
      'all', count(*), 'needs_action', count(*) filter (where grp = 'needs_action'), 'working', count(*) filter (where grp = 'working'),
      'submitted', count(*) filter (where grp = 'submitted'), 'issues', count(*) filter (where grp = 'issues'),
      'done', count(*) filter (where grp = 'done'), 'closed', count(*) filter (where grp = 'closed')),
    count(*) filter (where grp is not distinct from coalesce(grp_filter.g, grp))
  into counts, total
  from mine, (select grp as g) as grp_filter;

  select coalesce(jsonb_agg(t.x order by t.rn), '[]'::jsonb) into rows from (
    select row_number() over (order by
        case when m.grp in ('done', 'closed') then m.created_at end desc nulls last,
        case when m.grp not in ('done', 'closed') then coalesce(m.due_at, m.created_at) end asc nulls last,
        m.created_at desc) as rn,
      jsonb_build_object(
        'id', m.id, 'number', m.number, 'title', m.title, 'amount', m.amount, 'fee', m.fee_amount,
        'net', greatest(coalesce(m.amount, 0) - coalesce(m.fee_amount, 0), 0),
        'order_status', m.status, 'stage', m.stage, 'group', m.grp, 'due_at', m.due_at, 'accepted_at', m.accepted_at,
        'created_at', m.created_at, 'delivery_days', m.delivery_days,
        'revisions_included', m.revisions_included, 'revisions_used', m.revisions_used, 'package', m.package_snapshot ->> 'name',
        'buyer', jsonb_build_object('id', b.id, 'username', b.username, 'display_name', b.display_name, 'avatar_url', b.avatar_url)) as x
    from (select * from public.orders o join public.service_orders so on so.order_id = o.id where false) z, lateral (select 1) l, (select 1) dummy
    right join (
      select o.*, so.stage, so.due_at, so.accepted_at, so.delivery_days, so.revisions_included, so.revisions_used, so.package_snapshot,
        case when so.stage in ('pending_seller_acceptance', 'revision_requested') then 'needs_action'
             when so.stage in ('paid', 'in_progress') then 'working'
             when so.stage = 'submitted' then 'submitted'
             when so.stage in ('cancel_requested', 'disputed') then 'issues'
             when so.stage = 'completed' then 'done'
             else 'closed' end as grp
      from public.orders o join public.service_orders so on so.order_id = o.id
      where o.seller_id = uid and o.kind = 'service' and so.stage not in ('awaiting_payment', 'payment_processing')
    ) m on true
    join public.profiles b on b.id = m.buyer_id
    where grp is null or m.grp = grp
    limit lim offset off
  ) t;

  return jsonb_build_object('counts', counts, 'total', total, 'rows', rows);
end $$;
