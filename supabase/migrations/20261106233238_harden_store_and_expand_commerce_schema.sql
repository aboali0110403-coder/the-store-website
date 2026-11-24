-- Mero Boutique: security hardening and commerce foundations.
-- This migration preserves existing products/orders and does not change existing product content.

-- 1) Remove the duplicate authenticated SELECT policy on products.
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins update products" ON public.products
  FOR UPDATE TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins delete products" ON public.products
  FOR DELETE TO authenticated USING (public.is_store_admin());

-- 2) Additional commerce structures.
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL CHECK (length(trim(image_url)) > 0),
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_url_key
  ON public.product_images(product_id, image_url);
CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary_per_product
  ON public.product_images(product_id) WHERE is_primary;

INSERT INTO public.product_images(product_id, image_url, alt_text, sort_order, is_primary)
SELECT p.id, p.image_url, p.image_alt, 0, true
FROM public.products p
WHERE length(trim(p.image_url)) > 0
ON CONFLICT (product_id, image_url) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  size text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  price_adjustment_egp numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(size)) > 0 OR length(trim(color)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_size_color_key
  ON public.product_variants(product_id, lower(size), lower(color));
CREATE INDEX IF NOT EXISTS product_variants_product_active_idx
  ON public.product_variants(product_id, is_active);

CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate text NOT NULL,
  area text NOT NULL DEFAULT '',
  fee_egp numeric(12,2) NOT NULL CHECK (fee_egp >= 0),
  estimated_min_days integer NOT NULL DEFAULT 1 CHECK (estimated_min_days >= 0),
  estimated_max_days integer NOT NULL DEFAULT 5 CHECK (estimated_max_days >= estimated_min_days),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(governorate)) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rates_governorate_area_key
  ON public.shipping_rates(lower(governorate), lower(area));

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  max_discount_egp numeric(12,2) CHECK (max_discount_egp IS NULL OR max_discount_egp >= 0),
  min_order_egp numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_order_egp >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  per_customer_limit integer CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code = upper(trim(code))),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_egp numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ALTER COLUMN shipping_egp SET DEFAULT 0;
UPDATE public.orders SET shipping_egp = 0 WHERE shipping_egp IS NULL;
UPDATE public.orders
  SET total_egp = GREATEST(0, subtotal_egp - discount_egp + COALESCE(shipping_egp,0))
  WHERE total_egp IS NULL;
ALTER TABLE public.orders ALTER COLUMN shipping_egp SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN total_egp SET DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN total_egp SET NOT NULL;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_egp_check CHECK (discount_egp >= 0);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_history_order_date_idx
  ON public.order_status_history(order_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'manual',
  provider_reference text,
  amount_egp numeric(12,2) NOT NULL CHECK (amount_egp >= 0),
  currency text NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx
  ON public.payment_transactions(order_id, created_at DESC);

-- 3) RLS for the new tables.
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view images for published products" ON public.product_images;
CREATE POLICY "Public can view images for published products" ON public.product_images
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true)
    OR public.is_store_admin()
  );
CREATE POLICY "Admins manage product images" ON public.product_images
  FOR ALL TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());

CREATE POLICY "Public can view active variants for published products" ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (
    is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true)
    OR public.is_store_admin()
  );
CREATE POLICY "Admins manage product variants" ON public.product_variants
  FOR ALL TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());

CREATE POLICY "Public can view active shipping rates" ON public.shipping_rates
  FOR SELECT TO anon, authenticated USING (is_active OR public.is_store_admin());
CREATE POLICY "Admins manage shipping rates" ON public.shipping_rates
  FOR ALL TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());

CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins view order status history" ON public.order_status_history
  FOR SELECT TO authenticated USING (public.is_store_admin());
CREATE POLICY "Admins manage payment transactions" ON public.payment_transactions
  FOR ALL TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());

REVOKE ALL ON public.product_images, public.product_variants, public.shipping_rates,
  public.coupons, public.order_status_history, public.payment_transactions FROM anon, authenticated;
