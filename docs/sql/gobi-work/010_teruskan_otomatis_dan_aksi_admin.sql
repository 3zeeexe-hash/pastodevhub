-- GOBI WORK — Dana diteruskan otomatis saat client menyetujui milestone, plus aksi admin: teruskan manual (selesai) dan refund ke client (ditutup).
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001–009
-- dan midtrans-escrow/001, 002. Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Berlaku untuk SEMUA lowongan: kerja langsung dan per jam terjadwal sama-sama memakai milestone, jadi satu aturan cukup.
--
-- Alur baru:
--   1. Client menyetujui hasil milestone (work_approve_milestone) -> pesanan selesai, dana escrow LANGSUNG 'released' ke saldo freelancer,
--      milestone menjadi 'released', dan kontrak 'completed' bila semua milestone selesai. Dana yang 'frozen' (sengketa/Midtrans refund) tidak ikut.
--   2. Admin bisa meneruskan manual (work_admin_finish_milestone): untuk dana yang masih ditahan atau dibekukan, mis. client tidak merespons
--      atau sengketa yang diselesaikan admin. Hasil: dana diteruskan ke freelancer, milestone released, kontrak selesai bila semuanya beres.
--   3. Admin bisa refund ke client (work_admin_refund_milestone): escrow 'refunded', pembayaran ditandai perlu refund (uang dikembalikan
--      lewat dashboard Midtrans), pesanan dibatalkan, milestone dibatalkan, dan (bawaan) kontrak ditutup (status 'cancelled', ditampilkan "Ditutup").
--
-- Pencatatan: audit log (work_admin_finish_milestone / work_admin_refund_milestone), riwayat kontrak, dan notifikasi ke kedua pihak.

begin;

