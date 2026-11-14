-- GOBI WORK & escrow — Hapus sistem tahan saldo 1 hari. Saldo langsung diteruskan; refund jasa masuk ke saldo client.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH midtrans-escrow/001, 002
-- dan gobi-work/001–011. Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Aturan baru (menggantikan "ditahan admin minimal 1 hari"):
--   1. Dana pembayaran tetap disimpan di escrow selama pekerjaan berjalan (supaya client terlindungi), tetapi TIDAK ada masa tahan 1 hari lagi.
--   2. Client menyetujui hasil (milestone lowongan) atau menandai pesanan selesai (jasa) -> dana LANGSUNG diteruskan ke saldo developer/freelancer.
--   3. Client tidak menyetujui dan tidak meminta revisi sampai batas waktu yang disepakati -> hasil disetujui otomatis dan dana
--      LANGSUNG diteruskan ke freelancer pada saat itu juga (tanpa menunggu admin atau masa tahan).
--   4. Karya (beli langsung) tidak punya masa tahan: bagian developer langsung tersedia. Admin tetap bisa membekukan dana yang bermasalah.
--   5. Refund oleh admin untuk pesanan jasa masuk ke saldo client (client_wallet_entries, SQL 011), sama seperti lowongan, bukan lagi
--      "dikembalikan manual di dashboard Midtrans".
--   6. Dana yang dibekukan ('frozen': sengketa atau refund dari Midtrans) tidak pernah ikut diteruskan otomatis.
--
-- Tidak berubah: client menyetujui milestone -> langsung diteruskan (SQL 010), admin bisa meneruskan manual dan menyelesaikan
-- (work_admin_finish_milestone) atau refund + tutup (work_admin_refund_milestone), batas waktu menanggapi (_work_release_due_at).
-- Kolom escrow_ledger.held_until tetap ada (tidak dipakai lagi); baris baru diisi now().
--
-- Bagian 7 meneruskan dana lama: jasa yang SUDAH diterima client tetapi masih menunggu admin ikut diteruskan ke developer.

begin;

