ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.job_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.order_messages ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.dm_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.job_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.order_messages ALTER COLUMN body SET DEFAULT '';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, co.conname
    FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND co.contype = 'c'
      AND c.relname IN ('dm_messages','job_messages','order_messages')
      AND pg_get_constraintdef(co.oid) ILIKE '%char_length%body%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.dm_messages ADD CONSTRAINT dm_messages_content_check
  CHECK (char_length(body) <= 2000 AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL));
ALTER TABLE public.job_messages ADD CONSTRAINT job_messages_content_check
  CHECK (char_length(body) <= 4000 AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL));
ALTER TABLE public.order_messages ADD CONSTRAINT order_messages_content_check
  CHECK (char_length(body) <= 4000 AND (char_length(btrim(body)) > 0 OR image_url IS NOT NULL));

-- Gambar pesan harus berupa link bertanda tangan dari penyimpanan media Pastodev, di folder milik pengirim.
CREATE OR REPLACE FUNCTION public._chat_image_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.image_url := OLD.image_url;
    RETURN NEW;
  END IF;
  NEW.body := coalesce(NEW.body, '');
  IF NEW.image_url IS NOT NULL THEN
    IF NEW.sender_id IS NULL
       OR char_length(NEW.image_url) > 2000
       OR NEW.image_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/sign/media/' || NEW.sender_id::text || '/[^?#]+\?token=[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Gambar harus diunggah lewat Pastodev.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chat_image_guard ON public.dm_messages;
CREATE TRIGGER chat_image_guard BEFORE INSERT OR UPDATE ON public.dm_messages FOR EACH ROW EXECUTE FUNCTION public._chat_image_guard();
DROP TRIGGER IF EXISTS chat_image_guard ON public.job_messages;
CREATE TRIGGER chat_image_guard BEFORE INSERT OR UPDATE ON public.job_messages FOR EACH ROW EXECUTE FUNCTION public._chat_image_guard();
DROP TRIGGER IF EXISTS chat_image_guard ON public.order_messages;
CREATE TRIGGER chat_image_guard BEFORE INSERT OR UPDATE ON public.order_messages FOR EACH ROW EXECUTE FUNCTION public._chat_image_guard();

CREATE OR REPLACE FUNCTION public.dm_inbox()
 RETURNS TABLE(conversation_id uuid, other_id uuid, username text, display_name text, avatar_url text, last_body text, last_sender uuid, last_at timestamp with time zone, unread bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT c.id, o.user_id, pr.username, pr.display_name, pr.avatar_url,
         CASE WHEN btrim(lm.body) = '' AND lm.image_url IS NOT NULL THEN '📷 Foto'
              WHEN lm.image_url IS NOT NULL THEN '📷 ' || lm.body
              ELSE lm.body END,
         lm.sender_id, lm.created_at,
         (SELECT count(*) FROM public.dm_messages m
            WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid() AND m.created_at > me.last_read_at)
  FROM public.dm_participants me
  JOIN public.dm_conversations c ON c.id = me.conversation_id
  JOIN public.dm_participants o ON o.conversation_id = c.id AND o.user_id <> me.user_id
  JOIN public.profiles pr ON pr.id = o.user_id
  JOIN LATERAL (
    SELECT m.body, m.image_url, m.sender_id, m.created_at FROM public.dm_messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE me.user_id = auth.uid()
  ORDER BY lm.created_at DESC
  LIMIT 100;
$function$;