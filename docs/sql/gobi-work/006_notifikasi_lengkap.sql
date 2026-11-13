-- GOBI WORK — Notifikasi lengkap: menutup celah aktivitas yang belum memberi kabar.
--
-- Dijalankan MANUAL oleh owner di SQL editor database (sama seperti 001–005), SETELAH docs/sql/gobi-work/002_gobi_work_phase3_7.sql.
-- Aman dijalankan ulang. Semua trigger dibungkus penangkap error: gagal kirim notifikasi tidak pernah menggagalkan aksi utama.
--
-- Menambahkan notifikasi untuk:
--   * lowongan disetujui / ditolak admin (ke pemilik lowongan)           kind: job_approved, job_rejected
--   * lowongan ditutup (ke pelamar yang masih menunggu)                  kind: job_closed
--   * lamaran ditarik pelamar (ke pemilik lowongan)                      kind: application_withdrawn
--   * ulasan baru diterima (ke yang diulas)                              kind: review_received
--   * laporan sudah ditinjau admin (ke pelapor)                          kind: report_update
-- Dan satu fungsi baru: work_mark_notification_read(id) untuk menandai satu notifikasi dibaca saat diketuk.
--
-- Yang sudah ada sejak 001/002 dan tidak diubah: lamaran baru/diterima/ditolak/dilihat/tahap, pesan baru, lowongan baru yang cocok,
-- kontrak (baru, disetujui, ditolak, dibatalkan), pembayaran masuk, milestone dimulai/dikirim/revisi/disetujui, dana diteruskan, sengketa.

begin;

-- ============ Lowongan: hasil moderasi admin ============
create or replace function public._work_on_job_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.moderation_status is distinct from old.moderation_status and new.client_id is not null then
      if new.moderation_status = 'approved' then
        perform public._work_notify(new.client_id, 'job_approved', 'Lowonganmu disetujui dan sudah tayang: ' || left(new.title, 80), '/lowongan/' || new.id);
      elsif new.moderation_status = 'rejected' then
        perform public._work_notify(new.client_id, 'job_rejected', 'Lowonganmu ditolak admin: ' || left(new.title, 80) || coalesce(' (' || left(new.moderation_note, 80) || ')', ''), '/kerja/lamaran');
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_job_moderation() from public, anon, authenticated;
drop trigger if exists work_job_moderation_notify_trg on public.jobs;
create trigger work_job_moderation_notify_trg after update of moderation_status on public.jobs
  for each row execute function public._work_on_job_moderation();

-- ============ Lowongan ditutup: beri tahu pelamar yang masih menunggu ============
create or replace function public._work_on_job_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if old.status = 'open' and new.status is distinct from 'open' then
      insert into public.work_notifications (user_id, kind, title, link)
      select a.developer_id, 'job_closed', 'Lowongan ditutup: ' || left(new.title, 80), '/lowongan/' || new.id
      from public.job_applications a
      where a.job_id = new.id and a.status = 'pending';
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_job_closed() from public, anon, authenticated;
drop trigger if exists work_job_closed_notify_trg on public.jobs;
create trigger work_job_closed_notify_trg after update of status on public.jobs
  for each row execute function public._work_on_job_closed();

-- ============ Lamaran ditarik ============
create or replace function public._work_on_application_withdrawn()
returns trigger language plpgsql security definer set search_path = public as $$
declare j record;
begin
  begin
    if new.status = 'withdrawn' and old.status is distinct from 'withdrawn' then
      select * into j from public.jobs where id = new.job_id;
      if found and j.client_id is not null then
        perform public._work_notify(j.client_id, 'application_withdrawn', 'Pelamar menarik lamarannya: ' || left(j.title, 80), '/lowongan/' || j.id);
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_application_withdrawn() from public, anon, authenticated;
drop trigger if exists work_application_withdrawn_notify_trg on public.job_applications;
create trigger work_application_withdrawn_notify_trg after update of status on public.job_applications
  for each row execute function public._work_on_application_withdrawn();

-- ============ Ulasan baru ============
create or replace function public._work_on_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public._work_notify(new.reviewee_id, 'review_received', 'Kamu menerima ulasan baru (' || new.rating || ' dari 5 bintang)', '/kerja/kontrak/' || new.contract_id);
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_review() from public, anon, authenticated;
drop trigger if exists work_review_notify_trg on public.work_reviews;
create trigger work_review_notify_trg after insert on public.work_reviews
  for each row execute function public._work_on_review();

-- ============ Laporan sudah ditinjau ============
create or replace function public._work_on_report_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status in ('resolved', 'dismissed') and old.status is distinct from new.status then
      perform public._work_notify(new.reporter_id, 'report_update', 'Laporanmu sudah ditinjau admin', null);
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public._work_on_report_update() from public, anon, authenticated;
drop trigger if exists work_report_notify_trg on public.work_reports;
create trigger work_report_notify_trg after update of status on public.work_reports
  for each row execute function public._work_on_report_update();

-- ============ Tandai satu notifikasi dibaca ============
create or replace function public.work_mark_notification_read(_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.work_notifications set read_at = now() where id = _id and user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.work_mark_notification_read(bigint) from public, anon;
grant execute on function public.work_mark_notification_read(bigint) to authenticated;

commit;

-- Muat ulang skema API agar fungsi baru langsung bisa dipakai aplikasi.
notify pgrst, 'reload schema';

-- Cek cepat setelah dijalankan:
--   select tgname from pg_trigger where tgname like 'work\_%notify\_trg' and not tgisinternal order by 1;
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'work_mark_notification_read';
