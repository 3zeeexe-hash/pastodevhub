-- Verifikasi developer (centang biru).
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang.

-- 1) Penanda verifikasi di profil.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_at timestamptz;
CREATE INDEX IF NOT EXISTS profiles_verified_idx ON public.profiles (is_verified) WHERE is_verified;

-- 2) Hanya admin (atau proses server tanpa pengguna) yang boleh mengubah centang.
--    Developer yang mengirim is_verified lewat update profil biasa diabaikan diam-diam.
CREATE OR REPLACE FUNCTION public.guard_profile_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
      NEW.verified_at := NULL;
    ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
      NEW.is_verified := OLD.is_verified;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_verified ON public.profiles;
CREATE TRIGGER guard_profile_verified BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verified();

-- 3) Pengajuan verifikasi dari developer.
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_one_pending ON public.verification_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON public.verification_requests (status, created_at);

GRANT SELECT ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or admin read verification requests" ON public.verification_requests;
CREATE POLICY "Own or admin read verification requests" ON public.verification_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
-- Tidak ada policy INSERT/UPDATE/DELETE: semua perubahan lewat fungsi di bawah.

-- 4) Developer mengajukan.
CREATE OR REPLACE FUNCTION public.request_verification(_message text, _proof_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid; me public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF public.is_banned(auth.uid()) THEN RAISE EXCEPTION 'Akun kamu diblokir'; END IF;
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil tidak ditemukan'; END IF;
  IF me.account_type IS DISTINCT FROM 'developer' THEN RAISE EXCEPTION 'Hanya akun developer yang bisa mengajukan verifikasi'; END IF;
  IF me.is_verified THEN RAISE EXCEPTION 'Akun kamu sudah terverifikasi'; END IF;
  IF char_length(coalesce(trim(_message), '')) < 20 THEN RAISE EXCEPTION 'Jelaskan dirimu minimal 20 karakter'; END IF;
  IF coalesce(trim(_proof_url), '') <> '' AND trim(_proof_url) !~* '^https?://' THEN RAISE EXCEPTION 'Link bukti harus diawali http:// atau https://'; END IF;
  IF EXISTS (SELECT 1 FROM public.verification_requests WHERE user_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'Pengajuan sebelumnya masih menunggu admin';
  END IF;
  INSERT INTO public.verification_requests (user_id, message, proof_url)
  VALUES (auth.uid(), left(trim(_message), 1000), nullif(left(trim(coalesce(_proof_url, '')), 500), ''))
  RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE EXECUTE ON FUNCTION public.request_verification(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_verification(text, text) TO authenticated;

-- 5) Developer membatalkan pengajuan yang masih menunggu.
CREATE OR REPLACE FUNCTION public.cancel_verification_request(_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  DELETE FROM public.verification_requests WHERE id = _request AND user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_verification_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_verification_request(uuid) TO authenticated;

-- 6) Admin menyetujui / menolak.
CREATE OR REPLACE FUNCTION public.admin_review_verification(_request uuid, _approve boolean, _note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.verification_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  SELECT * INTO r FROM public.verification_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan tidak ditemukan'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Pengajuan ini sudah diproses'; END IF;
  UPDATE public.verification_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         admin_note = nullif(left(trim(coalesce(_note, '')), 500), ''),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   WHERE id = r.id;
  IF _approve THEN
    UPDATE public.profiles SET is_verified = true, verified_at = now() WHERE id = r.user_id;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, boolean, text) TO authenticated;

-- 7) Admin memberi / mencabut centang langsung dari daftar pengguna.
CREATE OR REPLACE FUNCTION public.admin_set_verified(_user uuid, _verified boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  UPDATE public.profiles
     SET is_verified = _verified, verified_at = CASE WHEN _verified THEN now() ELSE NULL END
   WHERE id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengguna tidak ditemukan'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_verified(uuid, boolean) TO authenticated;
