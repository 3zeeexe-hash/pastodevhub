-- GOBI WORK — Fase 3–7: tagihan milestone/jam lewat Midtrans, pendanaan otomatis, dashboard, notifikasi, admin, rekonsiliasi.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH:
--   1. docs/sql/midtrans-escrow/001_midtrans_escrow.sql
--   2. docs/sql/midtrans-escrow/002_lowongan_pesanan.sql
--   3. docs/sql/gobi-work/001_gobi_work_core.sql
-- Aman dijalankan ulang (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS). Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Prinsip yang dijaga:
--   * Tidak ada escrow buatan sendiri: dana tetap lewat orders -> payments -> escrow_ledger (Midtrans) yang sudah ada.
--   * Status pembayaran tidak pernah ditentukan oleh status pekerjaan: milestone baru 'funded' setelah pembayaran
--     Midtrans terverifikasi server (trigger pada orders.paid_at, yang hanya terisi oleh midtrans_apply_notification).
--   * Pesanan milestone/jam tidak bisa ditandai 'delivered'/'completed' lewat jalur pesanan biasa.
--   * Pencairan tetap manual oleh admin (admin_release_escrow); keputusan sengketa menggerakkan escrow secara tercatat.

begin;

-- ============ 1. Kolom penghubung ============
alter table public.orders add column if not exists job_application_id uuid references public.job_applications(id) on delete set null;
alter table public.orders
  add column if not exists work_milestone_id uuid references public.contract_milestones(id) on delete set null,
  add column if not exists work_contract_id uuid references public.work_contracts(id) on delete set null;

-- Satu milestone hanya boleh punya satu pesanan aktif (pesanan yang dibatalkan boleh dibuat ulang).
drop index if exists public.orders_work_milestone_uidx;
create unique index orders_work_milestone_uidx on public.orders (work_milestone_id)
  where work_milestone_id is not null and status not in ('cancelled', 'declined');
create index if not exists orders_work_contract_idx on public.orders (work_contract_id) where work_contract_id is not null;

alter table public.work_timesheets add column if not exists billed_order_id uuid references public.orders(id) on delete set null;

-- Tahap lamaran (dilihat / shortlist / interview) disimpan terpisah agar aturan status lamaran yang lama tidak tersentuh.
alter table public.job_applications add column if not exists work_stage text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'job_applications_work_stage_check') then
    alter table public.job_applications add constraint job_applications_work_stage_check check (work_stage in ('viewed', 'shortlisted', 'interview'));
  end if;
end $$;

-- Status dibaca pada chat pekerjaan.
alter table public.job_messages add column if not exists read_at timestamptz;

-- ============ 2. Penjaga pesanan ============
-- (a) Lamaran yang sudah memakai kontrak tidak boleh dibuatkan pesanan langsung (cegah pembayaran ganda).
-- (b) Pesanan milestone/jam hanya boleh 'delivered'/'completed' lewat fungsi kerja (persetujuan yang valid).
create or replace function public._work_orders_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.job_application_id is not null and exists (select 1 from public.work_contracts where application_id = new.job_application_id) then
      raise exception 'Lamaran ini sudah memakai kontrak GOBI WORK: bayar lewat milestone pada kontrak';
    end if;
    return new;
  end if;
  if (new.work_milestone_id is not null or new.work_contract_id is not null)
     and new.status is distinct from old.status
     and new.status in ('delivered', 'completed')
     and coalesce(current_setting('gobi.work_internal', true), '') <> '1' then
    raise exception 'Pesanan ini dikelola lewat kontrak GOBI WORK: kirim dan setujui hasil dari halaman kontrak';
  end if;
  return new;
end $$;
revoke all on function public._work_orders_guard() from public, anon, authenticated;
drop trigger if exists work_orders_guard_trg on public.orders;
create trigger work_orders_guard_trg before insert or update of status on public.orders
  for each row execute function public._work_orders_guard();

