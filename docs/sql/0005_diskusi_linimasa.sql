-- Linimasa Diskusi ala X (Fase 1 + 2): post, balasan, repost, kutip, like, bookmark,
-- hashtag, mention, dan notifikasi. Follow memakai tabel `follows` yang sudah ada.
-- Forum lama (tabel `posts` + `comments`) tidak diubah.
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang.

-- 1) Post. kind: post (utama), reply (balasan), repost (tanpa teks), quote (repost + komentar).
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'reply', 'repost', 'quote')),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  parent_id uuid REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  ref_id uuid REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  like_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  repost_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feed_posts_shape CHECK (
    (kind = 'post'   AND parent_id IS NULL AND ref_id IS NULL AND char_length(btrim(body)) > 0) OR
    (kind = 'reply'  AND parent_id IS NOT NULL AND ref_id IS NULL AND char_length(btrim(body)) > 0) OR
    (kind = 'repost' AND ref_id IS NOT NULL AND parent_id IS NULL AND body = '') OR
    (kind = 'quote'  AND ref_id IS NOT NULL AND parent_id IS NULL AND char_length(btrim(body)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS feed_posts_created_idx ON public.feed_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_author_idx ON public.feed_posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_parent_idx ON public.feed_posts (parent_id, created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feed_posts_ref_idx ON public.feed_posts (ref_id) WHERE ref_id IS NOT NULL;
-- Satu orang hanya bisa me-repost satu post satu kali.
CREATE UNIQUE INDEX IF NOT EXISTS feed_posts_one_repost_idx ON public.feed_posts (author_id, ref_id) WHERE kind = 'repost';

-- 2) Like dan bookmark (privat: hanya pemilik yang bisa melihat barisnya; jumlah like ada di feed_posts).
CREATE TABLE IF NOT EXISTS public.feed_likes (
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS feed_likes_user_idx ON public.feed_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feed_bookmarks (
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS feed_bookmarks_user_idx ON public.feed_bookmarks (user_id, created_at DESC);

-- 3) Hashtag dan mention (diisi otomatis oleh trigger dari isi post).
CREATE TABLE IF NOT EXISTS public.feed_hashtags (
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, tag)
);
CREATE INDEX IF NOT EXISTS feed_hashtags_tag_idx ON public.feed_hashtags (tag, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feed_mentions (
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

-- 4) Notifikasi (dibuat oleh trigger, bukan oleh klien).
CREATE TABLE IF NOT EXISTS public.feed_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'reply', 'mention', 'follow', 'repost', 'quote')),
  post_id uuid REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_notifications_user_idx ON public.feed_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_notifications_unread_idx ON public.feed_notifications (user_id) WHERE read_at IS NULL;
-- Cegah notifikasi ganda kalau orang menekan like/unlike berulang.
CREATE UNIQUE INDEX IF NOT EXISTS feed_notifications_dedupe_post_idx
  ON public.feed_notifications (user_id, actor_id, type, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS feed_notifications_dedupe_follow_idx
  ON public.feed_notifications (user_id, actor_id) WHERE type = 'follow';

-- 5) Pembatas laju: maksimal 20 post/balasan/repost per 5 menit per orang.
CREATE OR REPLACE FUNCTION public.feed_posts_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.feed_posts
        WHERE author_id = NEW.author_id AND created_at > now() - interval '5 minutes') >= 20 THEN
    RAISE EXCEPTION 'Terlalu banyak posting, coba lagi beberapa menit lagi.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feed_posts_rate_limit ON public.feed_posts;
CREATE TRIGGER feed_posts_rate_limit BEFORE INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.feed_posts_rate_limit();

-- 6) Penghitung balasan dan repost.
CREATE OR REPLACE FUNCTION public.feed_posts_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'reply' THEN
      UPDATE public.feed_posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    ELSIF NEW.kind IN ('repost', 'quote') THEN
      UPDATE public.feed_posts SET repost_count = repost_count + 1 WHERE id = NEW.ref_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.kind = 'reply' THEN
      UPDATE public.feed_posts SET reply_count = greatest(reply_count - 1, 0) WHERE id = OLD.parent_id;
    ELSIF OLD.kind IN ('repost', 'quote') THEN
      UPDATE public.feed_posts SET repost_count = greatest(repost_count - 1, 0) WHERE id = OLD.ref_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_posts_counters ON public.feed_posts;
CREATE TRIGGER feed_posts_counters AFTER INSERT OR DELETE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.feed_posts_counters();

CREATE OR REPLACE FUNCTION public.feed_likes_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts SET like_count = like_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO owner;
    IF owner IS NOT NULL AND owner <> NEW.user_id THEN
      INSERT INTO public.feed_notifications (user_id, actor_id, type, post_id)
        VALUES (owner, NEW.user_id, 'like', NEW.post_id) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feed_posts SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_likes_counters ON public.feed_likes;
