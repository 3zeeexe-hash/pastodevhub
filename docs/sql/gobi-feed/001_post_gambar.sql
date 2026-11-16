-- GobiFeed: post (dan balasan/kutipan) boleh membawa satu gambar.
-- Syarat: 0005_diskusi_linimasa.sql sudah diterapkan.
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang. Sebelum file ini diterapkan, aplikasi tetap jalan: post tanpa gambar normal, dan mengirim post
-- bergambar gagal dengan pesan "belum aktif di database".

ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS image_url text;

-- Post/balasan/kutipan boleh tanpa teks kalau ada gambar. Repost tetap kosong dan tanpa gambar.
ALTER TABLE public.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_shape;
ALTER TABLE public.feed_posts ADD CONSTRAINT feed_posts_shape CHECK (
  (kind = 'post'   AND parent_id IS NULL AND ref_id IS NULL AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL)) OR
  (kind = 'reply'  AND parent_id IS NOT NULL AND ref_id IS NULL AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL)) OR
  (kind = 'repost' AND ref_id IS NOT NULL AND parent_id IS NULL AND body = '' AND image_url IS NULL) OR
  (kind = 'quote'  AND ref_id IS NOT NULL AND parent_id IS NULL AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL))
);

-- Gambar harus berasal dari penyimpanan GoBi dan dari folder milik penulis sendiri (pola yang sama dengan pesan chat, drizzle 0009).
-- Setelah post dibuat, gambarnya tidak bisa diganti.
CREATE OR REPLACE FUNCTION public.feed_posts_image_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.image_url := OLD.image_url;
    RETURN NEW;
  END IF;
  IF NEW.image_url IS NOT NULL THEN
    IF NEW.author_id IS NULL
       OR char_length(NEW.image_url) > 2000
       OR NEW.image_url !~ ('^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.(supabase\.co|lovable\.cloud)/storage/v1/object/sign/media/' || NEW.author_id::text || '/[^?#]+\?token=[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Gambar harus diunggah lewat GoBi.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feed_posts_image_guard ON public.feed_posts;
CREATE TRIGGER feed_posts_image_guard BEFORE INSERT OR UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.feed_posts_image_guard();
