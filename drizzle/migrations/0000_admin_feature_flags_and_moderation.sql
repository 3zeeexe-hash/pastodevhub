-- Feature switches: a missing row means the feature is on.
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.feature_flags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads feature switches" ON public.feature_flags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins add feature switches" ON public.feature_flags FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins change feature switches" ON public.feature_flags FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove feature switches" ON public.feature_flags FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.feature_enabled(_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT enabled FROM public.feature_flags WHERE key = _key), true)
$$;
REVOKE ALL ON FUNCTION public.feature_enabled(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text) TO anon, authenticated, service_role;

-- True when the feature is on, or the caller is an admin.
CREATE OR REPLACE FUNCTION public.feature_allowed(_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.feature_enabled(_key) OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
$$;
REVOKE ALL ON FUNCTION public.feature_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_allowed(text) TO anon, authenticated, service_role;

-- Switched-off features block new content (restrictive = must pass in addition to existing rules).
CREATE POLICY "Feature on: repositories" ON public.repositories AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('repos'));
CREATE POLICY "Feature on: issues" ON public.issues AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('repos'));
CREATE POLICY "Feature on: pull requests" ON public.pull_requests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('repos'));
CREATE POLICY "Feature on: posts" ON public.posts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('discuss'));
CREATE POLICY "Feature on: comments" ON public.comments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('discuss'));
CREATE POLICY "Feature on: jobs" ON public.jobs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('jobs'));
CREATE POLICY "Feature on: job applications" ON public.job_applications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('jobs'));
CREATE POLICY "Feature on: products" ON public.products AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('karya'));
CREATE POLICY "Feature on: services" ON public.services AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('jasa'));
CREATE POLICY "Feature on: portfolio" ON public.portfolio_items AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('jasa'));
CREATE POLICY "Feature on: hosted files" ON public.hosted_files AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('hosting'));
CREATE POLICY "Feature on: stores (add)" ON public.stores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.feature_allowed('toko'));
CREATE POLICY "Feature on: stores (edit)" ON public.stores AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.feature_allowed('toko')) WITH CHECK (public.feature_allowed('toko'));

-- Orders are created by these functions; same bodies plus the feature check.
CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p public.products; oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF NOT public.feature_allowed('karya') THEN RAISE EXCEPTION 'Fitur karya sedang dinonaktifkan admin'; END IF;
  SELECT * INTO p FROM public.products WHERE id = _product_id AND is_published;
  IF NOT FOUND THEN RAISE EXCEPTION 'Karya tidak ditemukan'; END IF;
  IF p.owner_id = auth.uid() THEN RAISE EXCEPTION 'Ini karya kamu sendiri'; END IF;
  IF p.price = 0 THEN RAISE EXCEPTION 'Karya ini gratis, langsung unduh saja'; END IF;
  SELECT id INTO oid FROM public.orders
   WHERE product_id = p.id AND buyer_id = auth.uid() AND status IN ('awaiting_payment','payment_review','completed')
   ORDER BY created_at DESC LIMIT 1;
  IF oid IS NOT NULL THEN RETURN oid; END IF;
  INSERT INTO public.orders (kind, product_id, buyer_id, seller_id, title, amount, fee_amount, status)
  VALUES ('product', p.id, auth.uid(), p.owner_id, p.title, p.price, public.platform_fee(p.price), 'awaiting_payment')
  RETURNING id INTO oid;
  PERFORM public.order_log(oid, 'Pesanan karya dibuat. Silakan bayar dan unggah bukti transfer.');
  RETURN oid;
END $function$;

CREATE OR REPLACE FUNCTION public.request_service(_service_id uuid, _brief text, _budget integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.services; oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF NOT public.feature_allowed('jasa') THEN RAISE EXCEPTION 'Fitur jasa sedang dinonaktifkan admin'; END IF;
  SELECT * INTO s FROM public.services WHERE id = _service_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jasa tidak ditemukan'; END IF;
  IF s.owner_id = auth.uid() THEN RAISE EXCEPTION 'Ini jasa kamu sendiri'; END IF;
  IF char_length(coalesce(trim(_brief), '')) < 10 THEN RAISE EXCEPTION 'Jelaskan kebutuhanmu minimal 10 karakter'; END IF;
  IF _budget IS NOT NULL AND _budget < 0 THEN RAISE EXCEPTION 'Budget tidak valid'; END IF;
  INSERT INTO public.orders (kind, service_id, buyer_id, seller_id, title, brief, amount, status)
  VALUES ('service', s.id, auth.uid(), s.owner_id, s.title, left(trim(_brief), 8000), coalesce(_budget, s.price_from), 'requested')
  RETURNING id INTO oid;
  PERFORM public.order_log(oid, 'Permintaan jasa dikirim ke developer.');
  RETURN oid;
END $function$;

-- New accounts get a profile only while sign-up is open (the admin account is always allowed).
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE u auth.users;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN RETURN; END IF;
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT public.feature_enabled('signup')
     AND coalesce(u.raw_app_meta_data->>'pastodev_admin', '') <> 'true'
     AND NOT public.has_role(u.id, 'admin') THEN
    RAISE EXCEPTION 'Pendaftaran akun baru sedang ditutup';
  END IF;
  PERFORM public.handle_new_user_row(u);
END $function$;

-- Site-wide announcement banner.
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS announcement text;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS announcement_level text NOT NULL DEFAULT 'info';
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_announcement_level_check CHECK (announcement_level IN ('info','warning'));

-- Admin moderation access.
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all repositories" ON public.repositories FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update repositories" ON public.repositories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete repositories" ON public.repositories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete posts" ON public.posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete comments" ON public.comments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update jobs" ON public.jobs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete jobs" ON public.jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read job applications" ON public.job_applications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all products" ON public.products FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update products" ON public.products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read all services" ON public.services FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update services" ON public.services FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete services" ON public.services FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete portfolio items" ON public.portfolio_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete hosted files" ON public.hosted_files FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete stores" ON public.stores FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
