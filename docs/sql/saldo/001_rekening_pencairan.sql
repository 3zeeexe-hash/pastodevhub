-- Rekening pencairan tersimpan (menu Saldo & penarikan di /studio/saldo).
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang.
--
-- Catatan: tabel ini hanya menyimpan daftar rekening untuk memudahkan pengisian formulir pencairan.
-- Pencairan tetap dicatat di tabel payouts (nama bank, nomor, dan nama disalin ke sana saat mengajukan).
-- Sebelum SQL ini diterapkan, aplikasi tetap jalan: rekening disimpan di localStorage perangkat.

-- 1) Satu baris per rekening, maksimal 5 per pengguna.
CREATE TABLE IF NOT EXISTS public.payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 60),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{5,25}$'),
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 100),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payout_accounts_user_idx ON public.payout_accounts (user_id);

-- 2) Pengguna hanya melihat dan mengubah rekeningnya sendiri.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_accounts TO authenticated;
GRANT ALL ON public.payout_accounts TO service_role;
ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own payout accounts read" ON public.payout_accounts;
CREATE POLICY "Own payout accounts read" ON public.payout_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Own payout accounts insert" ON public.payout_accounts;
CREATE POLICY "Own payout accounts insert" ON public.payout_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Own payout accounts update" ON public.payout_accounts;
CREATE POLICY "Own payout accounts update" ON public.payout_accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Own payout accounts delete" ON public.payout_accounts;
CREATE POLICY "Own payout accounts delete" ON public.payout_accounts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3) Batas jumlah rekening per pengguna.
CREATE OR REPLACE FUNCTION public.limit_payout_accounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.payout_accounts WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Maksimal 5 rekening pencairan.';
  END IF;
  RETURN NEW;
 END $$;

DROP TRIGGER IF EXISTS limit_payout_accounts ON public.payout_accounts;
CREATE TRIGGER limit_payout_accounts BEFORE INSERT ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.limit_payout_accounts();
