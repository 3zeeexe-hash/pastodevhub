-- Linimasa Diskusi ala X (Fase 4): moderasi (senyapkan/blokir, laporan), posting otomatis dari repo, dan pesan langsung.
-- Syarat: 0005_diskusi_linimasa.sql sudah diterapkan (0006 tidak wajib).
-- Perubahan database ini diterapkan lewat Lovable (lihat AGENTS.md: jangan menaruh migrasi di drizzle/ atau supabase/migrations/ dengan tangan).
-- Aman dijalankan ulang. Sebelum file ini diterapkan, aplikasi tetap jalan: menu laporan/blokir gagal dengan pesan galat,
-- halaman pesan menampilkan "belum aktif", dan pengaturan auto-post di repo disembunyikan.

-- ============================================================
-- 1) Senyapkan / blokir akun
-- ============================================================
-- mute  = post akun itu tidak muncul di linimasa pembaca.
-- block = sama seperti mute, ditambah akun itu tidak bisa memulai atau mengirim pesan langsung ke pembaca.
CREATE TABLE IF NOT EXISTS public.feed_user_blocks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mute', 'block')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id),
  CONSTRAINT feed_user_blocks_not_self CHECK (user_id <> target_id)
);
CREATE INDEX IF NOT EXISTS feed_user_blocks_target_idx ON public.feed_user_blocks (target_id);