-- ============ 1. Pembantu: teruskan dana escrow satu pesanan ============
-- Hanya dari status 'held' (jalur otomatis). Mengembalikan true bila ada baris yang diteruskan.
create or replace function public._work_release_order_escrow(_order_id uuid, _note text, _by uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.escrow_ledger
    set status = 'released', released_at = now(), released_by = _by, note = nullif(left(coalesce(_note, ''), 500), ''), updated_at = now()
    where order_id = _order_id and status = 'held';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public._work_release_order_escrow(uuid, text, uuid) from public, anon, authenticated;

-- Notifikasi pada saat dana diteruskan: bedakan otomatis (released_by kosong) dan oleh admin. Selebihnya sama dengan versi 002.
create or replace function public._work_on_escrow_released()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record; fid uuid;
begin
  select * into m from public.contract_milestones where order_id = new.order_id and status = 'approved' for update;
  if found then
    update public.contract_milestones set status = 'released', updated_at = now() where id = m.id;
    perform public._work_event(m.contract_id, 'milestone_released', jsonb_build_object('milestone', m.id, 'order', new.order_id, 'by_admin', new.released_by is not null));
    select freelancer_id into fid from public.work_contracts where id = m.contract_id;
    perform public._work_notify(fid, 'payout_processing',
      case when new.released_by is null then 'Hasil disetujui: dana milestone otomatis diteruskan ke saldomu' else 'Admin meneruskan dana milestone ke saldomu' end,
      '/kerja/pembayaran');
  end if;
  return null;
end $$;
revoke all on function public._work_on_escrow_released() from public, anon, authenticated;

-- ============ 2. Client menyetujui hasil -> dana langsung diteruskan ============
-- Sama dengan versi 002; tambahan: setelah pesanan 'completed', escrow yang masih 'held' langsung 'released'.
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
    -- Trigger _work_on_escrow_released mengubah milestone menjadi 'released' dan memberi tahu freelancer.
    perform public._work_release_order_escrow(m.order_id, 'Otomatis: client menyetujui hasil milestone', null);
  end if;
  perform public._work_event(c.id, 'milestone_approved', jsonb_build_object('milestone', _milestone_id));
  perform public._work_notify(c.freelancer_id, 'work_approved', 'Client menyetujui hasil pekerjaan', '/kerja/kontrak/' || c.id);
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_approve_milestone(uuid) from public, anon;
grant execute on function public.work_approve_milestone(uuid) to authenticated;

-- ============ 3. Admin: teruskan manual dan selesaikan ============
-- Untuk dana 'held' atau 'frozen' pada milestone yang sudah didanai. Sengketa terbuka pada milestone itu diputuskan untuk freelancer.
create or replace function public.work_admin_finish_milestone(_milestone_id uuid, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare m record; c record; l record;
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 5 then raise exception 'Isi catatan (minimal 5 karakter)'; end if;
  select * into m from public.contract_milestones where id = _milestone_id for update;
  if not found then raise exception 'Milestone tidak ditemukan'; end if;
  select * into c from public.work_contracts where id = m.contract_id for update;
  if m.order_id is null then raise exception 'Milestone ini belum punya pembayaran yang bisa diteruskan'; end if;
  if m.status not in ('funded', 'in_progress', 'submitted', 'revision_requested', 'approved', 'disputed') then
    raise exception 'Milestone berstatus % tidak bisa diselesaikan admin', m.status;
  end if;
  select * into l from public.escrow_ledger where order_id = m.order_id for update;
  if not found or l.status not in ('held', 'frozen') then raise exception 'Dana milestone ini sudah diteruskan atau direfund'; end if;

  update public.work_disputes
    set status = 'resolved', decision = 'favor_freelancer', decision_note = left('Diselesaikan admin: ' || _note, 4000), decided_by = auth.uid(), decided_at = now()
    where milestone_id = _milestone_id and status in ('open', 'under_review');

  perform set_config('gobi.work_internal', '1', true);
  update public.orders set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = m.order_id and status in ('in_progress', 'delivered');
  perform set_config('gobi.work_internal', '', true);

  update public.contract_milestones set status = 'approved', updated_at = now() where id = _milestone_id;
  -- Trigger _work_on_escrow_released mengubah milestone menjadi 'released' dan memberi tahu freelancer.
  update public.escrow_ledger
    set status = 'released', released_at = now(), released_by = auth.uid(), note = left('Admin: ' || _note, 500), updated_at = now()
    where order_id = m.order_id;

  perform public._audit('work_admin_finish_milestone', 'work_milestone', _milestone_id::text, _note);
  perform public._work_event(c.id, 'admin_milestone_finished', jsonb_build_object('milestone', _milestone_id, 'order', m.order_id));
  perform public._work_notify(c.client_id, 'work_approved', 'Admin menyelesaikan milestone dan meneruskan dana ke freelancer', '/kerja/kontrak/' || c.id);
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_admin_finish_milestone(uuid, text) from public, anon;
grant execute on function public.work_admin_finish_milestone(uuid, text) to authenticated;

-- ============ 4. Admin: refund ke client dan tutup ============
-- Dana 'held'/'frozen' -> 'refunded', pembayaran ditandai perlu refund (uang dikembalikan manual lewat dashboard Midtrans, lalu tandai
-- "Sudah ditangani" di Escrow & saldo), pesanan dan milestone dibatalkan. _close = true (bawaan): milestone lain yang belum dibayar ikut
-- dibatalkan dan kontrak ditutup. _close = false: hanya milestone ini; kontrak ditutup otomatis bila tidak ada milestone yang tersisa.
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

  update public.escrow_ledger set status = 'refunded', note = left('Refund ke client: ' || _note, 500), updated_at = now() where order_id = m.order_id;
  update public.payments set needs_refund = true, updated_at = now() where order_id = m.order_id and status = 'paid';
  perform set_config('gobi.work_internal', '1', true);
  update public.orders set status = 'cancelled', updated_at = now() where id = m.order_id and status not in ('cancelled', 'declined');
  perform set_config('gobi.work_internal', '', true);
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
  perform public._work_notify(c.client_id, 'dispute_update', 'Admin merefund dana milestone ke kamu. Pengembalian uang diproses lewat Midtrans.', '/kerja/kontrak/' || c.id);
  perform public._work_notify(c.freelancer_id, 'dispute_update', 'Admin merefund dana milestone ke client dan menutup milestone ini', '/kerja/kontrak/' || c.id);
  -- Menutup kontrak: tidak ada milestone yang masih hidup -> status 'cancelled' (ditampilkan "Ditutup" di admin).
  perform public._work_refresh_contract(c.id);
end $$;
revoke all on function public.work_admin_refund_milestone(uuid, text, boolean) from public, anon;
grant execute on function public.work_admin_refund_milestone(uuid, text, boolean) to authenticated;

commit;

-- Muat ulang skema API agar fungsi baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select proname from pg_proc where proname in ('work_admin_finish_milestone','work_admin_refund_milestone','_work_release_order_escrow');
--   -- uji: setujui satu milestone di kontrak percobaan, lalu pastikan escrow_ledger.status = 'released' dan contract_milestones.status = 'released'.