CREATE TRIGGER feed_likes_counters AFTER INSERT OR DELETE ON public.feed_likes
  FOR EACH ROW EXECUTE FUNCTION public.feed_likes_counters();

-- 7) Hashtag, mention, dan notifikasi balasan/repost/kutip saat post dibuat.
CREATE OR REPLACE FUNCTION public.feed_posts_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target uuid;
  m record;
BEGIN
  -- Hashtag: huruf/angka/underscore, tidak didahului huruf, angka, _, /, atau &.
  IF NEW.kind <> 'repost' THEN
    INSERT INTO public.feed_hashtags (post_id, tag)
      SELECT DISTINCT NEW.id, lower(x[2])
      FROM regexp_matches(NEW.body, '(^|[^[:alnum:]_/&])#([[:alnum:]_]{1,50})', 'g') AS x
      ON CONFLICT DO NOTHING;
  END IF;

  -- Notifikasi untuk pemilik post yang dibalas / di-repost / dikutip.
  IF NEW.kind = 'reply' THEN
    SELECT author_id INTO target FROM public.feed_posts WHERE id = NEW.parent_id;
  ELSIF NEW.kind IN ('repost', 'quote') THEN
    SELECT author_id INTO target FROM public.feed_posts WHERE id = NEW.ref_id;
  END IF;
  IF target IS NOT NULL AND target <> NEW.author_id THEN
    INSERT INTO public.feed_notifications (user_id, actor_id, type, post_id)
      VALUES (target, NEW.author_id, NEW.kind, NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  -- Mention: @username milik pengguna yang ada. Tidak dobel dengan notifikasi di atas.
  IF NEW.kind <> 'repost' THEN
    FOR m IN
      SELECT DISTINCT p.id AS uid
      FROM regexp_matches(NEW.body, '(^|[^[:alnum:]_@/.])@([[:alnum:]_-]{1,39})', 'g') AS x
      JOIN public.profiles p ON lower(p.username) = lower(x[2])
    LOOP
      IF m.uid <> NEW.author_id THEN
        INSERT INTO public.feed_mentions (post_id, user_id) VALUES (NEW.id, m.uid) ON CONFLICT DO NOTHING;
        IF target IS DISTINCT FROM m.uid THEN
          INSERT INTO public.feed_notifications (user_id, actor_id, type, post_id)
            VALUES (m.uid, NEW.author_id, 'mention', NEW.id) ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_posts_after_insert ON public.feed_posts;
CREATE TRIGGER feed_posts_after_insert AFTER INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.feed_posts_after_insert();

-- 8) Notifikasi follower baru (tabel `follows` sudah ada: follower_id, following_id).
CREATE OR REPLACE FUNCTION public.feed_follows_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.follower_id <> NEW.following_id THEN
    INSERT INTO public.feed_notifications (user_id, actor_id, type)
      VALUES (NEW.following_id, NEW.follower_id, 'follow') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_follows_notify ON public.follows;
CREATE TRIGGER feed_follows_notify AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.feed_follows_notify();

-- 9) Row Level Security. Tidak ada policy UPDATE di feed_posts: isi post dan penghitung tidak bisa diubah klien.
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_posts read" ON public.feed_posts;
CREATE POLICY "feed_posts read" ON public.feed_posts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "feed_posts insert own" ON public.feed_posts;
CREATE POLICY "feed_posts insert own" ON public.feed_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "feed_posts delete own or admin" ON public.feed_posts;
CREATE POLICY "feed_posts delete own or admin" ON public.feed_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "feed_likes own" ON public.feed_likes;
CREATE POLICY "feed_likes own" ON public.feed_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feed_bookmarks own" ON public.feed_bookmarks;
CREATE POLICY "feed_bookmarks own" ON public.feed_bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feed_hashtags read" ON public.feed_hashtags;
CREATE POLICY "feed_hashtags read" ON public.feed_hashtags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "feed_mentions read" ON public.feed_mentions;
CREATE POLICY "feed_mentions read" ON public.feed_mentions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "feed_notifications read own" ON public.feed_notifications;
CREATE POLICY "feed_notifications read own" ON public.feed_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "feed_notifications update own" ON public.feed_notifications;
CREATE POLICY "feed_notifications update own" ON public.feed_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "feed_notifications delete own" ON public.feed_notifications;
CREATE POLICY "feed_notifications delete own" ON public.feed_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Klien hanya boleh menandai notifikasi sudah dibaca (kolom read_at), tidak mengubah kolom lain.
REVOKE UPDATE ON public.feed_notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.feed_notifications TO authenticated;
-- Klien tidak boleh menulis hashtag/mention/notifikasi langsung; hanya trigger.
REVOKE INSERT, UPDATE, DELETE ON public.feed_hashtags, public.feed_mentions FROM anon, authenticated;
REVOKE INSERT ON public.feed_notifications FROM anon, authenticated;
REVOKE UPDATE ON public.feed_posts FROM anon, authenticated;
