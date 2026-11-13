-- GOBI WORK — Fase 6 (lanjutan): pengaturan komisi yang bisa diubah admin.
-- Jalankan MANUAL di SQL editor database SETELAH 001, 002, 003 (lihat AGENTS.md: skema tidak lewat supabase/migrations). Aman dijalankan ulang.
--
-- Prinsip:
--   * Komisi di sini HANYA berlaku untuk pesanan GOBI WORK (orders.work_milestone_id / work_contract_id terisi).
--     Fungsi lama platform_fee() dan pesanan jasa/karya biasa TIDAK diubah.
--   * Selama belum ada nilai tersimpan, komisi bawaan platform_fee() tetap dipakai (tidak ada perubahan perilaku).
--   * Perubahan hanya berlaku untuk escrow BARU; catatan escrow yang sudah ada tidak dihitung ulang.
--   * Nilai 0–30 persen, wajib alasan, tercatat di admin_audit_log.

begin;

create table if not exists public.work_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.work_settings enable row level security;
revoke insert, update, delete on public.work_settings from anon, authenticated;
grant select on public.work_settings to authenticated;
grant all on public.work_settings to service_role;
drop policy if exists work_settings_admin_read on public.work_settings;
create policy work_settings_admin_read on public.work_settings for select to authenticated using (public._is_admin());

create or replace function public.work_admin_set_commission(_percent numeric, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if _percent is null or _percent < 0 or _percent > 30 then raise exception 'Komisi harus antara 0 dan 30 persen'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan perubahan komisi'; end if;
  insert into public.work_settings (key, value, updated_by, updated_at)
  values ('commission_percent', to_jsonb(round(_percent, 2)), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform public._audit('work_commission_set', 'work_setting', 'commission_percent', round(_percent, 2)::text || '% — ' || left(_note, 500));
end $$;
revoke all on function public.work_admin_set_commission(numeric, text) from public, anon;
grant execute on function public.work_admin_set_commission(numeric, text) to authenticated;

-- Kembali ke komisi bawaan platform_fee().
create or replace function public.work_admin_clear_commission(_note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  if length(trim(coalesce(_note, ''))) < 3 then raise exception 'Isi alasan'; end if;
  delete from public.work_settings where key = 'commission_percent';
  perform public._audit('work_commission_clear', 'work_setting', 'commission_percent', left(_note, 500));
end $$;
revoke all on function public.work_admin_clear_commission(text) from public, anon;
grant execute on function public.work_admin_clear_commission(text) to authenticated;

-- Menimpa fee/net pada escrow baru milik pesanan GOBI WORK. Berjalan sebelum baris escrow disimpan
-- (midtrans_apply_notification sudah menghitung fee dari platform_fee(); di sini hanya dikoreksi bila ada nilai tersimpan).
create or replace function public._work_escrow_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare pct numeric; is_work boolean; f numeric;
begin
  select (value #>> '{}')::numeric into pct from public.work_settings where key = 'commission_percent';
  if pct is null then return new; end if;
  select (work_milestone_id is not null or work_contract_id is not null) into is_work from public.orders where id = new.order_id;
  if not coalesce(is_work, false) then return new; end if;
  f := round(new.gross * pct / 100);
  new.fee := f;
  new.net := new.gross - f;
  update public.orders set fee_amount = f where id = new.order_id;
  return new;
end $$;
revoke all on function public._work_escrow_commission() from public, anon, authenticated;
drop trigger if exists work_escrow_commission_trg on public.escrow_ledger;
create trigger work_escrow_commission_trg before insert on public.escrow_ledger
  for each row execute function public._work_escrow_commission();

commit;

notify pgrst, 'reload schema';

-- Cek cepat:
--   select * from public.work_settings;
--   select tgname from pg_trigger where tgname = 'work_escrow_commission_trg';
-- Uji di sandbox: set komisi 7%, bayar satu milestone, lalu periksa
--   select gross, fee, net from public.escrow_ledger order by created_at desc limit 1;   -- fee = 7% dari gross