GRANT SELECT ON public.product_images, public.product_variants, public.shipping_rates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images, public.product_variants, public.shipping_rates,
  public.coupons, public.payment_transactions TO authenticated;
GRANT SELECT ON public.coupons, public.order_status_history, public.payment_transactions TO authenticated;

-- 4) Updated-at and order-total maintenance.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_order_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.shipping_egp := COALESCE(NEW.shipping_egp, 0);
  NEW.discount_egp := COALESCE(NEW.discount_egp, 0);
  NEW.total_egp := GREATEST(0, NEW.subtotal_egp - NEW.discount_egp + NEW.shipping_egp);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_order_total() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history(order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_order_status_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS custom_design_requests_set_updated_at ON public.custom_design_requests;
CREATE TRIGGER custom_design_requests_set_updated_at BEFORE UPDATE ON public.custom_design_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS product_variants_set_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS shipping_rates_set_updated_at ON public.shipping_rates;
CREATE TRIGGER shipping_rates_set_updated_at BEFORE UPDATE ON public.shipping_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS coupons_set_updated_at ON public.coupons;
CREATE TRIGGER coupons_set_updated_at BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS payment_transactions_set_updated_at ON public.payment_transactions;
CREATE TRIGGER payment_transactions_set_updated_at BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS orders_calculate_total ON public.orders;
CREATE TRIGGER orders_calculate_total BEFORE INSERT OR UPDATE OF subtotal_egp, shipping_egp, discount_egp
  ON public.orders FOR EACH ROW EXECUTE FUNCTION public.calculate_order_total();
DROP TRIGGER IF EXISTS orders_record_status_history ON public.orders;
CREATE TRIGGER orders_record_status_history AFTER INSERT OR UPDATE OF status
  ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_order_status_history();

-- 5) Harden guest checkout: aggregate duplicate product lines and lock stock rows
-- in deterministic order so simultaneous checkouts cannot oversell ready stock.
CREATE OR REPLACE FUNCTION public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_governorate text,
  p_city_area text,
  p_address text,
  p_notes text,
  p_payment_method text,
  p_items jsonb
)
RETURNS TABLE(order_id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
BEGIN
  IF length(trim(coalesce(p_customer_name,''))) < 2 OR length(trim(p_customer_name)) > 120
     OR length(trim(coalesce(p_phone,''))) < 7 OR length(trim(p_phone)) > 20
     OR length(trim(coalesce(p_governorate,''))) < 2 OR length(trim(p_governorate)) > 100
     OR length(trim(coalesce(p_city_area,''))) < 2 OR length(trim(p_city_area)) > 120
     OR length(trim(coalesce(p_address,''))) < 8 OR length(trim(p_address)) > 500
     OR length(coalesce(p_email,'')) > 254 OR length(coalesce(p_notes,'')) > 1000 THEN
    RAISE EXCEPTION 'Please provide valid delivery details';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash_on_delivery','prepaid','deposit') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_items) AS x(value)
    WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object'
       OR coalesce(x.value->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(x.value->>'quantity','') !~ '^[0-9]+$'
       OR (x.value->>'quantity')::integer < 1
       OR (x.value->>'quantity')::integer > 20
       OR length(coalesce(x.value->>'size','')) > 50
       OR length(coalesce(x.value->>'color','')) > 50
  ) THEN
    RAISE EXCEPTION 'Invalid order item details';
  END IF;

  -- Lock each distinct product once, in a stable order.
  FOR v_product_id, v_qty IN
    SELECT (x.value->>'product_id')::uuid, sum((x.value->>'quantity')::integer)::integer
    FROM pg_catalog.jsonb_array_elements(p_items) AS x(value)
    GROUP BY (x.value->>'product_id')::uuid
    ORDER BY (x.value->>'product_id')::uuid
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND is_published = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A selected product is unavailable';
    END IF;

    IF v_product.production_type = 'ready' AND v_product.stock < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %', v_product.name_en;
    END IF;
  END LOOP;

  SELECT coalesce(sum(p.price_egp * (x.value->>'quantity')::integer),0)
    INTO v_subtotal
  FROM pg_catalog.jsonb_array_elements(p_items) AS x(value)
  JOIN public.products p ON p.id = (x.value->>'product_id')::uuid
  WHERE p.is_published = true;

  INSERT INTO public.orders(
    customer_name, phone, email, governorate, city_area, address, notes,
    payment_method, subtotal_egp
  )
  VALUES (
    trim(p_customer_name), trim(p_phone), nullif(trim(coalesce(p_email,'')),''),
    trim(p_governorate), trim(p_city_area), trim(p_address),
    nullif(trim(coalesce(p_notes,'')),''), p_payment_method, v_subtotal
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_published = true;

    INSERT INTO public.order_items(
      order_id, product_id, product_name_en, product_name_ar,
      size, color, quantity, unit_price_egp
    )
    VALUES (
      v_order_id, v_product.id, v_product.name_en, v_product.name_ar,
      coalesce(v_item->>'size',''), coalesce(v_item->>'color',''),
      (v_item->>'quantity')::integer, v_product.price_egp
    );

    IF v_product.production_type = 'ready' THEN
      UPDATE public.products
      SET stock = stock - (v_item->>'quantity')::integer
      WHERE id = v_product.id;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT o.id, o.order_number FROM public.orders o WHERE o.id = v_order_id;
END;
$$;

-- Keep guest checkout RPC intentionally callable by anon; table writes remain
-- unavailable directly and are performed only through this validated function.
REVOKE ALL ON FUNCTION public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) TO anon, authenticated;

-- Tighten custom-design submission input bounds while retaining guest submissions.
CREATE OR REPLACE FUNCTION public.submit_custom_design_request(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_garment_type text,
  p_preferred_fabric text,
  p_preferred_colors text,
  p_embroidery_style text,
  p_size_details text,
  p_description text,
  p_reference_image_urls text[],
  p_target_budget_egp numeric,
  p_needed_by date
)
RETURNS TABLE(request_id uuid, request_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF length(trim(coalesce(p_customer_name,''))) < 2 OR length(trim(p_customer_name)) > 120
     OR length(trim(coalesce(p_phone,''))) < 7 OR length(trim(p_phone)) > 20
     OR length(coalesce(p_email,'')) > 254
     OR length(trim(coalesce(p_garment_type,''))) < 2 OR length(trim(p_garment_type)) > 100
     OR length(trim(coalesce(p_description,''))) < 12 OR length(trim(p_description)) > 3000
     OR length(coalesce(p_preferred_fabric,'')) > 120
     OR length(coalesce(p_preferred_colors,'')) > 200
     OR length(coalesce(p_embroidery_style,'')) > 120
     OR length(coalesce(p_size_details,'')) > 500
     OR (p_target_budget_egp IS NOT NULL AND p_target_budget_egp < 0) THEN
    RAISE EXCEPTION 'Please complete valid custom design details';
  END IF;

  IF coalesce(array_length(p_reference_image_urls,1),0) > 5 THEN
    RAISE EXCEPTION 'A maximum of five reference images is allowed';
  END IF;

  INSERT INTO public.custom_design_requests(
    customer_name, phone, email, garment_type, preferred_fabric, preferred_colors,
    embroidery_style, size_details, description, reference_image_urls,
    target_budget_egp, needed_by
  )
  VALUES (
    trim(p_customer_name), trim(p_phone), nullif(trim(coalesce(p_email,'')),''),
    trim(p_garment_type), nullif(trim(coalesce(p_preferred_fabric,'')),''),
    nullif(trim(coalesce(p_preferred_colors,'')),''),
    nullif(trim(coalesce(p_embroidery_style,'')),''),
    nullif(trim(coalesce(p_size_details,'')),''), trim(p_description),
    coalesce(p_reference_image_urls,'{}'), p_target_budget_egp, p_needed_by
  )
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT r.id, r.request_number FROM public.custom_design_requests r WHERE r.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) TO anon, authenticated;
