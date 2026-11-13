-- Story di Diskusi: tampil 24 jam lalu hilang sendiri (disaring lewat expires_at, tanpa cron).
CREATE TABLE public.feed_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  image_url text,
  bg text NOT NULL DEFAULT 'senja',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  CONSTRAINT feed_stories_body_len CHECK (char_length(body) <= 300),
  CONSTRAINT feed_stories_bg CHECK (bg IN ('senja','malam','laut','hutan','mawar')),
  CONSTRAINT feed_stories_has_content CHECK (char_length(btrim(body)) > 0 OR image_url IS NOT NULL)
);
CREATE INDEX feed_stories_expires_idx ON public.feed_stories (expires_at DESC);
CREATE INDEX feed_stories_author_idx ON public.feed_stories (author_id, created_at DESC);

GRANT SELECT ON public.feed_stories TO anon;
GRANT SELECT, INSERT, DELETE ON public.feed_stories TO authenticated;
GRANT ALL ON public.feed_stories TO service_role;

ALTER TABLE public.feed_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories: read active" ON public.feed_stories FOR SELECT TO anon, authenticated
  USING (expires_at > now());
CREATE POLICY "Stories: author reads own" ON public.feed_stories FOR SELECT TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "Stories: insert own" ON public.feed_stories FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "Stories: not banned" ON public.feed_stories AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_banned(auth.uid()));
CREATE POLICY "Stories: feature on" ON public.feed_stories AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.feature_allowed('discuss'));
CREATE POLICY "Stories: delete own or admin" ON public.feed_stories FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Server yang menentukan waktu: klien tidak bisa memperpanjang umur story.
CREATE OR REPLACE FUNCTION public.feed_stories_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.created_at := now();
  NEW.expires_at := now() + interval '1 day';
  NEW.body := btrim(coalesce(NEW.body, ''));
  IF NEW.image_url IS NOT NULL AND NEW.image_url NOT LIKE '%/storage/v1/object/sign/media/' || NEW.author_id::text || '/%' THEN
    RAISE EXCEPTION 'Gambar story harus diunggah lewat Pastodev';
  END IF;
  IF (SELECT count(*) FROM public.feed_stories WHERE author_id = NEW.author_id AND expires_at > now()) >= 30 THEN
    RAISE EXCEPTION 'Maksimal 30 story aktif. Tunggu sebagian hilang dulu.';
  END IF;
  -- Bersihkan story lama milik penulis yang sama (sudah tidak tampil).
  DELETE FROM public.feed_stories WHERE author_id = NEW.author_id AND expires_at <= now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.feed_stories_before_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER feed_stories_before_insert BEFORE INSERT ON public.feed_stories
  FOR EACH ROW EXECUTE FUNCTION public.feed_stories_before_insert();

-- Siapa yang sudah melihat story (cincin abu-abu untuk yang sudah dilihat, jumlah penonton untuk pemilik).
CREATE TABLE public.feed_story_views (
  story_id uuid NOT NULL REFERENCES public.feed_stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
CREATE INDEX feed_story_views_viewer_idx ON public.feed_story_views (viewer_id);

GRANT SELECT, INSERT ON public.feed_story_views TO authenticated;
GRANT ALL ON public.feed_story_views TO service_role;

ALTER TABLE public.feed_story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story views: read own or my story" ON public.feed_story_views FOR SELECT TO authenticated
  USING (viewer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.feed_stories s WHERE s.id = story_id AND s.author_id = auth.uid()));
CREATE POLICY "Story views: insert own" ON public.feed_story_views FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());