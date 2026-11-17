-- Tingkat centang verifikasi: biru = terverifikasi, hijau = akun resmi, merah = pemilik.
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang. Butuh docs/sql/0004_verifikasi_developer.sql sudah diterapkan.
--
-- Sebelum SQL ini diterapkan, aplikasi tetap jalan: semua akun terverifikasi tampil dengan centang biru,
-- dan menu admin menolak centang hijau / merah dengan pesan yang jelas.

-- 1) Kolom tingkat. NULL = tanpa centang. is_verified tetap ada dan selalu searah dengan kolom ini
--    (true bila ada tingkat), jadi semua kode lama yang membaca is_verified tidak berubah.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_tier text;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_verified_tier_check CHECK (verified_tier IN ('verified', 'official', 'owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS profiles_verified_tier_idx ON public.profiles (verified_tier) WHERE verified_tier IS NOT NULL;

-- Akun yang sudah bercentang biru sebelumnya jadi tingkat "verified". (Dijalankan sebagai admin SQL, bukan pengguna,
-- jadi tidak tertahan penjaga di bawah.)
UPDATE public.profiles SET verified_tier = 'verified' WHERE is_verified AND verified_tier IS NULL;

-- Kolom baru ikut bisa dibaca publik, sama seperti is_verified, supaya centang tampil di feed dan profil.
GRANT SELECT (verified_tier) ON public.profiles TO anon, authenticated;

-- 2) Penjaga: hanya admin (atau proses server tanpa pengguna) yang boleh mengubah centang.
--    Pengguna biasa yang mengirim is_verified / verified_tier lewat update profil diabaikan diam-diam.
--    Setelah itu is_verified dan verified_tier disamakan supaya tidak pernah saling bertentangan.
CREATE OR REPLACE FUNCTION public.guard_profile_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
      NEW.verified_at := NULL;
      NEW.verified_tier := NULL;
    ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_tier IS DISTINCT FROM OLD.verified_tier THEN
      NEW.is_verified := OLD.is_verified;
      NEW.verified_at := OLD.verified_at;
      NEW.verified_tier := OLD.verified_tier;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.verified_tier IS DISTINCT FROM OLD.verified_tier THEN
    -- Tingkat yang berubah menentukan: ada tingkat = bercentang, kosong = tidak.
    NEW.is_verified := NEW.verified_tier IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    -- Hanya penanda lama yang diubah (kode lama atau persetujuan pengajuan): ikutkan tingkatnya.
    NEW.verified_tier := CASE WHEN NEW.is_verified THEN coalesce(OLD.verified_tier, 'verified') ELSE NULL END;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.verified_tier IS NOT NULL THEN
      NEW.is_verified := true;
    ELSIF NEW.is_verified THEN
      NEW.verified_tier := 'verified';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_verified ON public.profiles;
CREATE TRIGGER guard_profile_verified BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verified();

-- 3) Admin memilih tingkat centang untuk satu akun: 'verified' (biru), 'official' (hijau), 'owner' (merah),
--    atau NULL untuk mencabut. Akun apa pun boleh diberi centang, tidak harus developer.
CREATE OR REPLACE FUNCTION public.admin_set_verified_tier(_user uuid, _tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  IF _tier IS NOT NULL AND _tier NOT IN ('verified', 'official', 'owner') THEN
    RAISE EXCEPTION 'Tingkat centang tidak dikenal';
  END IF;
  UPDATE public.profiles
     SET verified_tier = _tier,
         is_verified = (_tier IS NOT NULL),
         verified_at = CASE WHEN _tier IS NULL THEN NULL ELSE coalesce(verified_at, now()) END
   WHERE id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_verified_tier(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_verified_tier(uuid, text) TO authenticated;

-- 4) Fungsi lama tetap bekerja untuk kode lama: memberi centang = biru (tingkat yang sudah ada dipertahankan),
--    mencabut = menghapus tingkat apa pun.
CREATE OR REPLACE FUNCTION public.admin_set_verified(_user uuid, _verified boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  UPDATE public.profiles
     SET is_verified = _verified,
         verified_tier = CASE WHEN _verified THEN coalesce(verified_tier, 'verified') ELSE NULL END,
         verified_at = CASE WHEN _verified THEN coalesce(verified_at, now()) ELSE NULL END
   WHERE id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) TO authenticated;
