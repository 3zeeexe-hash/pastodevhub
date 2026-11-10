-- ============ Platform payment settings ============
CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_name text,
  account_number text,
  account_name text,
  qris_url text,
  payment_instructions text NOT NULL DEFAULT '',
  fee_percent numeric NOT NULL DEFAULT 10 CHECK (fee_percent >= 0 AND fee_percent <= 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES (1);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings admin insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "settings admin update" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ Developer profile extras ============
CREATE TABLE public.portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  image_url text,
  link_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolio_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_items TO authenticated;
GRANT ALL ON public.portfolio_items TO service_role;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio read" ON public.portfolio_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "portfolio own insert" ON public.portfolio_items FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "portfolio own update" ON public.portfolio_items FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "portfolio own delete" ON public.portfolio_items FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TABLE public.stores (
  owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  html text NOT NULL DEFAULT '' CHECK (char_length(html) <= 500000),
  use_custom boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores read" ON public.stores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "stores own insert" ON public.stores FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "stores own update" ON public.stores FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "stores own delete" ON public.stores FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============ Hosted files ============
CREATE TABLE public.hosted_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('html','file','image')),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  storage_path text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size bigint NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hosted_files_owner_idx ON public.hosted_files (owner_id, kind, created_at DESC);
GRANT SELECT ON public.hosted_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hosted_files TO authenticated;
GRANT ALL ON public.hosted_files TO service_role;
ALTER TABLE public.hosted_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosted read" ON public.hosted_files FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "hosted own insert" ON public.hosted_files FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND split_part(storage_path, '/', 1) = auth.uid()::text);
CREATE POLICY "hosted own update" ON public.hosted_files FOR UPDATE TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND split_part(storage_path, '/', 1) = auth.uid()::text);
CREATE POLICY "hosted own delete" ON public.hosted_files FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.count_hosted_view(_slug text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.hosted_files SET views = views + 1 WHERE slug = _slug $$;
GRANT EXECUTE ON FUNCTION public.count_hosted_view(text) TO anon, authenticated;

-- ============ Karya (digital products) ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  category text NOT NULL DEFAULT 'lainnya',
  tags text[] NOT NULL DEFAULT '{}',
  price integer NOT NULL DEFAULT 0 CHECK (price = 0 OR price >= 1000),
  cover_url text,
  demo_url text,
  file_path text,
  file_name text,
  file_size bigint,
  download_count integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_owner_idx ON public.products (owner_id);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.products FOR SELECT TO anon, authenticated USING (is_published OR owner_id = auth.uid());
CREATE POLICY "products dev insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.is_developer(auth.uid()) AND download_count = 0
    AND (file_path IS NULL OR split_part(file_path, '/', 1) = auth.uid()::text));
CREATE POLICY "products own update" ON public.products FOR UPDATE TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND (file_path IS NULL OR split_part(file_path, '/', 1) = auth.uid()::text));
CREATE POLICY "products own delete" ON public.products FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.products_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('pastodev.market_system', true) = 'on' THEN RETURN NEW; END IF;
  NEW.download_count := OLD.download_count; NEW.owner_id := OLD.owner_id;
  RETURN NEW;
END $$;
CREATE TRIGGER products_guard BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_guard();

-- ============ Jasa (services) ============
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 300),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  category text NOT NULL DEFAULT 'lainnya',
  price_from integer NOT NULL DEFAULT 0 CHECK (price_from >= 0),
  delivery_days integer NOT NULL DEFAULT 7 CHECK (delivery_days BETWEEN 1 AND 365),
  cover_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_owner_idx ON public.services (owner_id);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services read" ON public.services FOR SELECT TO anon, authenticated USING (is_active OR owner_id = auth.uid());
