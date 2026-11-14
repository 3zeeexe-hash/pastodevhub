-- GOBI WORK — Saldo client, sengketa yang menggerakkan dana otomatis, dan penutupan kontrak oleh admin.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001–010
-- dan midtrans-escrow/001, 002. Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Yang berubah:
--   1. Saldo client: refund tidak lagi "perlu refund manual di Midtrans", tetapi masuk ke saldo client di platform
--      (client_wallet_entries). Client bisa menarik saldo ke rekeningnya (client_withdrawals), diproses admin seperti pencairan freelancer.
--   2. Sengketa dimenangkan freelancer -> dana LANGSUNG diteruskan ke saldo freelancer (tanpa langkah admin tambahan).
--      Sengketa dimenangkan client      -> dana LANGSUNG masuk saldo client, pesanan dan milestone dibatalkan.
--   3. Admin bisa menutup kontrak: langsung saat memutuskan sengketa (_close_contract = true) atau manual dari sengketa/laporan/kasus
--      (work_admin_close_contract). Penutupan memblokir milestone yang masih berjalan kecuali admin memilih refund dana tertahan ke client.
--   4. work_admin_refund_milestone (SQL 010) ikut memakai saldo client.
--
-- Sudah berlaku dari SQL 010 (tidak diubah di sini): client menyetujui hasil milestone -> dana langsung diteruskan ke saldo freelancer.
-- Pembayaran jam kerja (tagihan per jam) tetap diteruskan admin manual; belum dicakup.

begin;

