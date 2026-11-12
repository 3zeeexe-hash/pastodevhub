-- Linimasa Diskusi ala X (Fase 3): pencarian post, trending, "Untuk Kamu", dan polling.
-- Syarat: 0005_diskusi_linimasa.sql sudah diterapkan.
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang. Sebelum file ini diterapkan, aplikasi tetap jalan: "Untuk Kamu" jatuh ke urutan terbaru,
-- tab Tren kosong, dan polling tidak muncul.

-- 1) Pencarian: indeks trigram supaya ILIKE '%kata%' pada isi post cepat.
-- Kalau ekstensi tidak bisa dipasang, pencarian tetap jalan, hanya lebih lambat.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS feed_posts_body_trgm_idx ON public.feed_posts USING gin (body gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Indeks trigram dilewati: %', SQLERRM;
END $$;

-- Tagar yang diawali huruf yang diketik (untuk saran di halaman Cari).
CREATE OR REPLACE FUNCTION public.feed_search_tags(_q text, _limit integer DEFAULT 8)
RETURNS TABLE (tag text, posts bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT h.tag, count(*) AS posts
  FROM public.feed_hashtags h
  WHERE length(regexp_replace(lower(coalesce(_q, '')), '[^[:alnum:]_]', '', 'g')) > 0
    AND h.tag LIKE regexp_replace(lower(coalesce(_q, '')), '[^[:alnum:]_]', '', 'g') || '%'
  GROUP BY h.tag
  ORDER BY count(*) DESC, h.tag
  LIMIT greatest(1, least(coalesce(_limit, 8), 30));
$$;
GRANT EXECUTE ON FUNCTION public.feed_search_tags(text, integer) TO anon, authenticated;

-- 2) Trending: tagar paling ramai. Diurutkan menurut jumlah penulis berbeda dulu,
-- supaya satu orang yang mengulang tagar tidak bisa menaikkannya sendirian.
CREATE OR REPLACE FUNCTION public.feed_trending_tags(_hours integer DEFAULT 48, _limit integer DEFAULT 10)
RETURNS TABLE (tag text, posts bigint, authors bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT h.tag, count(*) AS posts, count(DISTINCT p.author_id) AS authors
  FROM public.feed_hashtags h
  JOIN public.feed_posts p ON p.id = h.post_id
  WHERE h.created_at > now() - make_interval(hours => greatest(1, least(coalesce(_hours, 48), 720)))
    AND p.kind <> 'repost'
  GROUP BY h.tag
  ORDER BY count(DISTINCT p.author_id) DESC, count(*) DESC, h.tag
  LIMIT greatest(1, least(coalesce(_limit, 10), 50));
$$;
GRANT EXECUTE ON FUNCTION public.feed_trending_tags(integer, integer) TO anon, authenticated;

-- 3) Peringkat post untuk "Untuk Kamu" (_personal = true) dan post terpopuler (_personal = false).
-- Skor = (1 + suka + 2*balasan + 3*repost) / (umur dalam jam + 2)^1.5. Post dari akun yang diikuti
-- pembaca dikali 2. Hanya mengembalikan id dan skor; isi post diambil klien dengan aturan RLS biasa.
CREATE OR REPLACE FUNCTION public.feed_ranked(
  _hours integer DEFAULT 336, _limit integer DEFAULT 20, _offset integer DEFAULT 0, _personal boolean DEFAULT false
)
RETURNS TABLE (post_id uuid, score double precision)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.id AS post_id,
    ((1 + p.like_count + 2 * p.reply_count + 3 * p.repost_count)::double precision
      / power(extract(epoch FROM (now() - p.created_at)) / 3600.0 + 2.0, 1.5))
    * CASE
        WHEN _personal AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = p.author_id
        ) THEN 2.0 ELSE 1.0
      END AS score
  FROM public.feed_posts p
  WHERE p.kind IN ('post', 'quote')
    AND p.created_at > now() - make_interval(hours => greatest(1, least(coalesce(_hours, 336), 720)))
  ORDER BY score DESC, p.created_at DESC, p.id
  LIMIT greatest(1, least(coalesce(_limit, 20), 50))
  OFFSET greatest(0, least(coalesce(_offset, 0), 1000));
$$;
GRANT EXECUTE ON FUNCTION public.feed_ranked(integer, integer, integer, boolean) TO anon, authenticated;

