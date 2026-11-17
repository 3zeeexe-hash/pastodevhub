-- =====================================================================
-- Pastodev: biaya admin per metode pembayaran Midtrans
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable).
-- Sengaja disimpan di docs/ dan BUKAN di supabase/migrations atau drizzle (lihat AGENTS.md).
-- Jalankan SETELAH 001_midtrans_escrow.sql. Aman dijalankan ulang.
-- Jangan jalankan ulang 001 sesudah file ini: 001 membuat ulang midtrans_record_charge versi lama.
--
-- Cara kerja:
--   * Admin mengisi biaya tiap metode di /admin/midtrans (nominal tetap + persen).
--     Contoh: VA BCA/BNI/BRI/Permata = Rp4.000, QRIS = 0,7%.
--   * Biaya dihitung di SERVER dan ditambahkan ke gross_amount transaksi Midtrans (item "Biaya admin pembayaran").
--   * payments.gross_amount = TOTAL yang dibayar pembeli (nominal pesanan + biaya).
--     payments.fee_amount    = bagian biaya admin saja.
--   * Escrow developer tetap dihitung dari orders.amount (nominal pesanan), jadi biaya tidak memotong developer.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Penyimpanan aturan biaya (jsonb), mis:
--    {"bca":{"flat":4000,"percent":0},"qris":{"flat":0,"percent":0.7}}
--    Metode yang tidak ada di json dianggap tanpa biaya.
-- ---------------------------------------------------------------------
alter table public.platform_secrets
  add column if not exists midtrans_fees jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 2. Catat bagian biaya pada tiap percobaan pembayaran
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists fee_amount numeric not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_fee_amount_check') then
    alter table public.payments add constraint payments_fee_amount_check check (fee_amount >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. midtrans_record_charge: terima _fee (default 0).
--    _amount = TOTAL yang dibayar (nominal pesanan + _fee) dan harus cocok dengan pesanan.
--    Versi lama (11 argumen) dihapus supaya pemanggilan lewat PostgREST tidak ambigu.
-- ---------------------------------------------------------------------
drop function if exists public.midtrans_record_charge(uuid, uuid, text, text, numeric, text, text, text, text, timestamptz, jsonb);

create or replace function public.midtrans_record_charge(
  _order_id uuid, _buyer_id uuid, _midtrans_order_id text, _method text, _amount numeric,
  _mode text, _va text, _bank text, _qr text, _expires timestamptz, _raw jsonb,
  _fee numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o record;
  sup text[];
  pid uuid;
  fee numeric := coalesce(_fee, 0);
begin
  perform public._require_server_proof();
  if fee < 0 then raise exception 'Biaya tidak valid'; end if;

  select * into o from public.orders where id = _order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.buyer_id <> _buyer_id then raise exception 'Bukan pesanan kamu'; end if;
  if o.status <> 'awaiting_payment' then raise exception 'Pesanan tidak sedang menunggu pembayaran'; end if;
  if o.amount + fee <> _amount then raise exception 'Nominal tidak cocok dengan pesanan'; end if;

  select coalesce(array_agg(midtrans_order_id), '{}') into sup
    from public.payments where order_id = _order_id and status = 'pending';
  update public.payments set status = 'superseded', updated_at = now()
    where order_id = _order_id and status = 'pending';

  insert into public.payments (order_id, midtrans_order_id, method, gross_amount, fee_amount, mode, va_number, bank, qr_url, expires_at, raw)
  values (_order_id, _midtrans_order_id, _method, _amount, fee, coalesce(_mode, 'sandbox'), _va, _bank, _qr, _expires, _raw)
  returning id into pid;

  return jsonb_build_object('id', pid, 'superseded', to_jsonb(sup));
end $$;
revoke all on function public.midtrans_record_charge(uuid, uuid, text, text, numeric, text, text, text, text, timestamptz, jsonb, numeric) from public;
grant execute on function public.midtrans_record_charge(uuid, uuid, text, text, numeric, text, text, text, text, timestamptz, jsonb, numeric) to anon, authenticated;

-- midtrans_apply_notification TIDAK perlu diubah: ia membandingkan gross_amount Midtrans dengan
-- payments.gross_amount (sekarang total termasuk biaya) dan membuat escrow dari orders.amount (tanpa biaya).

commit;

-- Muat ulang skema API agar kolom dan fungsi baru langsung bisa dipakai aplikasi.
notify pgrst, 'reload schema';