CREATE POLICY "services dev insert" ON public.services FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.is_developer(auth.uid()));
CREATE POLICY "services own update" ON public.services FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "services own delete" ON public.services FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Orders ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('product','service')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  brief text NOT NULL DEFAULT '',
  amount integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  fee_amount integer NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  status text NOT NULL CHECK (status IN ('requested','declined','awaiting_payment','payment_review','in_progress','delivered','completed','cancelled')),
  payment_proof_path text,
  payment_note text,
  admin_note text,
  delivery_note text,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_buyer_idx ON public.orders (buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON public.orders (seller_id, created_at DESC);
CREATE INDEX orders_status_idx ON public.orders (status);

CREATE OR REPLACE FUNCTION public.can_access_order(_order_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = _order_id AND (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))) $$;

GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders participants read" ON public.orders FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_messages_order_idx ON public.order_messages (order_id, created_at);
GRANT SELECT, INSERT ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order messages read" ON public.order_messages FOR SELECT TO authenticated USING (public.can_access_order(order_id));
CREATE POLICY "order messages send" ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND is_system = false AND public.can_access_order(order_id));

CREATE OR REPLACE FUNCTION public.order_log(_order_id uuid, _body text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ INSERT INTO public.order_messages (order_id, sender_id, body, is_system) VALUES (_order_id, auth.uid(), _body, true) $$;
REVOKE EXECUTE ON FUNCTION public.order_log(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_fee(_amount integer)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT round(_amount * coalesce((SELECT fee_percent FROM public.app_settings WHERE id = 1), 10) / 100)::integer $$;

CREATE OR REPLACE FUNCTION public.can_download_product(_product_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = _product_id AND (
      p.owner_id = auth.uid()
      OR (p.price = 0 AND p.is_published AND auth.uid() IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.orders o WHERE o.product_id = p.id AND o.buyer_id = auth.uid() AND o.status = 'completed')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_download_product_path(_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.products WHERE file_path = _path AND public.can_download_product(id)) $$;

CREATE OR REPLACE FUNCTION public.record_download(_product_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_download_product(_product_id) THEN RETURN; END IF;
  PERFORM set_config('pastodev.market_system', 'on', true);
  UPDATE public.products SET download_count = download_count + 1 WHERE id = _product_id;
  PERFORM set_config('pastodev.market_system', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.products; oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.request_service(_service_id uuid, _brief text, _budget integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s public.services; oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.respond_service_order(_order_id uuid, _accept boolean, _amount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.seller_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya developer pesanan ini'; END IF;
  IF o.status <> 'requested' THEN RAISE EXCEPTION 'Pesanan sudah dijawab'; END IF;
  IF _accept THEN
    IF _amount IS NULL OR _amount < 1000 THEN RAISE EXCEPTION 'Harga minimal Rp1.000'; END IF;
    UPDATE public.orders SET status = 'awaiting_payment', amount = _amount, fee_amount = public.platform_fee(_amount) WHERE id = o.id;
    PERFORM public.order_log(o.id, 'Developer menerima pesanan. Menunggu pembayaran client.');
  ELSE
    UPDATE public.orders SET status = 'declined' WHERE id = o.id;
    PERFORM public.order_log(o.id, 'Developer menolak pesanan.');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_payment(_order_id uuid, _proof_path text, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya client pesanan ini'; END IF;
  IF o.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'Pesanan tidak menunggu pembayaran'; END IF;
  IF _proof_path IS NULL OR split_part(_proof_path, '/', 1) <> auth.uid()::text THEN RAISE EXCEPTION 'Bukti pembayaran tidak valid'; END IF;
  UPDATE public.orders SET status = 'payment_review', payment_proof_path = _proof_path, payment_note = left(coalesce(_note, ''), 1000), admin_note = NULL WHERE id = o.id;
  PERFORM public.order_log(o.id, 'Client mengunggah bukti pembayaran. Menunggu verifikasi admin.');
END $$;

CREATE OR REPLACE FUNCTION public.review_payment(_order_id uuid, _approve boolean, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pesanan tidak ditemukan'; END IF;
  IF o.status <> 'payment_review' THEN RAISE EXCEPTION 'Pesanan tidak sedang diverifikasi'; END IF;
  IF _approve THEN
    IF o.kind = 'product' THEN
      UPDATE public.orders SET status = 'completed', paid_at = now(), completed_at = now(), admin_note = nullif(_note, '') WHERE id = o.id;
      PERFORM public.order_log(o.id, 'Pembayaran disetujui admin. File karya sudah bisa diunduh.');
    ELSE
      UPDATE public.orders SET status = 'in_progress', paid_at = now(), admin_note = nullif(_note, '') WHERE id = o.id;
      PERFORM public.order_log(o.id, 'Pembayaran disetujui admin. Developer mulai mengerjakan.');
    END IF;
  ELSE
    UPDATE public.orders SET status = 'awaiting_payment', admin_note = coalesce(nullif(_note, ''), 'Bukti pembayaran ditolak.') WHERE id = o.id;
    PERFORM public.order_log(o.id, 'Bukti pembayaran ditolak admin. Silakan unggah ulang.');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.deliver_order(_order_id uuid, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.seller_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya developer pesanan ini'; END IF;
  IF o.status <> 'in_progress' THEN RAISE EXCEPTION 'Pesanan belum dikerjakan'; END IF;
  UPDATE public.orders SET status = 'delivered', delivery_note = left(coalesce(_note, ''), 8000) WHERE id = o.id;
  PERFORM public.order_log(o.id, 'Developer mengirim hasil pekerjaan.');
END $$;

CREATE OR REPLACE FUNCTION public.complete_order(_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya client pesanan ini'; END IF;
  IF o.status <> 'delivered' THEN RAISE EXCEPTION 'Hasil belum dikirim'; END IF;
  UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = o.id;
  PERFORM public.order_log(o.id, 'Client menandai pesanan selesai.');
END $$;

CREATE OR REPLACE FUNCTION public.request_revision(_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya client pesanan ini'; END IF;
  IF o.status <> 'delivered' THEN RAISE EXCEPTION 'Hasil belum dikirim'; END IF;
  UPDATE public.orders SET status = 'in_progress' WHERE id = o.id;
  PERFORM public.order_log(o.id, 'Client meminta revisi.');
END $$;

CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya client pesanan ini'; END IF;
  IF o.status NOT IN ('requested','awaiting_payment') THEN RAISE EXCEPTION 'Pesanan tidak bisa dibatalkan'; END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = o.id;
  PERFORM public.order_log(o.id, 'Client membatalkan pesanan.');
END $$;

-- ============ Payouts ============
CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
  admin_note text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts own or admin read" ON public.payouts FOR SELECT TO authenticated
  USING (developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.developer_balance(_user_id uuid)
 RETURNS TABLE (earned integer, on_hold integer, paid_out integer, pending integer, available integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE e integer; h integer; p integer; q integer;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Tidak diizinkan'; END IF;
  SELECT coalesce(sum(amount - fee_amount), 0) INTO e FROM public.orders WHERE seller_id = _user_id AND status = 'completed';
  SELECT coalesce(sum(amount - fee_amount), 0) INTO h FROM public.orders WHERE seller_id = _user_id AND status IN ('in_progress','delivered');
  SELECT coalesce(sum(amount), 0) INTO p FROM public.payouts WHERE developer_id = _user_id AND status = 'paid';
  SELECT coalesce(sum(amount), 0) INTO q FROM public.payouts WHERE developer_id = _user_id AND status = 'requested';
  RETURN QUERY SELECT e, h, p, q, greatest(e - p - q, 0);
END $$;

CREATE OR REPLACE FUNCTION public.request_payout(_amount integer, _bank_name text, _account_number text, _account_name text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE avail integer; pid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Harus masuk'; END IF;
  IF _amount IS NULL OR _amount < 10000 THEN RAISE EXCEPTION 'Minimal pencairan Rp10.000'; END IF;
  IF coalesce(trim(_bank_name), '') = '' OR coalesce(trim(_account_number), '') = '' OR coalesce(trim(_account_name), '') = '' THEN
    RAISE EXCEPTION 'Lengkapi data rekening';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('payout:' || auth.uid()::text));
  SELECT b.available INTO avail FROM public.developer_balance(auth.uid()) b;
  IF _amount > avail THEN RAISE EXCEPTION 'Jumlah melebihi saldo tersedia'; END IF;
  INSERT INTO public.payouts (developer_id, amount, bank_name, account_number, account_name)
  VALUES (auth.uid(), _amount, left(trim(_bank_name), 60), left(trim(_account_number), 40), left(trim(_account_name), 120))
  RETURNING id INTO pid;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.process_payout(_payout_id uuid, _approve boolean, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Khusus admin'; END IF;
  UPDATE public.payouts SET status = CASE WHEN _approve THEN 'paid' ELSE 'rejected' END,
    admin_note = nullif(_note, ''), processed_at = now()
   WHERE id = _payout_id AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengajuan tidak ditemukan atau sudah diproses'; END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.buy_product(uuid), public.request_service(uuid, text, integer),
  public.respond_service_order(uuid, boolean, integer), public.submit_payment(uuid, text, text),
  public.review_payment(uuid, boolean, text), public.deliver_order(uuid, text), public.complete_order(uuid),
  public.request_revision(uuid), public.cancel_order(uuid), public.developer_balance(uuid),
  public.request_payout(integer, text, text, text), public.process_payout(uuid, boolean, text),
  public.record_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_product(uuid), public.request_service(uuid, text, integer),
  public.respond_service_order(uuid, boolean, integer), public.submit_payment(uuid, text, text),
  public.review_payment(uuid, boolean, text), public.deliver_order(uuid, text), public.complete_order(uuid),
  public.request_revision(uuid), public.cancel_order(uuid), public.developer_balance(uuid),
  public.request_payout(integer, text, text, text), public.process_payout(uuid, boolean, text),
  public.record_download(uuid) TO authenticated;

-- ============ Freelance jobs ============
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 8000),
  category text NOT NULL DEFAULT 'website',
  skills text[] NOT NULL DEFAULT '{}',
  budget_min integer NOT NULL DEFAULT 0 CHECK (budget_min >= 0),
  budget_max integer NOT NULL DEFAULT 0 CHECK (budget_max >= 0),
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  hired_application_id uuid,
  applications_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_status_created_idx ON public.jobs (status, created_at DESC);
CREATE INDEX jobs_client_idx ON public.jobs (client_id);
GRANT SELECT ON public.jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs public read" ON public.jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "jobs client insert" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND public.is_client(auth.uid()) AND status = 'open' AND hired_application_id IS NULL AND applications_count = 0);
CREATE POLICY "jobs owner update" ON public.jobs FOR UPDATE TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
CREATE POLICY "jobs owner delete" ON public.jobs FOR DELETE TO authenticated USING (client_id = auth.uid());
CREATE TRIGGER jobs_touch BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.jobs_guard_update()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('pastodev.job_system', true) = 'on' THEN RETURN NEW; END IF;
  NEW.applications_count := OLD.applications_count;
  NEW.hired_application_id := OLD.hired_application_id;
  NEW.client_id := OLD.client_id;
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN NEW.status := OLD.status; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_guard BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.jobs_guard_update();

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  developer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_letter text NOT NULL CHECK (char_length(cover_letter) BETWEEN 20 AND 4000),
  bid_amount integer NOT NULL DEFAULT 0 CHECK (bid_amount >= 0),
  est_days integer NOT NULL DEFAULT 7 CHECK (est_days BETWEEN 1 AND 365),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, developer_id)
);
CREATE INDEX job_applications_dev_idx ON public.job_applications (developer_id);

CREATE OR REPLACE FUNCTION public.job_owner(_job_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT client_id FROM public.jobs WHERE id = _job_id $$;

CREATE OR REPLACE FUNCTION public.job_is_open(_job_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.jobs WHERE id = _job_id AND status = 'open') $$;

GRANT SELECT, INSERT ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications participants read" ON public.job_applications FOR SELECT TO authenticated
  USING (developer_id = auth.uid() OR public.job_owner(job_id) = auth.uid());
CREATE POLICY "applications developer insert" ON public.job_applications FOR INSERT TO authenticated
  WITH CHECK (developer_id = auth.uid() AND status = 'pending' AND public.is_developer(auth.uid())
    AND public.job_is_open(job_id) AND public.job_owner(job_id) <> auth.uid());
CREATE TRIGGER job_applications_touch BEFORE UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.job_applications_count()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('pastodev.job_system', 'on', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.jobs SET applications_count = applications_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.jobs SET applications_count = greatest(applications_count - 1, 0) WHERE id = OLD.job_id;
  END IF;
  PERFORM set_config('pastodev.job_system', 'off', true);
  RETURN NULL;
END $$;
CREATE TRIGGER job_applications_counter AFTER INSERT OR DELETE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.job_applications_count();

CREATE OR REPLACE FUNCTION public.respond_job_application(_application_id uuid, _accept boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a public.job_applications; j public.jobs;
BEGIN
  SELECT * INTO a FROM public.job_applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lamaran tidak ditemukan'; END IF;
  SELECT * INTO j FROM public.jobs WHERE id = a.job_id FOR UPDATE;
  IF j.client_id <> auth.uid() THEN RAISE EXCEPTION 'Hanya pemilik lowongan'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Lamaran sudah dijawab'; END IF;
  IF _accept THEN
    IF j.status <> 'open' THEN RAISE EXCEPTION 'Lowongan sudah tidak dibuka'; END IF;
    UPDATE public.job_applications SET status = 'accepted' WHERE id = a.id;
    UPDATE public.job_applications SET status = 'rejected' WHERE job_id = j.id AND id <> a.id AND status = 'pending';
    PERFORM set_config('pastodev.job_system', 'on', true);
    UPDATE public.jobs SET status = 'in_progress', hired_application_id = a.id WHERE id = j.id;
    PERFORM set_config('pastodev.job_system', 'off', true);
  ELSE
    UPDATE public.job_applications SET status = 'rejected' WHERE id = a.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_job_application(_application_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.job_applications SET status = 'withdrawn'
   WHERE id = _application_id AND developer_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Lamaran tidak bisa ditarik'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_job_application(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_job_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_job_application(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_job_application(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_application_participant(_application_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_applications a JOIN public.jobs j ON j.id = a.job_id
    WHERE a.id = _application_id AND (a.developer_id = auth.uid() OR j.client_id = auth.uid())
  )
$$;

CREATE TABLE public.job_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_messages_app_idx ON public.job_messages (application_id, created_at);
GRANT SELECT, INSERT ON public.job_messages TO authenticated;
GRANT ALL ON public.job_messages TO service_role;
ALTER TABLE public.job_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job messages participants read" ON public.job_messages FOR SELECT TO authenticated
  USING (public.is_application_participant(application_id));
CREATE POLICY "job messages participants send" ON public.job_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_application_participant(application_id));

-- ============ File storage rules ============
CREATE POLICY "media own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "media own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "media own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "product files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-files' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.can_download_product_path(name)));
CREATE POLICY "product files own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product files own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "payment proofs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "payment proofs own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "hosting public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hosting' AND EXISTS (SELECT 1 FROM public.hosted_files h WHERE h.storage_path = name));
CREATE POLICY "hosting own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hosting' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "hosting own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hosting' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "hosting own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hosting' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "hosting own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hosting' AND (storage.foldername(name))[1] = auth.uid()::text);
