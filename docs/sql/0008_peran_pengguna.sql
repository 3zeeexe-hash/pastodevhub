-- Peran aktif pengguna (Developer / Freelancer / Client / Pribadi) tersimpan di database.
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang.
--
-- Catatan: ini HANYA preferensi tampilan (menu, beranda, pintasan), disimpan terpisah dari profiles
-- supaya ikut ke perangkat mana pun. Hak akses tetap mengikuti profiles.account_type, jadi tabel ini
-- tidak memberi kemampuan apa pun dan tidak dipakai di kebijakan RLS tabel lain.
-- Sebelum SQL ini diterapkan, aplikasi tetap jalan memakai localStorage seperti sebelumnya.

-- 1) Satu baris per pengguna.
CREATE TABLE IF NOT EXISTS public.user_role_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  active_role text NOT NULL DEFAULT 'developer' CHECK (active_role IN ('developer','freelancer','client','personal')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Pengguna hanya melihat dan mengubah barisnya sendiri.
GRANT SELECT, INSERT, UPDATE ON public.user_role_prefs TO authenticated;
GRANT ALL ON public.user_role_prefs TO service_role;
ALTER TABLE public.user_role_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own role pref read" ON public.user_role_prefs;
CREATE POLICY "Own role pref read" ON public.user_role_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Own role pref insert" ON public.user_role_prefs;
CREATE POLICY "Own role pref insert" ON public.user_role_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Own role pref update" ON public.user_role_prefs;
CREATE POLICY "Own role pref update" ON public.user_role_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3) Waktu ubah terakhir diisi otomatis.
CREATE OR REPLACE FUNCTION public.touch_user_role_prefs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touch_user_role_prefs ON public.user_role_prefs;
CREATE TRIGGER touch_user_role_prefs BEFORE UPDATE ON public.user_role_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_role_prefs();

-- Tidak ada backfill: peran yang sudah dipilih di tiap perangkat disalin ke tabel ini oleh aplikasi
-- saat pengguna berikutnya membuka situs, supaya pilihan Freelancer / Pribadi tidak tertimpa nilai bawaan.
