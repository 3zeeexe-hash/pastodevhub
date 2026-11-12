-- Midtrans Core API + escrow saldo + pantauan admin (dari docs/sql/midtrans-escrow/001_midtrans_escrow.sql)
alter table public.platform_secrets
  add column if not exists midtrans_enabled boolean not null default false,
  add column if not exists midtrans_mode text not null default 'sandbox',
  add column if not exists midtrans_sandbox_server_key_ciphertext text,
  add column if not exists midtrans_sandbox_client_key text,
  add column if not exists midtrans_production_server_key_ciphertext text,
  add column if not exists midtrans_production_client_key text,
  add column if not exists midtrans_methods text[] not null default array['bca','bni','bri','permata','qris'];

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'platform_secrets_midtrans_mode_check') then
    alter table public.platform_secrets
      add constraint platform_secrets_midtrans_mode_check check (midtrans_mode in ('sandbox','production'));
  end if;
end $$;

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role), false)
$$;
revoke all on function public._is_admin() from public;
grant execute on function public._is_admin() to anon, authenticated;

create or replace function public._require_server_proof()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.server_proof_ok(), false) then
    raise exception 'Akses ditolak';
  end if;
end $$;
revoke all on function public._require_server_proof() from public, anon, authenticated;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  midtrans_order_id text not null unique,
  method text not null,
  payment_type text,
  gross_amount numeric not null,
  status text not null default 'pending'
    check (status in ('pending','paid','expired','cancelled','denied','failed','superseded')),
  mode text not null default 'sandbox',
  va_number text,
  bank text,
  qr_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  needs_refund boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments (order_id, created_at desc);

create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  midtrans_order_id text,
  transaction_status text,
  result text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.escrow_ledger (
  order_id uuid primary key references public.orders(id) on delete cascade,
  developer_id uuid not null references public.profiles(id),
  kind text not null,
  gross numeric not null,
  fee numeric not null default 0,
  net numeric not null,
  status text not null default 'held' check (status in ('held','released','frozen','refunded')),
  held_until timestamptz not null,
  released_at timestamptz,
  released_by uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists escrow_ledger_dev_idx on public.escrow_ledger (developer_id, status);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  admin_label text,
  action text not null,
  target_type text,
  target_id text,
  note text,
  created_at timestamptz not null default now()
);

grant select on public.payments, public.payment_events, public.escrow_ledger, public.admin_audit_log to authenticated;
grant all on public.payments, public.payment_events, public.escrow_ledger, public.admin_audit_log to service_role;

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.escrow_ledger enable row level security;
alter table public.admin_audit_log enable row level security;

revoke insert, update, delete on public.payments, public.payment_events, public.escrow_ledger, public.admin_audit_log from anon, authenticated;
revoke select on public.payments, public.payment_events, public.escrow_ledger, public.admin_audit_log from anon;

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public._is_admin() or public.can_access_order(_order_id => order_id));

drop policy if exists payment_events_admin_read on public.payment_events;
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using (public._is_admin());

drop policy if exists escrow_read on public.escrow_ledger;
create policy escrow_read on public.escrow_ledger for select to authenticated
  using (developer_id = auth.uid() or public._is_admin());

drop policy if exists audit_admin_read on public.admin_audit_log;
create policy audit_admin_read on public.admin_audit_log for select to authenticated
  using (public._is_admin());

do $$
declare t text;
begin
  foreach t in array array['orders','order_messages','job_applications','job_messages','jobs','services','products','payouts']
  loop
    execute format('drop policy if exists admin_read_%1$s on public.%1$I', t);
    execute format('create policy admin_read_%1$s on public.%1$I for select to authenticated using (public._is_admin())', t);
  end loop;
end $$;