-- ============ 1. Pembayaran lunas: dana masuk escrow tanpa masa tahan ============
-- Sama dengan midtrans-escrow/001; beda: held_until = now() dan teks pesan sistem.
create or replace function public.midtrans_apply_notification(
  _midtrans_order_id text, _transaction_status text, _fraud_status text,
  _gross_amount numeric, _payment_type text, _raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  p record;
  o record;
  new_status text;
  fee numeric;
  res text;
begin
  perform public._require_server_proof();

  select * into p from public.payments where midtrans_order_id = _midtrans_order_id for update;
  if not found then
    insert into public.payment_events (midtrans_order_id, transaction_status, result, raw)
    values (_midtrans_order_id, _transaction_status, 'unknown_order', _raw);
    return 'unknown_order';
  end if;

  if _gross_amount is distinct from p.gross_amount then
    insert into public.payment_events (midtrans_order_id, transaction_status, result, raw)
    values (_midtrans_order_id, _transaction_status, 'amount_mismatch', _raw);
    return 'amount_mismatch';
  end if;

  -- Refund / chargeback setelah lunas: bekukan dana supaya admin memeriksa.
  if _transaction_status in ('refund', 'partial_refund', 'chargeback') then
    update public.escrow_ledger set status = 'frozen', note = 'Midtrans: ' || _transaction_status, updated_at = now()
      where order_id = p.order_id and status = 'held';
    update public.payments set needs_refund = true, raw = _raw, updated_at = now() where id = p.id;
    insert into public.payment_events (midtrans_order_id, transaction_status, result, raw)
    values (_midtrans_order_id, _transaction_status, 'frozen_after_refund', _raw);
    return 'frozen_after_refund';
  end if;

  new_status := case
    when _transaction_status = 'settlement' then 'paid'
    when _transaction_status = 'capture' and coalesce(_fraud_status, 'accept') = 'accept' then 'paid'
    when _transaction_status in ('pending', 'capture', 'authorize') then 'pending'
    when _transaction_status = 'expire' then 'expired'
    when _transaction_status = 'cancel' then 'cancelled'
    when _transaction_status = 'deny' then 'denied'
    else 'failed'
  end;

  if new_status = 'paid' then
    if p.status = 'paid' then
      res := 'already_paid';
    else
      update public.payments
        set status = 'paid', paid_at = coalesce(paid_at, now()),
            payment_type = coalesce(_payment_type, payment_type), raw = _raw, updated_at = now()
        where id = p.id;

      select * into o from public.orders where id = p.order_id for update;
      if found and o.status in ('awaiting_payment', 'payment_review') then
        fee := public.platform_fee(_amount => o.amount);
        update public.orders
          set status = case when o.kind = 'service' then 'in_progress' else 'completed' end,
              paid_at = now(),
              fee_amount = fee,
              completed_at = case when o.kind = 'service' then o.completed_at else now() end,
              updated_at = now()
          where id = o.id;

        insert into public.escrow_ledger (order_id, developer_id, kind, gross, fee, net, status, held_until)
        values (o.id, o.seller_id, o.kind, o.amount, fee, o.amount - fee, 'held', now())
        on conflict (order_id) do nothing;

        insert into public.order_messages (order_id, sender_id, body, is_system)
        values (o.id, o.buyer_id,
          'Pembayaran Midtrans diterima. Dana disimpan di escrow dan langsung diteruskan ke developer begitu client menyetujui hasil pekerjaan.',
          true);
        res := 'paid';
      else
        -- Dibayar, tetapi pesanan tidak lagi menunggu pembayaran (mis. dibayar dua kali): tandai untuk refund.
        update public.payments set needs_refund = true where id = p.id;
        res := 'paid_order_not_waiting';
      end if;
    end if;
  else
    -- Notifikasi non-lunas hanya mengubah percobaan yang masih pending (tidak menimpa paid / superseded).
    if p.status = 'pending' then
      update public.payments set status = new_status, raw = _raw, updated_at = now() where id = p.id;
    end if;
    res := 'status_' || new_status;
  end if;

  insert into public.payment_events (midtrans_order_id, transaction_status, result, raw)
  values (_midtrans_order_id, _transaction_status, res, _raw);
  return res;
end $$;
revoke all on function public.midtrans_apply_notification(text, text, text, numeric, text, jsonb) from public;
grant execute on function public.midtrans_apply_notification(text, text, text, numeric, text, jsonb) to anon, authenticated;


-- ============ 2. Admin meneruskan manual: tanpa syarat masa tahan ============
-- Sama dengan midtrans-escrow/001 tanpa pemeriksaan held_until. Jasa tetap harus sudah diterima client.
create or replace function public.admin_release_escrow(_order_id uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
  o record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  select * into l from public.escrow_ledger where order_id = _order_id for update;
  if not found then raise exception 'Dana escrow pesanan ini tidak ditemukan'; end if;
  if l.status <> 'held' then raise exception 'Status dana saat ini: % (harus ditahan)', l.status; end if;
  select * into o from public.orders where id = _order_id;
  if o.kind = 'service' and o.status <> 'completed' then
    raise exception 'Jasa belum diterima client (status pesanan: %)', o.status;
  end if;

  update public.escrow_ledger
    set status = 'released', released_at = now(), released_by = auth.uid(), note = nullif(_note, ''), updated_at = now()
    where order_id = _order_id;
  perform public._audit('escrow_release', 'order', _order_id::text, _note);
  insert into public.order_messages (order_id, sender_id, body, is_system)
  values (_order_id, o.buyer_id, 'Admin meneruskan saldo ke developer.', true);
end $$;
revoke all on function public.admin_release_escrow(uuid, text) from public, anon;
grant execute on function public.admin_release_escrow(uuid, text) to authenticated;


-- ============ 3. Refund admin untuk pesanan: masuk ke saldo client ============
-- Pembantu umum (tanpa kaitan milestone): escrow 'refunded', saldo client bertambah sebesar nilai yang dibayar, pesanan dibatalkan.
-- Mengembalikan jumlah yang dipindahkan (0 bila tidak ada dana 'held'/'frozen'). Tidak menandai "perlu refund" di Midtrans.
create or replace function public._refund_order_to_client_wallet(_order_id uuid, _note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare l record; o record;
begin
  select * into l from public.escrow_ledger where order_id = _order_id for update;
  if not found or l.status not in ('held', 'frozen') then return 0; end if;
  select * into o from public.orders where id = _order_id;
  update public.escrow_ledger
    set status = 'refunded', note = left('Dikembalikan ke saldo client: ' || coalesce(_note, ''), 500), updated_at = now()
    where order_id = _order_id;
  insert into public.client_wallet_entries (client_id, amount, kind, order_id, contract_id, note)
  values (o.buyer_id, l.gross, 'refund', _order_id, o.work_contract_id, nullif(left(coalesce(_note, ''), 500), ''));
  perform set_config('gobi.work_internal', '1', true);
  update public.orders set status = 'cancelled', updated_at = now() where id = _order_id and status not in ('cancelled', 'declined');
  perform set_config('gobi.work_internal', '', true);
  perform public._work_notify(o.buyer_id, 'payment_received', 'Dana pesanan dikembalikan ke saldo kamu. Kamu bisa menariknya di menu Saldo.', '/saldo');
  return l.gross;
end $$;
revoke all on function public._refund_order_to_client_wallet(uuid, text) from public, anon, authenticated;

-- _action: 'freeze' | 'unfreeze' | 'refund'. Sama dengan midtrans-escrow/001; beda: 'refund' memindahkan dana ke saldo client.
create or replace function public.admin_set_escrow(_order_id uuid, _action text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  l record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _action not in ('freeze', 'unfreeze', 'refund') then raise exception 'Aksi tidak dikenal'; end if;
  if _action in ('freeze', 'refund') and length(trim(coalesce(_note, ''))) < 3 then
    raise exception 'Isi alasan (minimal 3 huruf)';
  end if;
  select * into l from public.escrow_ledger where order_id = _order_id for update;
  if not found then raise exception 'Dana escrow pesanan ini tidak ditemukan'; end if;

  if _action = 'freeze' then
    if l.status <> 'held' then raise exception 'Hanya dana berstatus ditahan yang bisa dibekukan'; end if;
    update public.escrow_ledger set status = 'frozen', note = _note, updated_at = now() where order_id = _order_id;
  elsif _action = 'unfreeze' then
    if l.status <> 'frozen' then raise exception 'Dana tidak sedang dibekukan'; end if;
    update public.escrow_ledger set status = 'held', note = nullif(_note, ''), updated_at = now() where order_id = _order_id;
  else
    if l.status not in ('held', 'frozen') then raise exception 'Dana sudah diteruskan atau direfund'; end if;
    perform public._refund_order_to_client_wallet(_order_id, _note);
  end if;
  perform public._audit('escrow_' || _action, 'order', _order_id::text, _note);
end $$;
revoke all on function public.admin_set_escrow(uuid, text, text) from public, anon;
grant execute on function public.admin_set_escrow(uuid, text, text) to authenticated;

-- ============ 4. Client menandai pesanan jasa selesai -> dana langsung diteruskan ============
-- Pesanan yang dikelola kontrak GOBI WORK (work_milestone_id / work_contract_id) dilewati: dananya diteruskan oleh fungsi kontrak
-- (work_approve_milestone, _work_auto_release) supaya status milestone ikut berubah. Dana 'frozen' tidak ikut diteruskan.
create or replace function public._release_escrow_on_order_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.escrow_ledger
    set status = 'released', released_at = now(), released_by = null,
        note = 'Otomatis: client menerima hasil, dana langsung diteruskan', updated_at = now()
    where order_id = new.id and status = 'held';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.order_messages (order_id, sender_id, body, is_system)
    values (new.id, new.buyer_id, 'Client menerima hasil. Dana langsung diteruskan ke saldo developer.', true);
  end if;
  return null;
end $$;
revoke all on function public._release_escrow_on_order_completed() from public, anon, authenticated;
drop trigger if exists release_escrow_on_complete_trg on public.orders;
create trigger release_escrow_on_complete_trg after update of status on public.orders
  for each row when (old.status is distinct from new.status and new.status = 'completed' and new.kind = 'service'
                     and new.work_milestone_id is null and new.work_contract_id is null)
  execute function public._release_escrow_on_order_completed();

-- ============ 5. Saldo developer tanpa masa tahan ============
--   on_hold        : jasa yang masih dikerjakan (belum diterima client); dana disimpan di escrow sampai client menerima
--   awaiting_admin : tersisa untuk kompatibilitas; jasa sudah diterima tetapi dananya belum diteruskan (seharusnya 0)
--   available      : sudah diteruskan, ditambah karya yang dibeli (langsung tersedia). Dikurangi pencairan.
create or replace function public.developer_wallet(_user_id uuid)
returns table (on_hold numeric, awaiting_admin numeric, available numeric, frozen numeric, requested numeric, paid_out numeric)
language sql stable security definer set search_path = public as $$
  with l as (
    select e.net, e.status, e.kind, o.status as ostatus
    from public.escrow_ledger e join public.orders o on o.id = e.order_id
    where e.developer_id = _user_id
  ), a as (
    select
      coalesce(sum(net) filter (where status = 'held' and kind = 'service' and ostatus <> 'completed'), 0) as c_hold,
      coalesce(sum(net) filter (where status = 'held' and kind = 'service' and ostatus = 'completed'), 0) as c_wait,
      coalesce(sum(net) filter (where status = 'released' or (status = 'held' and kind <> 'service')), 0) as c_ok,
      coalesce(sum(net) filter (where status = 'frozen'), 0) as c_frozen
    from l
  ), p as (
    select
      coalesce(sum(amount) filter (where status = 'requested'), 0) as c_req,
      coalesce(sum(amount) filter (where status = 'paid'), 0) as c_paid
    from public.payouts where developer_id = _user_id
  )
  select a.c_hold, a.c_wait, greatest(a.c_ok - p.c_req - p.c_paid, 0), a.c_frozen, p.c_req, p.c_paid
  from a, p
  where _user_id = auth.uid() or public._is_admin()
$$;
revoke all on function public.developer_wallet(uuid) from public, anon;
grant execute on function public.developer_wallet(uuid) to authenticated;

-- ============ 6. Lowongan: batas waktu terlewat -> setujui otomatis DAN langsung teruskan dana ============
-- Sama dengan gobi-work/006 untuk pemilihan milestone dan batas waktu (_work_release_due_at tidak berubah). Beda: tidak ada lagi tahap kedua
-- yang menunggu held_until; dana diteruskan saat itu juga. Milestone diubah ke 'approved' lebih dulu supaya trigger escrow
-- (_work_on_escrow_released) mengubahnya menjadi 'released'. Dana 'frozen'/'refunded' tidak diteruskan (freelancer tetap diberi tahu).
create or replace function public._work_auto_release(_contract_id uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; released boolean;
begin
  for r in
    select m.id, m.contract_id, m.order_id, c.client_id, c.freelancer_id
    from public.contract_milestones m join public.work_contracts c on c.id = m.contract_id
    where m.status = 'submitted' and c.status = 'active' and m.deadline is not null and m.order_id is not null
      and now() >= public._work_release_due_at(m.id)
      and (_contract_id is null or c.id = _contract_id)
    order by m.id
    for update of m skip locked
  loop
    update public.contract_milestones set status = 'approved', auto_approved_at = now(), updated_at = now() where id = r.id;
    perform set_config('gobi.work_internal', '1', true);
    update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = r.order_id and status in ('in_progress', 'delivered');
    perform set_config('gobi.work_internal', '', true);
    insert into public.work_contract_events (contract_id, actor_id, event, detail)
      values (r.contract_id, null, 'milestone_auto_approved', jsonb_build_object('milestone', r.id));

    -- Trigger _work_on_escrow_released mengubah milestone menjadi 'released' dan memberi tahu freelancer.
    released := public._work_release_order_escrow(r.order_id, 'Otomatis: client tidak menyetujui atau meminta revisi sampai batas waktu yang disepakati', null);
    if released then
      insert into public.work_contract_events (contract_id, actor_id, event, detail)
        values (r.contract_id, null, 'milestone_auto_released', jsonb_build_object('milestone', r.id, 'order', r.order_id));
    else
      perform public._work_notify(r.freelancer_id, 'work_approved', 'Client tidak menanggapi sampai batas waktu: hasil disetujui otomatis. Dana sedang dibekukan admin.', '/kerja/kontrak/' || r.contract_id);
    end if;
    perform public._work_notify(r.client_id, 'work_approved',
      case when released then 'Batas waktu menanggapi habis: hasil disetujui otomatis dan dana langsung diteruskan ke freelancer'
           else 'Batas waktu menanggapi habis: hasil disetujui otomatis' end,
      '/kerja/kontrak/' || r.contract_id);
    perform public._work_refresh_contract(r.contract_id);
    n := n + 1;
  end loop;

  -- Sisa dari aturan lama: milestone yang sudah disetujui otomatis tetapi dananya masih menunggu masa tahan.
  for r in
    select m.id, m.contract_id, m.order_id
    from public.contract_milestones m join public.escrow_ledger l on l.order_id = m.order_id
    where m.status = 'approved' and m.auto_approved_at is not null and l.status = 'held'
      and (_contract_id is null or m.contract_id = _contract_id)
    order by m.id
    for update of l skip locked
  loop
    if public._work_release_order_escrow(r.order_id, 'Otomatis: client tidak menyetujui atau meminta revisi sampai batas waktu yang disepakati', null) then
      insert into public.work_contract_events (contract_id, actor_id, event, detail)
        values (r.contract_id, null, 'milestone_auto_released', jsonb_build_object('milestone', r.id, 'order', r.order_id));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public._work_auto_release(uuid) from public, anon, authenticated;

-- ============ 7. Dana lama: teruskan jasa yang sudah diterima client ============
-- Pesanan jasa berstatus 'completed' yang dananya masih 'held' (menunggu masa tahan atau konfirmasi admin) diteruskan sekarang.
-- Untuk pesanan milik kontrak GOBI WORK, trigger escrow mengubah milestone 'approved' menjadi 'released'. Dana 'frozen' tidak disentuh.
update public.escrow_ledger e
   set status = 'released', released_at = now(), released_by = null,
       note = 'Otomatis: aturan tahan 1 hari dihapus, client sudah menerima hasil', updated_at = now()
  from public.orders o
 where o.id = e.order_id and e.status = 'held' and e.kind = 'service' and o.status = 'completed';

commit;

-- Muat ulang skema API agar fungsi baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select proname from pg_proc where proname in ('_refund_order_to_client_wallet','_release_escrow_on_order_completed','developer_wallet','_work_auto_release');
--   select tgname from pg_trigger where tgname = 'release_escrow_on_complete_trg';
--   -- uji jasa: bayar pesanan jasa di sandbox -> developer kirim hasil -> client "Tandai selesai" -> escrow_ledger.status = 'released' seketika.
--   -- uji refund jasa: admin "Refund ke saldo client" di /admin/escrow -> select * from client_wallet_entries order by created_at desc limit 1;
--   -- uji lowongan: biarkan milestone 'submitted' melewati batas waktu, buka kontrak (work_sweep_due) -> milestone 'released' tanpa menunggu 1 hari.