-- ============ 1. Tabel saldo client ============
-- Satu baris = satu pemasukan ke saldo client (nilai selalu positif). Pengeluaran saldo = penarikan di client_withdrawals.
create table if not exists public.client_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  amount numeric not null check (amount > 0),
  kind text not null default 'refund' check (kind in ('refund', 'adjustment')),
  order_id uuid references public.orders(id) on delete set null,
  dispute_id uuid references public.work_disputes(id) on delete set null,
  contract_id uuid references public.work_contracts(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists client_wallet_entries_client_idx on public.client_wallet_entries (client_id, created_at desc);
-- Satu pesanan hanya boleh dikembalikan satu kali.
create unique index if not exists client_wallet_entries_refund_order_uidx on public.client_wallet_entries (order_id) where kind = 'refund' and order_id is not null;

create table if not exists public.client_withdrawals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  amount numeric not null check (amount >= 10000),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  admin_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_withdrawals_client_idx on public.client_withdrawals (client_id, created_at desc);
create index if not exists client_withdrawals_status_idx on public.client_withdrawals (status, created_at);

alter table public.client_wallet_entries enable row level security;
alter table public.client_withdrawals enable row level security;
revoke insert, update, delete on public.client_wallet_entries, public.client_withdrawals from anon, authenticated;
grant select on public.client_wallet_entries, public.client_withdrawals to authenticated;

drop policy if exists client_wallet_entries_read on public.client_wallet_entries;
create policy client_wallet_entries_read on public.client_wallet_entries for select to authenticated
  using (client_id = auth.uid() or public._is_admin());
drop policy if exists client_withdrawals_read on public.client_withdrawals;
create policy client_withdrawals_read on public.client_withdrawals for select to authenticated
  using (client_id = auth.uid() or public._is_admin());

-- ============ 2. Saldo & penarikan client ============
--   available = total pemasukan - penarikan yang diajukan - penarikan yang sudah dibayar (penarikan ditolak otomatis kembali ke saldo)
create or replace function public.client_wallet()
returns table (available numeric, requested numeric, paid_out numeric, total_in numeric)
language sql stable security definer set search_path = public as $$
  with i as (
    select coalesce(sum(amount), 0) as t from public.client_wallet_entries where client_id = auth.uid()
  ), w as (
    select coalesce(sum(amount) filter (where status = 'requested'), 0) as r,
           coalesce(sum(amount) filter (where status = 'paid'), 0) as p
    from public.client_withdrawals where client_id = auth.uid()
  )
  select greatest(i.t - w.r - w.p, 0), w.r, w.p, i.t from i, w where auth.uid() is not null
$$;
revoke all on function public.client_wallet() from public, anon;
grant execute on function public.client_wallet() to authenticated;

create or replace function public.request_client_withdrawal(_amount numeric, _bank_name text, _account_number text, _account_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare avail numeric; wid uuid;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if public.is_banned(_user => auth.uid()) then raise exception 'Akun diblokir'; end if;
  perform pg_advisory_xact_lock(hashtext('client_wallet:' || auth.uid()::text));
  if _amount is null or _amount < 10000 then raise exception 'Penarikan minimal Rp10.000'; end if;
  if length(trim(coalesce(_bank_name, ''))) < 2 or length(trim(coalesce(_account_number, ''))) < 4 or length(trim(coalesce(_account_name, ''))) < 2 then
    raise exception 'Lengkapi data rekening';
  end if;
  select w.available into avail from public.client_wallet() w;
  if coalesce(avail, 0) < _amount then raise exception 'Jumlah melebihi saldo tersedia'; end if;
  insert into public.client_withdrawals (client_id, amount, bank_name, account_number, account_name)
  values (auth.uid(), _amount, trim(_bank_name), trim(_account_number), trim(_account_name))
  returning id into wid;
  return wid;
end $$;
revoke all on function public.request_client_withdrawal(numeric, text, text, text) from public, anon;
grant execute on function public.request_client_withdrawal(numeric, text, text, text) to authenticated;

-- Admin: tandai penarikan client sudah ditransfer ('paid') atau tolak ('rejected', saldo kembali otomatis).
create or replace function public.admin_process_client_withdrawal(_id uuid, _action text, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare w record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _action not in ('paid', 'rejected') then raise exception 'Aksi tidak dikenal'; end if;
  if _action = 'rejected' and length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan penolakan (minimal 3 karakter)'; end if;
  select * into w from public.client_withdrawals where id = _id for update;
  if not found then raise exception 'Penarikan tidak ditemukan'; end if;
  if w.status <> 'requested' then raise exception 'Penarikan ini sudah diproses (%)', w.status; end if;
  update public.client_withdrawals
    set status = _action, admin_note = nullif(left(coalesce(_note, ''), 500), ''), processed_by = auth.uid(), processed_at = now(), updated_at = now()
    where id = _id;
  perform public._audit('client_withdrawal_' || _action, 'client_withdrawal', _id::text, _note);
  perform public._work_notify(w.client_id, 'payout_processing',
    case when _action = 'paid' then 'Penarikan saldo kamu sudah ditransfer ke rekening' else 'Penarikan saldo ditolak, dana kembali ke saldo kamu' end,
    '/kerja/pembayaran');
end $$;
revoke all on function public.admin_process_client_withdrawal(uuid, text, text) from public, anon;
grant execute on function public.admin_process_client_withdrawal(uuid, text, text) to authenticated;

-- ============ 3. Pembantu: pindahkan dana escrow ============
-- Refund ke saldo client: escrow 'refunded', saldo client bertambah sebesar nilai yang dibayar (gross), pesanan dibatalkan.
-- Mengembalikan jumlah yang dipindahkan (0 bila tidak ada dana yang bisa dikembalikan). Tidak menandai "perlu refund" di Midtrans.
create or replace function public._work_refund_to_client_wallet(_order_id uuid, _dispute_id uuid, _contract_id uuid, _note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare l record; o record;
begin
  select * into l from public.escrow_ledger where order_id = _order_id for update;
  if not found or l.status not in ('held', 'frozen') then return 0; end if;
  select * into o from public.orders where id = _order_id;
  update public.escrow_ledger
    set status = 'refunded', note = left('Dikembalikan ke saldo client: ' || coalesce(_note, ''), 500), updated_at = now()
    where order_id = _order_id;
  insert into public.client_wallet_entries (client_id, amount, kind, order_id, dispute_id, contract_id, note)
  values (o.buyer_id, l.gross, 'refund', _order_id, _dispute_id, _contract_id, nullif(left(coalesce(_note, ''), 500), ''));
  perform set_config('gobi.work_internal', '1', true);
  update public.orders set status = 'cancelled', updated_at = now() where id = _order_id and status not in ('cancelled', 'declined');
  perform set_config('gobi.work_internal', '', true);
  perform public._work_notify(o.buyer_id, 'payment_received', 'Dana milestone dikembalikan ke saldo kamu. Kamu bisa menariknya di Pembayaran.', '/kerja/pembayaran');
  return l.gross;
end $$;
revoke all on function public._work_refund_to_client_wallet(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ============ 4. Pembantu: tutup kontrak ============
-- Aturan:
--   * Milestone 'approved' (sudah disetujui client) tidak boleh ditutup: dananya hak freelancer, teruskan dulu.
--   * Milestone berdana yang masih berjalan (funded/in_progress/submitted/revision_requested/disputed) hanya boleh ditutup bila
--     _refund_funded = true; dananya dikembalikan ke saldo client.
--   * Milestone yang belum dibayar dan tagihan yang belum dibayar dibatalkan. Sengketa terbuka diselesaikan.
--   * Status kontrak: 'completed' bila sudah ada milestone yang diteruskan, selain itu 'cancelled' (ditampilkan "Ditutup").
create or replace function public._work_close_contract(_contract_id uuid, _note text, _refund_funded boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c record; r record; n_live int; n_approved int; refunded numeric := 0; got numeric; any_released boolean;
begin
  select * into c from public.work_contracts where id = _contract_id for update;
  if not found then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status in ('completed', 'cancelled') then raise exception 'Kontrak sudah selesai atau ditutup'; end if;

  select count(*) into n_approved from public.contract_milestones where contract_id = _contract_id and status = 'approved';
  if n_approved > 0 then
    raise exception 'Ada % milestone yang sudah disetujui client tetapi dananya belum diteruskan. Teruskan dulu ke freelancer sebelum menutup kontrak.', n_approved;
  end if;
  select count(*) into n_live from public.contract_milestones
    where contract_id = _contract_id and status in ('funded', 'in_progress', 'submitted', 'revision_requested', 'disputed');
  if n_live > 0 and not coalesce(_refund_funded, false) then
    raise exception 'Masih ada % milestone berdana yang belum selesai. Selesaikan dulu (teruskan atau refund), atau pilih "Kembalikan dana tertahan ke client".', n_live;
  end if;

  for r in select id, order_id from public.contract_milestones
           where contract_id = _contract_id and status in ('funded', 'in_progress', 'submitted', 'revision_requested', 'disputed') loop
    if r.order_id is not null then
      got := public._work_refund_to_client_wallet(r.order_id, null, _contract_id, 'Kontrak ditutup admin: ' || _note);
      refunded := refunded + got;
    end if;
    update public.contract_milestones set status = 'cancelled', updated_at = now() where id = r.id;
  end loop;

  -- Milestone belum dibayar dan semua tagihan yang belum dibayar.
  perform set_config('gobi.work_internal', '1', true);
  update public.orders set status = 'cancelled', updated_at = now() where work_contract_id = _contract_id and status = 'awaiting_payment';
  perform set_config('gobi.work_internal', '', true);
  update public.contract_milestones set status = 'cancelled', updated_at = now() where contract_id = _contract_id and status in ('pending', 'awaiting_payment');

  update public.work_disputes
    set status = 'resolved', decision = case when refunded > 0 then 'favor_client' else 'dismissed' end,
        decision_note = left('Kontrak ditutup admin: ' || _note, 4000), decided_by = auth.uid(), decided_at = now()
    where contract_id = _contract_id and status in ('open', 'under_review');

  select exists (select 1 from public.contract_milestones where contract_id = _contract_id and status = 'released') into any_released;
  update public.work_contracts set status = case when any_released then 'completed' else 'cancelled' end, updated_at = now() where id = _contract_id;

  perform public._work_event(_contract_id, 'admin_contract_closed', jsonb_build_object('refunded', refunded, 'note', left(_note, 500)));
  perform public._work_notify(c.client_id, 'dispute_update',
    case when refunded > 0 then 'Admin menutup kontrak dan mengembalikan dana ke saldo kamu' else 'Admin menutup kontrak' end, '/kerja/kontrak/' || _contract_id);
  perform public._work_notify(c.freelancer_id, 'dispute_update', 'Admin menutup kontrak', '/kerja/kontrak/' || _contract_id);
end $$;
revoke all on function public._work_close_contract(uuid, text, boolean) from public, anon, authenticated;

-- Aksi admin manual: dari sengketa, laporan, atau kasus. _report_id (opsional) ikut ditandai selesai.
create or replace function public.work_admin_close_contract(_contract_id uuid, _note text, _refund_funded boolean default false, _report_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Isi alasan penutupan (minimal 5 karakter)'; end if;
  perform public._work_close_contract(_contract_id, trim(_note), coalesce(_refund_funded, false));
  perform public._audit('work_admin_close_contract', 'work_contract', _contract_id::text, _note);
  if _report_id is not null then
    perform public.work_admin_set_report(_report_id => _report_id, _status => 'resolved', _note => left('Kontrak ditutup admin: ' || trim(_note), 500));
  end if;
end $$;
revoke all on function public.work_admin_close_contract(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.work_admin_close_contract(uuid, text, boolean, uuid) to authenticated;

-- ============ 5. Keputusan sengketa: dana bergerak otomatis ============
--   favor_freelancer -> milestone disetujui, pesanan selesai, escrow LANGSUNG 'released' ke saldo freelancer
--   favor_client     -> milestone dibatalkan, escrow 'refunded' dan saldo client bertambah, pesanan dibatalkan
--   split            -> escrow tetap dibekukan; admin membagi dana manual (belum otomatis)
--   dismissed        -> escrow kembali 'held', pekerjaan berlanjut
--   _close_contract  -> (opsional) kontrak langsung ditutup setelah keputusan; gagal dengan pesan jelas bila masih ada milestone berjalan
-- Fungsi lama (3 argumen) dihapus agar pemanggilan tidak ambigu; aplikasi selalu memakai parameter bernama.
drop function if exists public.work_admin_decide_dispute(uuid, text, text);
create or replace function public.work_admin_decide_dispute(_dispute_id uuid, _decision text, _note text, _close_contract boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare d record; c record; oid uuid; moved numeric := 0;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _decision not in ('favor_client', 'favor_freelancer', 'split', 'dismissed') then raise exception 'Keputusan tidak dikenal'; end if;
  if length(trim(coalesce(_note, ''))) < 10 then raise exception 'Catatan keputusan minimal 10 karakter'; end if;
  select * into d from public.work_disputes where id = _dispute_id for update;
  if not found then raise exception 'Sengketa tidak ditemukan'; end if;
  if d.status = 'resolved' then raise exception 'Sengketa sudah diputuskan'; end if;
  select * into c from public.work_contracts where id = d.contract_id for update;

  update public.work_disputes set status = 'resolved', decision = _decision, decision_note = left(_note, 4000), decided_by = auth.uid(), decided_at = now() where id = _dispute_id;

  if d.milestone_id is not null then
    update public.contract_milestones
      set status = case _decision when 'favor_client' then 'cancelled' when 'favor_freelancer' then 'approved' else coalesce(d.prev_milestone_status, 'funded') end,
          updated_at = now()
      where id = d.milestone_id and status = 'disputed';
    select order_id into oid from public.contract_milestones where id = d.milestone_id;
    if oid is not null then
      if _decision = 'favor_client' then
        moved := public._work_refund_to_client_wallet(oid, _dispute_id, d.contract_id, 'Sengketa dimenangkan client: ' || _note);
      elsif _decision = 'favor_freelancer' then
        perform set_config('gobi.work_internal', '1', true);
        update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = oid and status in ('in_progress', 'delivered');
        perform set_config('gobi.work_internal', '', true);
        -- Trigger _work_on_escrow_released mengubah milestone 'approved' menjadi 'released' dan memberi tahu freelancer.
        update public.escrow_ledger
          set status = 'released', released_at = now(), released_by = auth.uid(), note = left('Sengketa dimenangkan freelancer: ' || _note, 500), updated_at = now()
          where order_id = oid and status in ('held', 'frozen');
        get diagnostics moved = row_count;
      elsif _decision = 'dismissed' then
        update public.escrow_ledger set status = 'held', note = null, updated_at = now() where order_id = oid and status = 'frozen';
      else
        update public.escrow_ledger set note = 'Sengketa: dibagi, diselesaikan manual oleh admin', updated_at = now() where order_id = oid and status = 'frozen';
      end if;
    end if;
  end if;

  perform public._audit('work_dispute_' || _decision, 'work_dispute', _dispute_id::text, _note);
  perform public._work_event(d.contract_id, 'dispute_resolved', jsonb_build_object('dispute', _dispute_id, 'decision', _decision, 'closed', coalesce(_close_contract, false)));
  perform public._work_refresh_contract(d.contract_id);
  if coalesce(_close_contract, false) then
    perform public._work_close_contract(d.contract_id, 'Ditutup bersama keputusan sengketa: ' || _note, false);
  end if;
  perform public._work_notify(c.client_id, 'dispute_update',
    case _decision when 'favor_client' then 'Sengketa dimenangkan: dana dikembalikan ke saldo kamu' else 'Sengketa diputuskan admin' end, '/kerja/kontrak/' || d.contract_id);
  perform public._work_notify(c.freelancer_id, 'dispute_update',
    case _decision when 'favor_freelancer' then 'Sengketa dimenangkan: dana diteruskan ke saldo kamu' else 'Sengketa diputuskan admin' end, '/kerja/kontrak/' || d.contract_id);
end $$;
revoke all on function public.work_admin_decide_dispute(uuid, text, text, boolean) from public, anon;
grant execute on function public.work_admin_decide_dispute(uuid, text, text, boolean) to authenticated;

-- ============ 6. Refund admin per milestone (dari SQL 010) memakai saldo client ============
-- Sama dengan versi 010; bedanya dana masuk saldo client (bukan ditandai "perlu refund" di Midtrans).
create or replace function public.work_admin_refund_milestone(_milestone_id uuid, _note text, _close boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; l record; r record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Isi alasan refund (minimal 5 karakter)'; end if;
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id for update;
  if m.order_id is null then raise exception 'Milestone ini belum dibayar client, tidak ada dana untuk direfund'; end if;
  if m.status not in ('funded', 'in_progress', 'submitted', 'revision_requested', 'approved', 'disputed') then
    raise exception 'Milestone berstatus % tidak bisa direfund', m.status;
  end if;
  select * into l from public.escrow_ledger where order_id = m.order_id for update;
  if not found or l.status not in ('held', 'frozen') then raise exception 'Dana milestone ini sudah diteruskan atau direfund'; end if;

  update public.work_disputes
    set status = 'resolved', decision = 'favor_client', decision_note = left('Refund oleh admin: ' || _note, 4000), decided_by = auth.uid(), decided_at = now()
    where milestone_id = _milestone_id and status in ('open', 'under_review');

  perform public._work_refund_to_client_wallet(m.order_id, null, c.id, 'Refund admin: ' || _note);
  update public.contract_milestones set status = 'cancelled', updated_at = now() where id = _milestone_id;

  if coalesce(_close, true) then
    for r in select id, order_id from public.contract_milestones
             where contract_id = c.id and id <> _milestone_id and status in ('pending', 'awaiting_payment') loop
      if r.order_id is not null then
        perform set_config('gobi.work_internal', '1', true);
        update public.orders set status = 'cancelled', updated_at = now() where id = r.order_id and status = 'awaiting_payment';
        perform set_config('gobi.work_internal', '', true);
      end if;
      update public.contract_milestones set status = 'cancelled', updated_at = now() where id = r.id;
    end loop;
  end if;

  perform public._audit('work_admin_refund_milestone', 'work_milestone', _milestone_id::text, _note);
  perform public._work_event(c.id, 'admin_milestone_refunded', jsonb_build_object('milestone', _milestone_id, 'order', m.order_id, 'closed', coalesce(_close, true)));
  perform public._work_notify(c.freelancer_id, 'dispute_update', 'Admin mengembalikan dana milestone ke client dan menutup milestone ini', '/kerja/kontrak/' || c.id);
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_admin_refund_milestone(uuid, text, boolean) from public, anon;
grant execute on function public.work_admin_refund_milestone(uuid, text, boolean) to authenticated;

commit;

-- Muat ulang skema API agar tabel dan fungsi baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select proname from pg_proc where proname in ('client_wallet','request_client_withdrawal','admin_process_client_withdrawal','work_admin_close_contract','_work_close_contract','_work_refund_to_client_wallet');
--   -- uji sengketa: buka sengketa pada milestone berdana, putuskan "favor_client", lalu pastikan:
--   --   select * from client_wallet_entries order by created_at desc limit 1;   (saldo client bertambah sebesar nilai yang dibayar)
--   --   select status from escrow_ledger where order_id = '<order>';            ('refunded')
--   -- uji "favor_freelancer": escrow_ledger.status = 'released' dan contract_milestones.status = 'released' tanpa langkah admin lain.