create or replace function public._audit(_action text, _target_type text, _target_id text, _note text)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit_log (admin_id, admin_label, action, target_type, target_id, note)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), _action, _target_type, _target_id, nullif(_note, ''));
$$;
revoke all on function public._audit(text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_log_event(_action text, _target_type text, _target_id text, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  perform public._audit(_action, _target_type, _target_id, _note);
end $$;
revoke all on function public.admin_log_event(text, text, text, text) from public, anon;
grant execute on function public.admin_log_event(text, text, text, text) to authenticated;

create or replace function public.midtrans_record_charge(
  _order_id uuid, _buyer_id uuid, _midtrans_order_id text, _method text, _amount numeric,
  _mode text, _va text, _bank text, _qr text, _expires timestamptz, _raw jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record;
  sup text[];
  pid uuid;
begin
  perform public._require_server_proof();
  select * into o from public.orders where id = _order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.buyer_id <> _buyer_id then raise exception 'Bukan pesanan kamu'; end if;
  if o.status <> 'awaiting_payment' then raise exception 'Pesanan tidak sedang menunggu pembayaran'; end if;
  if o.amount <> _amount then raise exception 'Nominal tidak cocok dengan pesanan'; end if;

  select coalesce(array_agg(midtrans_order_id), '{}') into sup
    from public.payments where order_id = _order_id and status = 'pending';
  update public.payments set status = 'superseded', updated_at = now()
    where order_id = _order_id and status = 'pending';

  insert into public.payments (order_id, midtrans_order_id, method, gross_amount, mode, va_number, bank, qr_url, expires_at, raw)
  values (_order_id, _midtrans_order_id, _method, _amount, coalesce(_mode, 'sandbox'), _va, _bank, _qr, _expires, _raw)
  returning id into pid;

  return jsonb_build_object('id', pid, 'superseded', to_jsonb(sup));
end $$;
revoke all on function public.midtrans_record_charge(uuid, uuid, text, text, numeric, text, text, text, text, timestamptz, jsonb) from public;
grant execute on function public.midtrans_record_charge(uuid, uuid, text, text, numeric, text, text, text, text, timestamptz, jsonb) to anon, authenticated;

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
        values (o.id, o.seller_id, o.kind, o.amount, fee, o.amount - fee, 'held', now() + interval '1 day')
        on conflict (order_id) do nothing;

        insert into public.order_messages (order_id, sender_id, body, is_system)
        values (o.id, o.buyer_id,
          'Pembayaran Midtrans diterima. Dana ditahan admin (escrow) minimal 1 hari dan diteruskan ke developer setelah pekerjaan selesai.',
          true);
        res := 'paid';
      else
        update public.payments set needs_refund = true where id = p.id;
        res := 'paid_order_not_waiting';
      end if;
    end if;
  else
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
  if now() < l.held_until then
    raise exception 'Masa tahan 1 hari belum selesai (sampai %)', to_char(l.held_until at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
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
    update public.escrow_ledger set status = 'refunded', note = _note, updated_at = now() where order_id = _order_id;
  end if;
  perform public._audit('escrow_' || _action, 'order', _order_id::text, _note);
end $$;
revoke all on function public.admin_set_escrow(uuid, text, text) from public, anon;
grant execute on function public.admin_set_escrow(uuid, text, text) to authenticated;

create or replace function public.admin_clear_refund_flag(_payment_id uuid, _note text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'Khusus admin'; end if;
  update public.payments set needs_refund = false, updated_at = now() where id = _payment_id;
  perform public._audit('refund_handled', 'payment', _payment_id::text, _note);
end $$;
revoke all on function public.admin_clear_refund_flag(uuid, text) from public, anon;
grant execute on function public.admin_clear_refund_flag(uuid, text) to authenticated;

create or replace function public.developer_wallet(_user_id uuid)
returns table (on_hold numeric, awaiting_admin numeric, available numeric, frozen numeric, requested numeric, paid_out numeric)
language sql stable security definer set search_path = public as $$
  with l as (
    select e.net, e.status, e.kind, e.held_until, o.status as ostatus
    from public.escrow_ledger e join public.orders o on o.id = e.order_id
    where e.developer_id = _user_id
  ), a as (
    select
      coalesce(sum(net) filter (where status = 'held' and (now() < held_until or (kind = 'service' and ostatus <> 'completed'))), 0) as c_hold,
      coalesce(sum(net) filter (where status = 'held' and kind = 'service' and ostatus = 'completed' and now() >= held_until), 0) as c_wait,
      coalesce(sum(net) filter (where status = 'released' or (status = 'held' and kind <> 'service' and now() >= held_until)), 0) as c_ok,
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

create or replace function public.request_wallet_payout(_amount numeric, _bank_name text, _account_number text, _account_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  avail numeric;
  pid uuid;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if public.is_banned(_user => auth.uid()) then raise exception 'Akun diblokir'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || auth.uid()::text));
  if _amount is null or _amount < 10000 then raise exception 'Pencairan minimal Rp10.000'; end if;
  if length(trim(coalesce(_bank_name, ''))) < 2 or length(trim(coalesce(_account_number, ''))) < 4 or length(trim(coalesce(_account_name, ''))) < 2 then
    raise exception 'Lengkapi data rekening';
  end if;
  select w.available into avail from public.developer_wallet(auth.uid()) w;
  if coalesce(avail, 0) < _amount then raise exception 'Jumlah melebihi saldo tersedia'; end if;
  insert into public.payouts (developer_id, amount, bank_name, account_number, account_name, status)
  values (auth.uid(), _amount, trim(_bank_name), trim(_account_number), trim(_account_name), 'requested')
  returning id into pid;
  return pid;
end $$;
revoke all on function public.request_wallet_payout(numeric, text, text, text) from public, anon;
grant execute on function public.request_wallet_payout(numeric, text, text, text) to authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'request_payout'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;