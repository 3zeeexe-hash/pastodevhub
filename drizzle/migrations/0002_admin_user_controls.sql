CREATE TABLE public.user_bans (
  user_id uuid PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  banned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own ban or admin read" ON public.user_bans FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_banned(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = _user)
$$;
REVOKE EXECUTE ON FUNCTION public.is_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO authenticated, service_role;

-- Blocked accounts cannot add or change content anywhere.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repositories','repo_files','commits','issues','issue_comments','pull_requests','pr_comments','posts','comments',
    'jobs','job_applications','job_messages','products','services','portfolio_items','hosted_files','stores','order_messages','stars','follows','git_tokens']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('CREATE POLICY "Not banned: add" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_banned(auth.uid()))', t);
      EXECUTE format('CREATE POLICY "Not banned: edit" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_banned(auth.uid()))', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(_user uuid, _banned boolean, _reason text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  IF _user = auth.uid() THEN RAISE EXCEPTION 'Tidak bisa memblokir akun sendiri'; END IF;
  IF _banned THEN
    IF public.has_role(_user, 'admin') THEN RAISE EXCEPTION 'Cabut role admin akun ini dulu sebelum memblokir'; END IF;
    INSERT INTO public.user_bans (user_id, reason, banned_by)
    VALUES (_user, left(coalesce(_reason, ''), 500), auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  ELSE
    DELETE FROM public.user_bans WHERE user_id = _user;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_ban(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_admin(_user uuid, _admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  IF _admin THEN
    IF public.is_banned(_user) THEN RAISE EXCEPTION 'Buka blokir akun ini dulu'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (_user, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    IF _user = auth.uid() THEN RAISE EXCEPTION 'Tidak bisa mencabut role admin akun sendiri'; END IF;
    DELETE FROM public.user_roles WHERE user_id = _user AND role = 'admin';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin(uuid, boolean) TO authenticated;

CREATE POLICY "hosting admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hosting' AND public.has_role(auth.uid(), 'admin'));