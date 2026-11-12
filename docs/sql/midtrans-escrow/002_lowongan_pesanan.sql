-- =====================================================================
-- Pastodev: lamaran lowongan yang DITERIMA menjadi pesanan berbayar (Midtrans + escrow)
--
-- Jalankan SETELAH 001_midtrans_escrow.sql, MANUAL oleh owner di SQL editor database
-- (bukan lewat Lovable; lihat AGENTS.md). Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Alur: client menerima lamaran (respond_job_application, sudah ada) -> klik "Buat pesanan & bayar"
-- -> pesanan jasa dibuat -> client membayar lewat pop-up Midtrans -> dana ditahan admin 1 hari ->
-- developer mengirim hasil -> client menerima / minta revisi -> admin meneruskan saldo secara MANUAL.
-- =====================================================================

begin;

-- Hubungan pesanan -> lamaran. Satu lamaran hanya boleh punya satu pesanan.
alter table public.orders
  add column if not exists job_application_id uuid references public.job_applications(id) on delete set null;
create unique index if not exists orders_job_application_uidx
  on public.orders (job_application_id) where job_application_id is not null;

-- Dipanggil client pemilik lowongan. Idempoten: jika pesanan sudah ada, id pesanan yang ada dikembalikan.
--   * Penawaran developer >= Rp1.000  -> pesanan langsung "menunggu pembayaran" dengan harga penawaran.
--   * Penawaran "Nego" (0)             -> pesanan "menunggu jawaban developer"; developer menetapkan harga
--                                         lewat tombol Terima yang sudah ada, lalu client membayar.
create or replace function public.create_order_from_application(_application_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a record;
  j record;
  existing uuid;
  oid uuid;
  st text;
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  if public.is_banned(_user => auth.uid()) then raise exception 'Akun diblokir'; end if;

  select * into a from public.job_applications where id = _application_id for update;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id;
  if not found then raise exception 'Lowongan tidak ditemukan'; end if;

  if j.client_id <> auth.uid() then raise exception 'Hanya pemilik lowongan yang bisa membuat pesanan'; end if;
  if a.status <> 'accepted' then raise exception 'Terima lamaran ini dulu sebelum membuat pesanan'; end if;

  select id into existing from public.orders where job_application_id = a.id;
  if existing is not null then return existing; end if;

  st := case when coalesce(a.bid_amount, 0) >= 1000 then 'awaiting_payment' else 'requested' end;

  insert into public.orders (kind, status, title, brief, amount, buyer_id, seller_id, job_application_id)
  values (
    'service', st,
    left('Lowongan: ' || j.title, 120),
    left(coalesce(j.description, ''), 2000),
    case when st = 'awaiting_payment' then a.bid_amount else 0 end,
    j.client_id, a.developer_id, a.id
  )
  returning id into oid;

  insert into public.order_messages (order_id, sender_id, body, is_system)
  values (
    oid, j.client_id,
    case when st = 'awaiting_payment'
      then 'Pesanan dibuat dari lowongan. Client membayar lewat Midtrans; dana ditahan admin (escrow) sampai pekerjaan selesai.'
      else 'Pesanan dibuat dari lowongan. Developer menetapkan harga final, lalu client membayar lewat Midtrans.'
    end,
    true
  );

  return oid;
end $$;
revoke all on function public.create_order_from_application(uuid) from public, anon;
grant execute on function public.create_order_from_application(uuid) to authenticated;

commit;

-- Muat ulang skema API agar kolom dan fungsi baru langsung bisa dipakai aplikasi.
notify pgrst, 'reload schema';