-- 4) Polling. Pertanyaan = isi post. Satu orang satu suara, suara tidak bisa diubah.
CREATE OR REPLACE FUNCTION public.feed_poll_options_ok(o text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT o IS NOT NULL
    AND cardinality(o) BETWEEN 2 AND 4
    AND NOT EXISTS (SELECT 1 FROM unnest(o) AS x WHERE x IS NULL OR char_length(btrim(x)) = 0 OR char_length(x) > 40);
$$;

CREATE TABLE IF NOT EXISTS public.feed_polls (
  post_id uuid PRIMARY KEY REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  options text[] NOT NULL CHECK (public.feed_poll_options_ok(options)),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feed_poll_votes (
  post_id uuid NOT NULL REFERENCES public.feed_polls(post_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_idx smallint NOT NULL CHECK (option_idx >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- Suara harus memilih opsi yang ada dan masuk sebelum polling berakhir.
CREATE OR REPLACE FUNCTION public.feed_poll_vote_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  poll record;
BEGIN
  SELECT options, ends_at INTO poll FROM public.feed_polls WHERE post_id = NEW.post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Polling tidak ditemukan.'; END IF;
  IF now() >= poll.ends_at THEN RAISE EXCEPTION 'Polling sudah berakhir.'; END IF;
  IF NEW.option_idx >= cardinality(poll.options) THEN RAISE EXCEPTION 'Pilihan tidak valid.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feed_poll_vote_guard ON public.feed_poll_votes;
CREATE TRIGGER feed_poll_vote_guard BEFORE INSERT ON public.feed_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.feed_poll_vote_guard();

-- Hasil dihitung di database: klien hanya melihat jumlah, bukan siapa memilih apa.
CREATE OR REPLACE FUNCTION public.feed_poll_results(_post_ids uuid[])
RETURNS TABLE (post_id uuid, option_idx smallint, votes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.post_id, v.option_idx, count(*) AS votes
  FROM public.feed_poll_votes v
  WHERE v.post_id = ANY (coalesce(_post_ids[1:50], ARRAY[]::uuid[]))
  GROUP BY v.post_id, v.option_idx;
$$;
GRANT EXECUTE ON FUNCTION public.feed_poll_results(uuid[]) TO anon, authenticated;

-- Membuat post + polling dalam satu transaksi (berjalan sebagai pemanggil, jadi RLS dan pembatas laju tetap berlaku).
CREATE OR REPLACE FUNCTION public.feed_create_poll(_body text, _options text[], _hours integer)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pid uuid;
  opts text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Masuk dulu.'; END IF;
  SELECT array_agg(btrim(t.x) ORDER BY t.ord) INTO opts
    FROM unnest(_options) WITH ORDINALITY AS t(x, ord)
    WHERE t.x IS NOT NULL AND btrim(t.x) <> '';
  IF opts IS NULL OR cardinality(opts) < 2 OR cardinality(opts) > 4 THEN
    RAISE EXCEPTION 'Polling butuh 2 sampai 4 pilihan.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(opts) AS x WHERE char_length(x) > 40) THEN
    RAISE EXCEPTION 'Satu pilihan maksimal 40 karakter.';
  END IF;
  IF _hours IS NULL OR _hours < 1 OR _hours > 168 THEN
    RAISE EXCEPTION 'Durasi polling 1 jam sampai 7 hari.';
  END IF;
  INSERT INTO public.feed_posts (author_id, kind, body) VALUES (auth.uid(), 'post', coalesce(_body, ''))
    RETURNING id INTO pid;
  INSERT INTO public.feed_polls (post_id, options, ends_at)
    VALUES (pid, opts, now() + make_interval(hours => _hours));
  RETURN pid;
END $$;
REVOKE EXECUTE ON FUNCTION public.feed_create_poll(text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feed_create_poll(text, text[], integer) TO authenticated;

-- 5) Row Level Security.
ALTER TABLE public.feed_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_polls read" ON public.feed_polls;
CREATE POLICY "feed_polls read" ON public.feed_polls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "feed_polls insert by post author" ON public.feed_polls;
CREATE POLICY "feed_polls insert by post author" ON public.feed_polls FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.feed_posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

DROP POLICY IF EXISTS "feed_poll_votes read own" ON public.feed_poll_votes;
CREATE POLICY "feed_poll_votes read own" ON public.feed_poll_votes FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "feed_poll_votes insert own" ON public.feed_poll_votes;
CREATE POLICY "feed_poll_votes insert own" ON public.feed_poll_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Polling dan suara tidak bisa diubah atau dihapus klien (polling ikut terhapus saat post dihapus).
REVOKE UPDATE, DELETE ON public.feed_polls FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.feed_poll_votes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.feed_polls, public.feed_poll_votes FROM anon;
