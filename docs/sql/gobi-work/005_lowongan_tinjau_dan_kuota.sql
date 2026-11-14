-- GOBI WORK — Lowongan: ditinjau admin dulu sebelum tampil + kuota posisi.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (bukan lewat Lovable; lihat AGENTS.md), SETELAH gobi-work/001 dan 002.
-- Aman dijalankan ulang. Satu transaksi: jika ada error, semuanya dibatalkan.
--
-- Yang diubah:
--   1. Lowongan baru dari akun biasa SELALU berstatus 'pending'. Hanya admin (work_admin_moderate_job) yang bisa mengubah status peninjauan.
--   2. Lowongan 'pending' / 'rejected' hanya terlihat oleh pemiliknya dan admin (policy RESTRICTIVE: menambah syarat, tidak mengganti policy lama).
--      Lowongan yang sudah ada tetap 'approved' (default baru hanya berlaku untuk baris baru).
--   3. Menerima pelamar TIDAK menutup lowongan selama posisi masih ada. Lowongan baru berubah ke 'in_progress' ketika jumlah pelamar
--      diterima = positions, dan hanya saat itu pelamar yang masih menunggu otomatis 'rejected'.
--      Fungsi baru: work_respond_application (fungsi lama respond_job_application dibiarkan; aplikasi memakai yang baru).
--   4. Notifikasi: pemilik diberi tahu saat lowongan disetujui/ditolak; developer yang cocok baru diberi tahu SETELAH disetujui.

begin;

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.jobs'::regclass) then
    raise exception 'RLS belum aktif di public.jobs: hentikan dan periksa dulu, kebijakan tinjau tidak akan berlaku';
  end if;
end $$;

-- ============ 1. Default dan penjaga status peninjauan ============
alter table public.jobs alter column moderation_status set default 'pending';

-- Hanya sesi pengguna (auth.uid() terisi) yang dipaksa 'pending'. SQL editor / service role tidak terpengaruh.
create or replace function public._jobs_force_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public._is_admin() then
    new.moderation_status := 'pending';
    new.moderation_note := null;
  end if;
  return new;
end $$;
revoke all on function public._jobs_force_pending() from public, anon, authenticated;
drop trigger if exists jobs_force_pending_trg on public.jobs;
create trigger jobs_force_pending_trg before insert on public.jobs
  for each row execute function public._jobs_force_pending();

create or replace function public._jobs_guard_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public._is_admin()
     and (new.moderation_status is distinct from old.moderation_status or new.moderation_note is distinct from old.moderation_note) then
    raise exception 'Status peninjauan hanya bisa diubah admin';
  end if;
  return new;
end $$;
revoke all on function public._jobs_guard_moderation() from public, anon, authenticated;
drop trigger if exists jobs_guard_moderation_trg on public.jobs;
create trigger jobs_guard_moderation_trg before update on public.jobs
  for each row execute function public._jobs_guard_moderation();

-- ============ 2. Siapa yang boleh melihat lowongan ============
create or replace function public._job_visible(_moderation text, _client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_moderation, 'approved') = 'approved'
      or (auth.uid() is not null and (auth.uid() = _client or public._is_admin()))
$$;
revoke all on function public._job_visible(text, uuid) from public;
grant execute on function public._job_visible(text, uuid) to anon, authenticated;

drop policy if exists jobs_moderation_visible on public.jobs;
create policy jobs_moderation_visible on public.jobs as restrictive for select
  using (public._job_visible(moderation_status, client_id));

-- ============ 3. Notifikasi setelah peninjauan ============
-- Trigger insert lama (_work_on_job_insert) hanya memberi tahu developer untuk lowongan 'approved', jadi lowongan baru ('pending') tidak memicunya.
create or replace function public._work_on_job_moderated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.moderation_status is distinct from old.moderation_status then
      if new.moderation_status = 'approved' then
        perform public._work_notify(new.client_id, 'job_moderated', 'Lowonganmu disetujui dan sudah tampil: ' || left(new.title, 80), '/lowongan/' || new.id);
        if new.status = 'open' and coalesce(array_length(new.skills, 1), 0) > 0 then
          insert into public.work_notifications (user_id, kind, title, link)
          select p.id, 'job_new', 'Lowongan baru yang cocok: ' || left(new.title, 80), '/lowongan/' || new.id
          from public.profiles p
          where p.account_type = 'developer' and p.id <> new.client_id and p.skills && new.skills
          limit 50;
        end if;
      elsif new.moderation_status = 'rejected' then
        perform public._work_notify(new.client_id, 'job_moderated', 'Lowonganmu ditolak admin: ' || left(new.title, 80), '/lowongan/' || new.id);
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_job_moderated() from public, anon, authenticated;
drop trigger if exists work_job_moderated_notify_trg on public.jobs;
create trigger work_job_moderated_notify_trg after update of moderation_status on public.jobs
  for each row execute function public._work_on_job_moderated();

-- ============ 4. Menjawab lamaran dengan kuota posisi ============
-- Terima  : lamaran 'accepted'. Lowongan tetap 'open' selama jumlah diterima < positions.
--           Saat posisi terakhir terisi: lamaran yang masih 'pending' menjadi 'rejected' dan lowongan menjadi 'in_progress'.
-- Tolak   : hanya lamaran itu yang 'rejected'.
-- Hasil   : {accepted, positions, filled} untuk ditampilkan di aplikasi.
create or replace function public.work_respond_application(_application_id uuid, _accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; j record; n int; filled boolean := false;
begin
  perform public._work_guard();
  select * into a from public.job_applications where id = _application_id;
  if not found then raise exception 'Lamaran tidak ditemukan'; end if;
  select * into j from public.jobs where id = a.job_id for update;
  if not found or j.client_id <> auth.uid() then raise exception 'Bukan lowongan kamu'; end if;
  select * into a from public.job_applications where id = _application_id for update;
  if a.status <> 'pending' then raise exception 'Lamaran ini sudah dijawab'; end if;
  if j.moderation_status <> 'approved' then raise exception 'Lowongan belum disetujui admin'; end if;
  if j.status <> 'open' then raise exception 'Lowongan sudah tidak dibuka'; end if;

  select count(*) into n from public.job_applications where job_id = j.id and status = 'accepted';

  if not _accept then
    update public.job_applications set status = 'rejected' where id = _application_id;
    return jsonb_build_object('accepted', n, 'positions', j.positions, 'filled', false);
  end if;

  if n >= j.positions then raise exception 'Kuota % freelancer sudah terpenuhi', j.positions; end if;

  update public.job_applications set status = 'accepted' where id = _application_id;
  n := n + 1;
  if n >= j.positions then
    update public.job_applications set status = 'rejected' where job_id = j.id and status = 'pending';
    update public.jobs set status = 'in_progress' where id = j.id;
    filled := true;
  end if;
  return jsonb_build_object('accepted', n, 'positions', j.positions, 'filled', filled);
end $$;
revoke all on function public.work_respond_application(uuid, boolean) from public, anon;
grant execute on function public.work_respond_application(uuid, boolean) to authenticated;

commit;

-- Muat ulang skema API agar fungsi dan policy baru langsung dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select column_default from information_schema.columns where table_name = 'jobs' and column_name = 'moderation_status';   -- 'pending'::text
--   select policyname, permissive from pg_policies where tablename = 'jobs' and policyname = 'jobs_moderation_visible';       -- RESTRICTIVE
--   select tgname from pg_trigger where tgname in ('jobs_force_pending_trg', 'jobs_guard_moderation_trg', 'work_job_moderated_notify_trg') and not tgisinternal;