-- ============================================================
-- 2) Laporan post
-- ============================================================
-- post_id dikosongkan (bukan dihapus) saat post hilang, jadi catatan keputusan admin tetap ada.
-- author_id dan snapshot diisi trigger dari post aslinya, bukan dari klien.
CREATE TABLE IF NOT EXISTS public.feed_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.feed_posts(id) ON DELETE SET NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  snapshot text NOT NULL DEFAULT '',
  reason text NOT NULL CHECK (reason IN ('spam', 'pelecehan', 'menyesatkan', 'ilegal', 'lainnya')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  action text CHECK (action IN ('post_deleted', 'reviewed', 'dismissed')),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_reports_status_idx ON public.feed_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_reports_post_idx ON public.feed_reports (post_id) WHERE post_id IS NOT NULL;
-- Satu orang hanya bisa punya satu laporan terbuka per post.
CREATE UNIQUE INDEX IF NOT EXISTS feed_reports_one_open_idx
  ON public.feed_reports (reporter_id, post_id) WHERE status = 'open' AND post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.feed_reports_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record;
BEGIN
  SELECT author_id, body INTO p FROM public.feed_posts WHERE id = NEW.post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post tidak ditemukan.'; END IF;
  IF p.author_id = NEW.reporter_id THEN RAISE EXCEPTION 'Kamu tidak bisa melaporkan post sendiri.'; END IF;
  IF (SELECT count(*) FROM public.feed_reports
        WHERE reporter_id = NEW.reporter_id AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Terlalu banyak laporan, coba lagi nanti.';
  END IF;
  NEW.author_id := p.author_id;
  NEW.snapshot := left(p.body, 500);
  NEW.status := 'open';
  NEW.action := NULL;
  NEW.resolved_by := NULL;
  NEW.resolved_at := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feed_reports_before_insert ON public.feed_reports;
CREATE TRIGGER feed_reports_before_insert BEFORE INSERT ON public.feed_reports
  FOR EACH ROW EXECUTE FUNCTION public.feed_reports_before_insert();

-- ============================================================
-- 3) Posting otomatis dari repo
-- ============================================================
-- Ada baris = pemilik mengaktifkan auto-post untuk repo itu. Hanya repo publik.
CREATE TABLE IF NOT EXISTS public.feed_autopost_repos (
  repo_id uuid PRIMARY KEY REFERENCES public.repositories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Penanda post yang dibuat otomatis (dipakai UI untuk kartu "Otomatis dari repo").
CREATE TABLE IF NOT EXISTS public.feed_autoposts (
  post_id uuid PRIMARY KEY REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  repo_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  commit_id uuid REFERENCES public.commits(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feed_autoposts_repo_idx ON public.feed_autoposts (repo_id);

-- Setiap commit baru di repo publik yang auto-post-nya aktif membuat satu post, paling sering sekali per 10 menit per repo.
-- Dilewati: commit lama (riwayat dari git push), "Initial commit", fork, "Impor dari GitHub", dan "Tarik perubahan dari GitHub".
-- Tanda # dan @ dibuang dari pesan commit supaya "fix #12" tidak jadi hashtag dan "@nama" tidak mengirim notifikasi.
-- Semua galat ditelan: commit tidak boleh gagal hanya karena posting otomatisnya gagal.
CREATE OR REPLACE FUNCTION public.feed_autopost_on_commit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ap record;
  r record;
  owner_name text;
  title text;
  pid uuid;
BEGIN
  BEGIN
    SELECT user_id, last_posted_at INTO ap FROM public.feed_autopost_repos WHERE repo_id = NEW.repo_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF ap.last_posted_at IS NOT NULL AND ap.last_posted_at > now() - interval '10 minutes' THEN RETURN NULL; END IF;
    IF NEW.created_at < now() - interval '1 hour' THEN RETURN NULL; END IF;

    SELECT id, name, is_private, owner_id INTO r FROM public.repositories WHERE id = NEW.repo_id;
    IF NOT FOUND OR r.is_private OR r.owner_id <> ap.user_id THEN RETURN NULL; END IF;

    title := btrim(regexp_replace(split_part(NEW.message, E'\n', 1), '[#@]', '', 'g'));
    IF title = '' OR title ~* '^(initial commit|fork dari |impor dari github|tarik perubahan dari github)' THEN RETURN NULL; END IF;

    SELECT username INTO owner_name FROM public.profiles WHERE id = r.owner_id;
    IF owner_name IS NULL THEN RETURN NULL; END IF;

    INSERT INTO public.feed_posts (author_id, kind, body)
      VALUES (ap.user_id, 'post', left('Commit baru di ' || owner_name || '/' || r.name || ': ' || title, 500))
      RETURNING id INTO pid;
    INSERT INTO public.feed_autoposts (post_id, repo_id, commit_id) VALUES (pid, NEW.repo_id, NEW.id);
    UPDATE public.feed_autopost_repos SET last_posted_at = now() WHERE repo_id = NEW.repo_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'feed_autopost_on_commit dilewati: %', SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_autopost_on_commit ON public.commits;
CREATE TRIGGER feed_autopost_on_commit AFTER INSERT ON public.commits
  FOR EACH ROW EXECUTE FUNCTION public.feed_autopost_on_commit();

-- Repo yang dijadikan privat: post otomatisnya ikut dihapus.
CREATE OR REPLACE FUNCTION public.feed_autopost_repo_private()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_private AND NOT OLD.is_private THEN
    DELETE FROM public.feed_posts WHERE id IN (SELECT post_id FROM public.feed_autoposts WHERE repo_id = NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS feed_autopost_repo_private ON public.repositories;
CREATE TRIGGER feed_autopost_repo_private AFTER UPDATE OF is_private ON public.repositories
  FOR EACH ROW EXECUTE FUNCTION public.feed_autopost_repo_private();

-- ============================================================
-- 4) Pesan langsung (1 lawan 1)
-- ============================================================
-- Catatan: pesan disimpan sebagai teks biasa (tidak dienkripsi ujung-ke-ujung). Pesan tidak bisa dilaporkan lewat laporan post.
CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_key text NOT NULL UNIQUE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dm_participants (
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS dm_participants_user_idx ON public.dm_participants (user_id);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_messages_conv_idx ON public.dm_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_messages_sender_idx ON public.dm_messages (sender_id, created_at DESC);

-- Dipakai policy RLS supaya tidak rekursif.
CREATE OR REPLACE FUNCTION public.is_dm_member(_conv uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.dm_participants WHERE conversation_id = _conv AND user_id = _uid);
$$;

-- Membuka percakapan dengan pengguna lain (membuatnya kalau belum ada). Gagal kalau pengguna itu memblokir pemanggil.
CREATE OR REPLACE FUNCTION public.dm_get_or_create(_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  pair text;
  cid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Masuk dulu.'; END IF;
  IF _other IS NULL OR _other = me THEN RAISE EXCEPTION 'Pilih pengguna lain.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _other) THEN RAISE EXCEPTION 'Pengguna tidak ditemukan.'; END IF;
  IF EXISTS (SELECT 1 FROM public.feed_user_blocks WHERE user_id = _other AND target_id = me AND kind = 'block') THEN
    RAISE EXCEPTION 'Pengguna ini tidak menerima pesan darimu.';
  END IF;
  pair := least(me::text, _other::text) || ':' || greatest(me::text, _other::text);
  SELECT id INTO cid FROM public.dm_conversations WHERE pair_key = pair;
  IF cid IS NULL THEN
    INSERT INTO public.dm_conversations (pair_key) VALUES (pair) ON CONFLICT (pair_key) DO NOTHING RETURNING id INTO cid;
    IF cid IS NULL THEN SELECT id INTO cid FROM public.dm_conversations WHERE pair_key = pair; END IF;
  END IF;
  INSERT INTO public.dm_participants (conversation_id, user_id) VALUES (cid, me), (cid, _other) ON CONFLICT DO NOTHING;
  RETURN cid;
END $$;
REVOKE EXECUTE ON FUNCTION public.dm_get_or_create(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_get_or_create(uuid) TO authenticated;

-- Pemblokir tidak bisa dikirimi pesan oleh yang diblokir; batas 30 pesan per menit per pengirim.
CREATE OR REPLACE FUNCTION public.dm_messages_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  other uuid;
BEGIN
  SELECT user_id INTO other FROM public.dm_participants
    WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id LIMIT 1;
  IF other IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.feed_user_blocks WHERE user_id = other AND target_id = NEW.sender_id AND kind = 'block'
  ) THEN
    RAISE EXCEPTION 'Pengguna ini tidak menerima pesan darimu.';
  END IF;
  IF (SELECT count(*) FROM public.dm_messages WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Terlalu cepat, tunggu sebentar sebelum mengirim lagi.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dm_messages_guard ON public.dm_messages;
CREATE TRIGGER dm_messages_guard BEFORE INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.dm_messages_guard();

CREATE OR REPLACE FUNCTION public.dm_messages_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dm_conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS dm_messages_after_insert ON public.dm_messages;
CREATE TRIGGER dm_messages_after_insert AFTER INSERT ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.dm_messages_after_insert();

-- Kotak masuk: percakapan yang sudah punya pesan, terbaru di atas, dengan jumlah pesan belum dibaca.
-- Berjalan sebagai pemanggil, jadi RLS tetap berlaku.
CREATE OR REPLACE FUNCTION public.dm_inbox()
RETURNS TABLE (
  conversation_id uuid, other_id uuid, username text, display_name text, avatar_url text,
  last_body text, last_sender uuid, last_at timestamptz, unread bigint
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, o.user_id, pr.username, pr.display_name, pr.avatar_url,
         lm.body, lm.sender_id, lm.created_at,
         (SELECT count(*) FROM public.dm_messages m
            WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid() AND m.created_at > me.last_read_at)
  FROM public.dm_participants me
  JOIN public.dm_conversations c ON c.id = me.conversation_id
  JOIN public.dm_participants o ON o.conversation_id = c.id AND o.user_id <> me.user_id
  JOIN public.profiles pr ON pr.id = o.user_id
  JOIN LATERAL (
    SELECT m.body, m.sender_id, m.created_at FROM public.dm_messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE me.user_id = auth.uid()
  ORDER BY lm.created_at DESC
  LIMIT 100;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_inbox() TO authenticated;

-- Jumlah percakapan yang punya pesan belum dibaca (untuk lencana di header).
CREATE OR REPLACE FUNCTION public.dm_unread_count()
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(DISTINCT m.conversation_id)
  FROM public.dm_messages m
  JOIN public.dm_participants me ON me.conversation_id = m.conversation_id AND me.user_id = auth.uid()
  WHERE m.sender_id <> auth.uid() AND m.created_at > me.last_read_at;
$$;
REVOKE EXECUTE ON FUNCTION public.dm_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_unread_count() TO authenticated;

-- ============================================================
-- 5) Row Level Security
-- ============================================================
ALTER TABLE public.feed_user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_autopost_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_autoposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- Senyap/blokir: hanya pemilik yang melihat dan mengubah barisnya (yang diblokir tidak tahu).
DROP POLICY IF EXISTS "feed_user_blocks own" ON public.feed_user_blocks;
CREATE POLICY "feed_user_blocks own" ON public.feed_user_blocks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Laporan: pelapor melihat laporannya sendiri, admin melihat semua. Hanya admin yang boleh menutup laporan.
DROP POLICY IF EXISTS "feed_reports insert own" ON public.feed_reports;
CREATE POLICY "feed_reports insert own" ON public.feed_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "feed_reports read own or admin" ON public.feed_reports;
CREATE POLICY "feed_reports read own or admin" ON public.feed_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "feed_reports update admin" ON public.feed_reports;
CREATE POLICY "feed_reports update admin" ON public.feed_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
REVOKE UPDATE, DELETE ON public.feed_reports FROM anon, authenticated;
GRANT UPDATE (status, action, resolved_by, resolved_at) ON public.feed_reports TO authenticated;
REVOKE INSERT ON public.feed_reports FROM anon;

-- Auto-post: pemilik repo (publik) mengatur sendiri; baris tidak bisa diubah klien (last_posted_at hanya oleh trigger).
DROP POLICY IF EXISTS "feed_autopost_repos read own" ON public.feed_autopost_repos;
CREATE POLICY "feed_autopost_repos read own" ON public.feed_autopost_repos FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "feed_autopost_repos insert own public repo" ON public.feed_autopost_repos;
CREATE POLICY "feed_autopost_repos insert own public repo" ON public.feed_autopost_repos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND r.owner_id = auth.uid() AND NOT r.is_private
  ));
DROP POLICY IF EXISTS "feed_autopost_repos delete own" ON public.feed_autopost_repos;
CREATE POLICY "feed_autopost_repos delete own" ON public.feed_autopost_repos FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE UPDATE ON public.feed_autopost_repos FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.feed_autopost_repos FROM anon;

-- Penanda post otomatis dibaca siapa saja selama repo-nya bisa dilihat pembaca; hanya trigger yang menulis.
DROP POLICY IF EXISTS "feed_autoposts read visible repo" ON public.feed_autoposts;
CREATE POLICY "feed_autoposts read visible repo" ON public.feed_autoposts FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.repositories r WHERE r.id = repo_id AND (NOT r.is_private OR r.owner_id = auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.feed_autoposts FROM anon, authenticated;

-- Pesan langsung: hanya dua peserta yang melihat. Percakapan dan peserta dibuat lewat dm_get_or_create, bukan oleh klien.
DROP POLICY IF EXISTS "dm_conversations read member" ON public.dm_conversations;
CREATE POLICY "dm_conversations read member" ON public.dm_conversations FOR SELECT TO authenticated
  USING (public.is_dm_member(id, auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.dm_conversations FROM anon, authenticated;
REVOKE ALL ON public.dm_conversations FROM anon;

DROP POLICY IF EXISTS "dm_participants read member" ON public.dm_participants;
CREATE POLICY "dm_participants read member" ON public.dm_participants FOR SELECT TO authenticated
  USING (public.is_dm_member(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "dm_participants update own" ON public.dm_participants;
CREATE POLICY "dm_participants update own" ON public.dm_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.dm_participants FROM anon, authenticated;
GRANT UPDATE (last_read_at) ON public.dm_participants TO authenticated;
REVOKE ALL ON public.dm_participants FROM anon;

DROP POLICY IF EXISTS "dm_messages read member" ON public.dm_messages;
CREATE POLICY "dm_messages read member" ON public.dm_messages FOR SELECT TO authenticated
  USING (public.is_dm_member(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "dm_messages insert own" ON public.dm_messages;
CREATE POLICY "dm_messages insert own" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_dm_member(conversation_id, auth.uid()));
DROP POLICY IF EXISTS "dm_messages delete own" ON public.dm_messages;
CREATE POLICY "dm_messages delete own" ON public.dm_messages FOR DELETE TO authenticated USING (sender_id = auth.uid());
REVOKE UPDATE ON public.dm_messages FROM anon, authenticated;
REVOKE ALL ON public.dm_messages FROM anon;