-- ============ 3. Pendanaan milestone dari pembayaran terverifikasi ============
-- Mengembalikan false (tidak pernah raise) agar notifikasi Midtrans tidak gagal; pembayaran yang tidak bisa dipakai ditandai perlu refund.
create or replace function public._work_fund_milestone(_milestone_id uuid, _order_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare m record; c record; o record;
begin
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found or m.status <> 'awaiting_payment' then return false; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if not found or c.status <> 'active' then return false; end if;
  select * into o from public.orders where id = _order_id;
  if not found or o.buyer_id <> c.client_id or o.seller_id <> c.freelancer_id then return false; end if;
  if o.amount <> m.amount or o.paid_at is null or o.status not in ('in_progress', 'delivered', 'completed') then return false; end if;
  update public.contract_milestones set status = 'funded', order_id = _order_id, updated_at = now() where id = _milestone_id;
  perform public._work_event(m.contract_id, 'milestone_funded', jsonb_build_object('milestone', _milestone_id, 'order', _order_id));
  perform public._work_notify(c.freelancer_id, 'payment_received', 'Pembayaran milestone diterima, kamu bisa mulai', '/kerja/kontrak/' || c.id);
  perform public._work_notify(c.client_id, 'payment_received', 'Pembayaran milestone terverifikasi', '/kerja/kontrak/' || c.id);
  return true;
end $$;
revoke all on function public._work_fund_milestone(uuid, uuid) from public, anon, authenticated;

-- Jalur server (rekonsiliasi manual): tetap memerlukan bukti server dan memakai fungsi yang sama.
create or replace function public.work_mark_milestone_funded(_milestone_id uuid, _order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_server_proof();
  if not public._work_fund_milestone(_milestone_id, _order_id) then
    raise exception 'Milestone tidak bisa didanai dari pesanan ini';
  end if;
end $$;
revoke all on function public.work_mark_milestone_funded(uuid, uuid) from public, anon, authenticated;
grant execute on function public.work_mark_milestone_funded(uuid, uuid) to anon, authenticated;

create or replace function public._work_on_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.work_milestone_id is not null then
    if not public._work_fund_milestone(new.work_milestone_id, new.id) then
      update public.payments set needs_refund = true, updated_at = now() where order_id = new.id and status = 'paid';
      insert into public.payment_events (midtrans_order_id, transaction_status, result, raw)
      values (null, 'settlement', 'work_milestone_not_fundable', jsonb_build_object('order', new.id, 'milestone', new.work_milestone_id));
    end if;
  elsif new.work_contract_id is not null then
    -- Tagihan jam kerja: jam sudah disetujui client sebelum ditagih, jadi pesanan selesai saat dibayar.
    perform set_config('gobi.work_internal', '1', true);
    update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = new.id and status = 'in_progress';
    perform set_config('gobi.work_internal', '', true);
    perform public._work_event(new.work_contract_id, 'hourly_invoice_paid', jsonb_build_object('order', new.id));
    perform public._work_notify(new.seller_id, 'payment_received', 'Pembayaran jam kerja diterima', '/kerja/kontrak/' || new.work_contract_id);
  end if;
  return null;
end $$;
revoke all on function public._work_on_order_paid() from public, anon, authenticated;
drop trigger if exists work_orders_paid_trg on public.orders;
create trigger work_orders_paid_trg after update of paid_at on public.orders
  for each row when (old.paid_at is null and new.paid_at is not null)
  execute function public._work_on_order_paid();

-- Saat admin meneruskan dana (escrow released), milestone ikut berstatus 'released'.
create or replace function public._work_on_escrow_released()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record; fid uuid;
begin
  select * into m from public.contract_milestones where order_id = new.order_id and status = 'approved' for update;
  if found then
    update public.contract_milestones set status = 'released', updated_at = now() where id = m.id;
    perform public._work_event(m.contract_id, 'milestone_released', jsonb_build_object('milestone', m.id, 'order', new.order_id));
    select freelancer_id into fid from public.work_contracts where id = m.contract_id;
    perform public._work_notify(fid, 'payout_processing', 'Admin meneruskan dana milestone ke saldomu', '/kerja/pembayaran');
  end if;
  return null;
end $$;
revoke all on function public._work_on_escrow_released() from public, anon, authenticated;
drop trigger if exists work_escrow_released_trg on public.escrow_ledger;
create trigger work_escrow_released_trg after update of status on public.escrow_ledger
  for each row when (old.status is distinct from new.status and new.status = 'released')
  execute function public._work_on_escrow_released();

-- ============ 4. Tagihan: milestone dan jam kerja ============
-- Nominal SELALU dari milestone di server; klien tidak bisa menentukan harga.
create or replace function public.work_create_order_from_milestone(_milestone_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m record; c record; oid uuid; existing uuid;
begin
  perform public._work_guard();
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id;
  if c.client_id <> auth.uid() then raise exception 'Hanya client kontrak ini yang bisa membayar'; end if;
  if c.status <> 'active' then raise exception 'Kontrak belum aktif'; end if;
  if m.status <> 'awaiting_payment' then raise exception 'Milestone tidak sedang menunggu pembayaran'; end if;
  select id into existing from public.orders where work_milestone_id = m.id and status = 'awaiting_payment';
  if existing is not null then return existing; end if;
  if m.amount < 1000 then raise exception 'Pembayaran minimal Rp1.000 per milestone'; end if;
  insert into public.orders (kind, status, title, brief, amount, buyer_id, seller_id, work_milestone_id, work_contract_id)
  values ('service', 'awaiting_payment', left('Kontrak: ' || c.title || ' — ' || m.title, 120), left(coalesce(m.description, ''), 2000),
          m.amount, c.client_id, c.freelancer_id, m.id, c.id)
  returning id into oid;
  insert into public.order_messages (order_id, sender_id, body, is_system)
  values (oid, c.client_id, 'Tagihan milestone dari kontrak GOBI WORK. Bayar lewat Midtrans; dana ditahan admin (escrow) sampai hasil disetujui client.', true);
  perform public._work_event(c.id, 'milestone_order_created', jsonb_build_object('milestone', m.id, 'order', oid));
  return oid;
end $$;
revoke all on function public.work_create_order_from_milestone(uuid) from public, anon;
grant execute on function public.work_create_order_from_milestone(uuid) to authenticated;

-- Tagihan jam kerja: hanya jam berstatus disetujui yang belum pernah ditagih. Tagihan lama yang belum dibayar dibatalkan dan dihitung ulang.
create or replace function public.work_create_order_from_timesheets(_contract_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; hrs numeric; amt bigint; oid uuid; r record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or c.client_id <> auth.uid() then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.payment_type <> 'hourly' or c.status not in ('active', 'completed') then raise exception 'Tagihan hanya untuk kontrak per jam yang aktif atau selesai'; end if;
  for r in select id from public.orders where work_contract_id = _contract_id and work_milestone_id is null and status = 'awaiting_payment' for update loop
    update public.orders set status = 'cancelled', updated_at = now() where id = r.id;
    update public.work_timesheets set billed_order_id = null where billed_order_id = r.id;
  end loop;
  select coalesce(sum(hours), 0) into hrs from public.work_timesheets
    where contract_id = _contract_id and status = 'approved' and billed_order_id is null;
  amt := round(hrs * c.hourly_rate)::bigint;
  if amt < 1000 then raise exception 'Belum ada jam disetujui yang bisa ditagih (minimal Rp1.000)'; end if;
  insert into public.orders (kind, status, title, brief, amount, buyer_id, seller_id, work_contract_id)
  values ('service', 'awaiting_payment', left('Jam kerja: ' || c.title, 120), hrs::text || ' jam disetujui x tarif per jam', amt, c.client_id, c.freelancer_id, c.id)
  returning id into oid;
  update public.work_timesheets set billed_order_id = oid
    where contract_id = _contract_id and status = 'approved' and billed_order_id is null;
  insert into public.order_messages (order_id, sender_id, body, is_system)
  values (oid, c.client_id, 'Tagihan jam kerja yang sudah disetujui client. Bayar lewat Midtrans; dana ditahan admin (escrow).', true);
  perform public._work_event(_contract_id, 'hourly_invoice_created', jsonb_build_object('order', oid, 'hours', hrs, 'amount', amt));
  return oid;
end $$;
revoke all on function public.work_create_order_from_timesheets(uuid) from public, anon;
grant execute on function public.work_create_order_from_timesheets(uuid) to authenticated;

-- ============ 5. Fungsi Fase 1 yang disempurnakan (parameter dan tipe kembalian sama) ============

-- Lamaran yang sudah punya pesanan langsung tidak boleh dibuatkan kontrak (cegah pembayaran ganda).
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
  if exists (select 1 from public.orders where job_application_id = _application_id and status not in ('cancelled', 'declined')) then
    raise exception 'Lamaran ini sudah punya pesanan langsung: lanjutkan pesanan itu atau batalkan dulu';
  end if;
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

-- Persetujuan client: pesanan Midtrans milestone ikut 'completed' (satu-satunya jalur yang sah), sehingga escrow baru bisa diteruskan admin.
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
  if m.order_id is not null then
    perform set_config('gobi.work_internal', '1', true);
    update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
      where id = m.order_id and status in ('in_progress', 'delivered');
    perform set_config('gobi.work_internal', '', true);
  end if;
  perform public._work_event(c.id, 'milestone_approved', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.freelancer_id, 'work_approved', 'Client menyetujui hasil pekerjaan', '/kerja/kontrak/' || c.id);
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_approve_milestone(uuid) from public, anon;
grant execute on function public.work_approve_milestone(uuid) to authenticated;

-- Pembatalan juga membatalkan tagihan yang belum dibayar. Jika tagihan itu sempat dibayar kemudian, notifikasi Midtrans menandainya perlu refund.
create or replace function public.work_cancel_contract(_contract_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or auth.uid() not in (c.client_id, c.freelancer_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status not in ('draft', 'waiting_approval', 'active') then raise exception 'Kontrak dengan status % tidak bisa dibatalkan', c.status; end if;
  if length(trim(coalesce(_reason, ''))) < 3 then raise exception 'Isi alasan pembatalan'; end if;
  if exists (select 1 from public.contract_milestones where contract_id = _contract_id
             and status in ('funded', 'in_progress', 'submitted', 'revision_requested', 'approved', 'released', 'disputed')) then
    raise exception 'Sudah ada dana atau pekerjaan berjalan: ajukan sengketa, bukan pembatalan';
  end if;
  if c.payment_type = 'hourly' and exists (select 1 from public.work_timesheets where contract_id = _contract_id) then
    raise exception 'Sudah ada catatan jam kerja: ajukan sengketa, bukan pembatalan';
  end if;
  update public.orders set status = 'cancelled', updated_at = now() where work_contract_id = _contract_id and status = 'awaiting_payment';
  update public.contract_milestones set status = 'cancelled', updated_at = now() where contract_id = _contract_id;
  update public.work_contracts set status = 'cancelled', updated_at = now() where id = _contract_id;
  perform public._work_event(_contract_id, 'cancelled', jsonb_build_object('reason', left(_reason, 1000)));
  perform public._work_notify(case when auth.uid() = c.client_id then c.freelancer_id else c.client_id end, 'contract_cancelled', 'Kontrak dibatalkan', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public.work_cancel_contract(uuid, text) from public, anon;
grant execute on function public.work_cancel_contract(uuid, text) to authenticated;

-- Membuka sengketa membekukan dana escrow milestone tersebut sampai admin memutuskan.
create or replace function public.work_open_dispute(_contract_id uuid, _milestone_id uuid, _reason text, _evidence jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; m record; did uuid; prev text;
begin
  perform public._work_guard();
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found or auth.uid() not in (c.client_id, c.freelancer_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status not in ('active', 'disputed') then raise exception 'Sengketa hanya untuk kontrak aktif'; end if;
  if length(trim(coalesce(_reason, ''))) < 20 then raise exception 'Jelaskan masalahnya (minimal 20 karakter)'; end if;
  if _milestone_id is not null then
    select * into m from public.contract_milestones where id = _milestone_id and contract_id = _contract_id for update;
    if not found then raise exception 'Milestone tidak ditemukan'; end if;
    if m.status not in ('funded', 'in_progress', 'submitted', 'revision_requested', 'approved') then raise exception 'Milestone ini tidak bisa disengketakan'; end if;
    prev := m.status;
    update public.contract_milestones set status = 'disputed', updated_at = now() where id = _milestone_id;
    if m.order_id is not null then
      update public.escrow_ledger set status = 'frozen', note = 'Sengketa GOBI WORK', updated_at = now()
        where order_id = m.order_id and status = 'held';
    end if;
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

-- Keputusan admin: tercatat di audit, menggerakkan status kerja DAN escrow secara tervalidasi.
--   favor_client     -> escrow 'refunded', pembayaran ditandai perlu refund (pengembalian uang manual di dashboard Midtrans), pesanan dibatalkan
--   favor_freelancer -> pesanan selesai, escrow kembali 'held' (admin meneruskan setelah masa tahan)
--   split            -> escrow tetap dibekukan; admin membagi dana secara manual lalu mencatatnya
--   dismissed        -> escrow kembali 'held', pekerjaan berlanjut
create or replace function public.work_admin_decide_dispute(_dispute_id uuid, _decision text, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare d record; oid uuid;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _decision not in ('favor_client', 'favor_freelancer', 'split', 'dismissed') then raise exception 'Keputusan tidak dikenal'; end if;
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
    select order_id into oid from public.contract_milestones where id = d.milestone_id;
    if oid is not null then
      if _decision = 'favor_client' then
        update public.escrow_ledger set status = 'refunded', note = 'Sengketa: dimenangkan client', updated_at = now() where order_id = oid and status in ('held', 'frozen');
        update public.payments set needs_refund = true, updated_at = now() where order_id = oid and status = 'paid';
        perform set_config('gobi.work_internal', '1', true);
        update public.orders set status = 'cancelled', updated_at = now() where id = oid and status not in ('cancelled', 'declined');
        perform set_config('gobi.work_internal', '', true);
      elsif _decision = 'favor_freelancer' then
        perform set_config('gobi.work_internal', '1', true);
        update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = oid and status in ('in_progress', 'delivered');
        perform set_config('gobi.work_internal', '', true);
        update public.escrow_ledger set status = 'held', note = null, updated_at = now() where order_id = oid and status = 'frozen';
      elsif _decision = 'dismissed' then
        update public.escrow_ledger set status = 'held', note = null, updated_at = now() where order_id = oid and status = 'frozen';
      else
        update public.escrow_ledger set note = 'Sengketa: dibagi, diselesaikan manual oleh admin', updated_at = now() where order_id = oid and status = 'frozen';
      end if;
    end if;
  end if;
  perform public._audit('work_dispute_' || _decision, 'work_dispute', _dispute_id::text, _note);
  perform public._work_event(d.contract_id, 'dispute_resolved', jsonb_build_object('dispute', _dispute_id, 'decision', _decision));
  perform public._work_refresh_contract(d.contract_id);
  perform public._work_notify((select client_id from public.work_contracts where id = d.contract_id), 'dispute_update', 'Sengketa diputuskan admin', '/kerja/kontrak/' || d.contract_id);
  perform public._work_notify((select freelancer_id from public.work_contracts where id = d.contract_id), 'dispute_update', 'Sengketa diputuskan admin', '/kerja/kontrak/' || d.contract_id);
end $$;
revoke all on function public.work_admin_decide_dispute(uuid, text, text) from public, anon;
grant execute on function public.work_admin_decide_dispute(uuid, text, text) to authenticated;

-- ============ 6. Tahap lamaran & chat pekerjaan ============
create or replace function public.work_set_application_stage(_application_id uuid, _stage text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; j record;
begin
  perform public._work_guard();
  if _stage not in ('viewed', 'shortlisted', 'interview') then raise exception 'Tahap tidak dikenal'; end if;
  select * into a from public.job_applications where id = _application_id for update;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id;
  if j.client_id <> auth.uid() then raise exception 'Bukan lowongan kamu'; end if;
  if a.status <> 'pending' then raise exception 'Tahap hanya untuk lamaran yang masih menunggu jawaban'; end if;
  update public.job_applications set work_stage = _stage where id = _application_id;
  perform public._work_notify(a.developer_id, 'application_stage',
    case _stage when 'viewed' then 'Lamaranmu sudah dilihat client' when 'shortlisted' then 'Lamaranmu masuk shortlist' else 'Client mengundangmu interview' end,
    '/lowongan/' || j.id);
end $$;
revoke all on function public.work_set_application_stage(uuid, text) from public, anon;
grant execute on function public.work_set_application_stage(uuid, text) to authenticated;

-- Dipanggil saat pemilik lowongan membuka daftar pelamar: menandai 'dilihat' sekali saja.
create or replace function public.work_mark_applications_viewed(_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._work_guard();
  if not exists (select 1 from public.jobs where id = _job_id and client_id = auth.uid()) then return; end if;
  with upd as (
    update public.job_applications set work_stage = 'viewed'
    where job_id = _job_id and work_stage is null and status = 'pending'
    returning developer_id
  )
  insert into public.work_notifications (user_id, kind, title, link)
  select developer_id, 'application_viewed', 'Lamaranmu sudah dilihat client', '/lowongan/' || _job_id from upd;
end $$;
revoke all on function public.work_mark_applications_viewed(uuid) from public, anon;
grant execute on function public.work_mark_applications_viewed(uuid) to authenticated;

-- Menandai pesan lawan bicara sebagai dibaca; hanya kedua pihak lamaran yang bisa memanggilnya.
create or replace function public.work_mark_thread_read(_application_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.job_applications a join public.jobs j on j.id = a.job_id
                 where a.id = _application_id and auth.uid() in (a.developer_id, j.client_id)) then return; end if;
  update public.job_messages set read_at = now() where application_id = _application_id and sender_id <> auth.uid() and read_at is null;
  update public.work_notifications set read_at = now()
    where user_id = auth.uid() and kind = 'message' and link = '/kerja/pesan?application=' || _application_id and read_at is null;
end $$;
revoke all on function public.work_mark_thread_read(uuid) from public, anon;
grant execute on function public.work_mark_thread_read(uuid) to authenticated;

-- ============ 7. Notifikasi otomatis (tidak pernah menggagalkan aksi utama) ============
create or replace function public._work_on_application()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record;
begin
  begin
    select * into j from public.jobs where id = new.job_id;
    if tg_op = 'INSERT' then
      perform public._work_notify(j.client_id, 'application_new', 'Lamaran baru masuk: ' || left(j.title, 80), '/lowongan/' || j.id);
    elsif new.status is distinct from old.status then
      if new.status = 'accepted' then
        perform public._work_notify(new.developer_id, 'application_accepted', 'Lamaranmu diterima: ' || left(j.title, 80), '/lowongan/' || j.id);
      elsif new.status = 'rejected' then
        perform public._work_notify(new.developer_id, 'application_rejected', 'Lamaranmu tidak dipilih: ' || left(j.title, 80), '/lowongan/' || j.id);
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_application() from public, anon, authenticated;
drop trigger if exists work_application_notify_trg on public.job_applications;
create trigger work_application_notify_trg after insert or update of status on public.job_applications
  for each row execute function public._work_on_application();

create or replace function public._work_on_job_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare a record; j record; target uuid; lnk text;
begin
  begin
    select * into a from public.job_applications where id = new.application_id;
    select * into j from public.jobs where id = a.job_id;
    target := case when new.sender_id = a.developer_id then j.client_id else a.developer_id end;
    lnk := '/kerja/pesan?application=' || new.application_id;
    if target is not null and target <> new.sender_id and not exists (
      select 1 from public.work_notifications where user_id = target and kind = 'message' and link = lnk and read_at is null) then
      perform public._work_notify(target, 'message', 'Pesan baru: ' || left(j.title, 80), lnk);
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_job_message() from public, anon, authenticated;
drop trigger if exists work_job_message_notify_trg on public.job_messages;
create trigger work_job_message_notify_trg after insert on public.job_messages
  for each row execute function public._work_on_job_message();

-- Lowongan baru memberi tahu developer yang keahliannya beririsan (maksimal 50 penerima).
create or replace function public._work_on_job_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'open' and coalesce(new.moderation_status, 'approved') = 'approved' and coalesce(array_length(new.skills, 1), 0) > 0 then
      insert into public.work_notifications (user_id, kind, title, link)
      select p.id, 'job_new', 'Lowongan baru yang cocok: ' || left(new.title, 80), '/lowongan/' || new.id
      from public.profiles p
      where p.account_type = 'developer' and p.id <> new.client_id and p.skills && new.skills
      limit 50;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_job_insert() from public, anon, authenticated;
drop trigger if exists work_job_insert_notify_trg on public.jobs;
create trigger work_job_insert_notify_trg after insert on public.jobs
  for each row execute function public._work_on_job_insert();

-- ============ 8. Dashboard pengguna ============
create or replace function public.work_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Masuk dulu'; end if;
  return jsonb_build_object(
    'client', jsonb_build_object(
      'jobs_total', (select count(*) from public.jobs where client_id = uid),
      'jobs_open', (select count(*) from public.jobs where client_id = uid and status = 'open'),
      'applicants_total', (select count(*) from public.job_applications a join public.jobs j on j.id = a.job_id where j.client_id = uid and a.status <> 'withdrawn'),
      'applicants_new', (select count(*) from public.job_applications a join public.jobs j on j.id = a.job_id where j.client_id = uid and a.status = 'pending' and a.work_stage is null),
      'contracts_active', (select count(*) from public.work_contracts where client_id = uid and status in ('active', 'disputed')),
      'projects_done', (select count(*) from public.work_contracts where client_id = uid and status = 'completed'),
      'paid_total', (select coalesce(sum(amount), 0) from public.orders where buyer_id = uid and paid_at is not null and (work_milestone_id is not null or work_contract_id is not null)),
      'transactions', (select count(*) from public.orders where buyer_id = uid and paid_at is not null and (work_milestone_id is not null or work_contract_id is not null))
    ),
    'freelancer', jsonb_build_object(
      'applications_sent', (select count(*) from public.job_applications where developer_id = uid),
      'applications_viewed', (select count(*) from public.job_applications where developer_id = uid and work_stage is not null),
      'applications_accepted', (select count(*) from public.job_applications where developer_id = uid and status = 'accepted'),
      'projects_active', (select count(*) from public.work_contracts where freelancer_id = uid and status in ('active', 'disputed')),
      'projects_done', (select count(*) from public.work_contracts where freelancer_id = uid and status = 'completed'),
      'earned', (select coalesce(sum(e.net), 0) from public.escrow_ledger e join public.orders o on o.id = e.order_id where e.developer_id = uid and e.status = 'released' and (o.work_milestone_id is not null or o.work_contract_id is not null)),
      'pending_payout', (select coalesce(sum(e.net), 0) from public.escrow_ledger e join public.orders o on o.id = e.order_id where e.developer_id = uid and e.status in ('held', 'frozen') and (o.work_milestone_id is not null or o.work_contract_id is not null)),
      'rating', (select round(avg(rating)::numeric, 2) from public.work_reviews where reviewee_id = uid),
      'reviews', (select count(*) from public.work_reviews where reviewee_id = uid)
    ),
    'unread_notifications', (select count(*) from public.work_notifications where user_id = uid and read_at is null)
  );
end $$;
revoke all on function public.work_dashboard_stats() from public, anon;
grant execute on function public.work_dashboard_stats() to authenticated;

-- ============ 9. Admin ============
create or replace function public.work_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  return jsonb_build_object(
    'clients', (select count(*) from public.profiles where account_type = 'client'),
    'freelancers', (select count(*) from public.profiles where account_type = 'developer'),
    'jobs', (select count(*) from public.jobs),
    'jobs_pending_moderation', (select count(*) from public.jobs where moderation_status = 'pending'),
    'applications', (select count(*) from public.job_applications),
    'contracts_active', (select count(*) from public.work_contracts where status = 'active'),
    'contracts_completed', (select count(*) from public.work_contracts where status = 'completed'),
    'transactions', (select count(*) from public.orders where paid_at is not null and (work_milestone_id is not null or work_contract_id is not null)),
    'volume', (select coalesce(sum(amount), 0) from public.orders where paid_at is not null and (work_milestone_id is not null or work_contract_id is not null)),
    'commission', (select coalesce(sum(e.fee), 0) from public.escrow_ledger e join public.orders o on o.id = e.order_id where e.status <> 'refunded' and (o.work_milestone_id is not null or o.work_contract_id is not null)),
    'disputes_open', (select count(*) from public.work_disputes where status in ('open', 'under_review')),
    'reports_open', (select count(*) from public.work_reports where status in ('open', 'reviewing'))
  );
end $$;
revoke all on function public.work_admin_stats() from public, anon;
grant execute on function public.work_admin_stats() to authenticated;

create or replace function public.work_admin_analytics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare monthly jsonb; growth jsonb; top_jobs jsonb; cats jsonb; done_n int; cancel_n int; rate numeric;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  select coalesce(jsonb_agg(x order by x->>'month'), '[]'::jsonb) into monthly from (
    select jsonb_build_object('month', to_char(date_trunc('month', o.paid_at), 'YYYY-MM'), 'volume', sum(o.amount), 'commission', sum(coalesce(o.fee_amount, 0)), 'count', count(*)) as x
    from public.orders o
    where o.paid_at >= date_trunc('month', now()) - interval '5 months' and (o.work_milestone_id is not null or o.work_contract_id is not null)
    group by date_trunc('month', o.paid_at)
  ) s;
  select coalesce(jsonb_agg(x order by x->>'month'), '[]'::jsonb) into growth from (
    select jsonb_build_object('month', to_char(date_trunc('month', created_at), 'YYYY-MM'), 'count', count(*)) as x
    from public.profiles where created_at >= date_trunc('month', now()) - interval '5 months'
    group by date_trunc('month', created_at)
  ) s;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into top_jobs from (
    select jsonb_build_object('id', id, 'title', title, 'applications', applications_count) as x
    from public.jobs order by applications_count desc, created_at desc limit 5
  ) s;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into cats from (
    select jsonb_build_object('category', category, 'count', count(*)) as x
    from public.jobs group by category order by count(*) desc limit 8
  ) s;
  select count(*) filter (where status = 'completed'), count(*) filter (where status = 'cancelled') into done_n, cancel_n from public.work_contracts;
  rate := case when done_n + cancel_n = 0 then null else round(done_n::numeric * 100 / (done_n + cancel_n), 1) end;
  return jsonb_build_object('monthly', monthly, 'user_growth', growth, 'top_jobs', top_jobs, 'categories', cats,
                            'completed', done_n, 'cancelled', cancel_n, 'completion_rate', rate);
end $$;
revoke all on function public.work_admin_analytics() from public, anon;
grant execute on function public.work_admin_analytics() to authenticated;

-- Rekonsiliasi: _apply = false hanya melaporkan; true memperbaiki yang aman diperbaiki. Tercatat di audit.
create or replace function public.work_admin_reconcile(_apply boolean default false)
returns table (kind text, ref_id uuid, detail text)
language plpgsql security definer set search_path = public as $$
declare r record; ok boolean;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;

  for r in select m.id as mid, o.id as oid, m.title as mtitle
           from public.contract_milestones m join public.orders o on o.work_milestone_id = m.id
           where m.status = 'awaiting_payment' and o.paid_at is not null loop
    if _apply then
      ok := public._work_fund_milestone(r.mid, r.oid);
      return query select (case when ok then 'diperbaiki' else 'tidak_bisa_diperbaiki' end)::text, r.mid, ('Milestone "' || r.mtitle || '" sudah dibayar tetapi masih menunggu pembayaran')::text;
    else
      return query select 'dibayar_belum_didanai'::text, r.mid, ('Milestone "' || r.mtitle || '" sudah dibayar tetapi masih menunggu pembayaran')::text;
    end if;
  end loop;

  for r in select m.id as mid, m.title as mtitle
           from public.contract_milestones m join public.escrow_ledger e on e.order_id = m.order_id
           where m.status = 'approved' and e.status = 'released' loop
    if _apply then
      update public.contract_milestones set status = 'released', updated_at = now() where id = r.mid;
      return query select 'diperbaiki'::text, r.mid, ('Milestone "' || r.mtitle || '" dana sudah diteruskan, status disamakan')::text;
    else
      return query select 'rilis_belum_tercatat'::text, r.mid, ('Milestone "' || r.mtitle || '" dana sudah diteruskan tetapi status belum released')::text;
    end if;
  end loop;

  for r in select o.id as oid, o.title as otitle from public.orders o
           where (o.work_milestone_id is not null or o.work_contract_id is not null) and o.paid_at is not null
             and not exists (select 1 from public.escrow_ledger e where e.order_id = o.id) loop
    return query select 'escrow_hilang'::text, r.oid, ('Pesanan "' || r.otitle || '" sudah dibayar tetapi tidak punya catatan escrow: periksa manual')::text;
  end loop;

  for r in select p.id as pid, o.title as otitle from public.payments p join public.orders o on o.id = p.order_id
           where p.needs_refund and (o.work_milestone_id is not null or o.work_contract_id is not null) loop
    return query select 'perlu_refund'::text, r.pid, ('Pembayaran untuk "' || r.otitle || '" perlu refund manual di dashboard Midtrans')::text;
  end loop;

  if _apply then perform public._audit('work_reconcile', 'work', null, 'Rekonsiliasi GOBI WORK dijalankan'); end if;
end $$;
revoke all on function public.work_admin_reconcile(boolean) from public, anon;
grant execute on function public.work_admin_reconcile(boolean) to authenticated;

-- Kategori pekerjaan dikelola admin (tabel hanya bisa ditulis lewat fungsi).
create or replace function public.work_admin_set_category(_slug text, _label text, _active boolean, _sort int default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _slug !~ '^[a-z0-9][a-z0-9-]{1,39}$' then raise exception 'Slug 2–40 karakter: huruf kecil, angka, tanda hubung'; end if;
  if length(trim(coalesce(_label, ''))) < 2 or length(_label) > 60 then raise exception 'Nama kategori 2–60 karakter'; end if;
  insert into public.job_categories (slug, label, active, sort_order) values (_slug, trim(_label), coalesce(_active, true), coalesce(_sort, 0))
  on conflict (slug) do update set label = excluded.label, active = excluded.active, sort_order = excluded.sort_order;
  perform public._audit('work_category', 'job_category', _slug, trim(_label) || ' aktif=' || coalesce(_active, true)::text);
end $$;
revoke all on function public.work_admin_set_category(text, text, boolean, int) from public, anon;
grant execute on function public.work_admin_set_category(text, text, boolean, int) to authenticated;

-- Admin boleh membaca seluruh kategori (termasuk yang dinonaktifkan).
drop policy if exists job_categories_admin_read on public.job_categories;
create policy job_categories_admin_read on public.job_categories for select to authenticated using (public._is_admin());

commit;

-- Muat ulang skema API agar tabel, kolom, dan fungsi baru langsung bisa dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname like 'work\_%' order by 1;
--   select tgname from pg_trigger where tgname like 'work\_%' and not tgisinternal order by 1;
