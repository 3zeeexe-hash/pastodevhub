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
       OR NEW.image_url !~ ('^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.(supabase\.co|lovable\.cloud)/storage/v1/object/sign/media/' || NEW.sender_id::text || '/[^?#]+\?token=[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Gambar harus diunggah lewat Pastodev.';
    END IF;
  END IF;
  RETURN NEW;
END $$;