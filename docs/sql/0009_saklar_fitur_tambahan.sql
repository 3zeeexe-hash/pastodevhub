-- 0009_saklar_fitur_tambahan.sql
-- Saklar fitur tambahan untuk /admin/fitur: dm, linimasa, verifikasi, pencairan.
-- (Saklar "explore" hanya menutup halaman di sisi aplikasi, jadi tidak butuh SQL.)
--
-- Cara pakai: jalankan seluruh isi file ini sekali di SQL Editor database (Lovable Cloud / Supabase).
-- Aman dijalankan ulang (idempoten) dan aman bila sebuah tabel belum ada: tabel yang tidak ditemukan dilewati.
-- Tabel feature_flags dan fungsi feature_allowed() sudah dibuat oleh migrasi 0000 dan tidak diubah di sini.
--
-- Cara kerja: trigger BEFORE INSERT menolak baris baru dari pengguna yang sedang masuk selama fiturnya dimatikan.
-- Trigger dipakai (bukan policy RLS) karena sebagian tabel diisi lewat fungsi SECURITY DEFINER (RPC) yang melewati RLS.
-- Admin tetap boleh (feature_allowed). Proses sistem tanpa pengguna (webhook, tugas terjadwal) tidak diblokir.
-- Konten lama tidak dihapus; yang ditolak hanya penambahan baru.

-- 1) Fungsi penjaga umum. Argumen 1: kunci fitur. Argumen 2: pesan galat (opsional).
CREATE OR REPLACE FUNCTION public.guard_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.feature_allowed(TG_ARGV[0]) THEN
    RAISE EXCEPTION '%', coalesce(TG_ARGV[1], 'Fitur ini sedang dinonaktifkan admin');
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_feature() FROM PUBLIC;

-- 2) Pasang penjaga ke tabel. Setiap baris: tabel, kunci fitur, pesan galat.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- Pesan langsung
      ('dm_conversations',      'dm',         'Pesan langsung sedang dinonaktifkan admin'),
      ('dm_messages',           'dm',         'Pesan langsung sedang dinonaktifkan admin'),
      -- Linimasa (ikut mati juga bila Diskusi dimatikan)
      ('feed_posts',            'linimasa',   'Linimasa sedang dinonaktifkan admin'),
      ('feed_stories',          'linimasa',   'Linimasa sedang dinonaktifkan admin'),
      ('feed_posts',            'discuss',    'Fitur diskusi sedang dinonaktifkan admin'),
      ('feed_stories',          'discuss',    'Fitur diskusi sedang dinonaktifkan admin'),
      -- Verifikasi developer (centang biru)
      ('verification_requests', 'verifikasi', 'Pengajuan verifikasi sedang ditutup admin'),
      -- Pencairan dana
      ('payouts',               'pencairan',  'Pencairan dana sedang dinonaktifkan admin'),
      ('client_withdrawals',    'pencairan',  'Pencairan dana sedang dinonaktifkan admin')
    ) AS t(tbl, feature_key, msg)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'Tabel public.% tidak ditemukan, dilewati', r.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'guard_' || r.feature_key, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_feature(%L, %L)',
      'guard_' || r.feature_key, r.tbl, r.feature_key, r.msg
    );
  END LOOP;
END
$$;

-- 3) (Opsional) Cek: daftar penjaga yang terpasang.
-- SELECT event_object_table AS tabel, trigger_name FROM information_schema.triggers
--  WHERE trigger_name LIKE 'guard\_%' ORDER BY 1, 2;

-- 4) (Opsional) Cara membatalkan semuanya:
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT event_object_table AS t, trigger_name AS n FROM information_schema.triggers
--            WHERE trigger_schema = 'public' AND trigger_name LIKE 'guard\_%' LOOP
--     EXECUTE format('DROP TRIGGER %I ON public.%I', r.n, r.t);
--   END LOOP; END $$;
-- DROP FUNCTION IF EXISTS public.guard_feature();
