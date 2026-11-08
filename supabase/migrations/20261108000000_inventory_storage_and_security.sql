-- =====================================================================
-- Mero Boutique Database Migration
-- Version: 20261108000000_inventory_storage_and_security.sql
-- Description:
--   1. Schema tables, constraints, indexes & admin allowlist
--   2. Supabase Storage buckets (product-images & design-references) + RLS
--   3. Atomic submit_store_order RPC (strict stock locking for ready/limited,
--      no stock decrement for made_to_order, server-side verified pricing)
--   4. Secure public lookup_public_order RPC (sanitized tracking without private leaks)
--   5. submit_custom_design_request RPC
-- =====================================================================

-- 1. EXTENSIONS & SEQUENCES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1005;
CREATE SEQUENCE IF NOT EXISTS bespoke_request_seq START WITH 2001;

-- 2. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin_users"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 3. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  category text NOT NULL,
  category_ar text NOT NULL,
  price_egp numeric NOT NULL CHECK (price_egp >= 0),
  compare_at_egp numeric CHECK (compare_at_egp IS NULL OR compare_at_egp >= 0),
  image_url text,
  image_alt text,
  is_featured boolean NOT NULL DEFAULT false,
  description_en text,
  description_ar text,
  fabric_en text,
  fabric_ar text,
  embroidery_en text,
  embroidery_ar text,
  production_type text NOT NULL DEFAULT 'ready' CHECK (production_type IN ('ready', 'made_to_order', 'limited')),
  sizes text[] NOT NULL DEFAULT '{}',
  colors text[] NOT NULL DEFAULT '{}',
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_published ON public.products(is_published, sort_order);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published products"
  ON public.products
  FOR SELECT
  TO public
  USING (is_published = true OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin full access on products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 4. PRODUCT IMAGES (GALLERY)
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id, sort_order);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product images"
  ON public.product_images
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admin manage product images"
  ON public.product_images
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 5. PRODUCT VARIANTS (SIZES, COLORS & VARIANT STOCK)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size text NOT NULL,
  color text NOT NULL,
  sku text,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_size_color UNIQUE (product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active product variants"
  ON public.product_variants
  FOR SELECT
  TO public
  USING (is_active = true OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin manage product variants"
  ON public.product_variants
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 6. SHIPPING RATES
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate text NOT NULL UNIQUE,
  fee_egp numeric NOT NULL DEFAULT 60 CHECK (fee_egp >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active shipping rates"
  ON public.shipping_rates
  FOR SELECT
  TO public
  USING (is_active = true OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin manage shipping rates"
  ON public.shipping_rates
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 7. COUPONS
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_order_egp numeric NOT NULL DEFAULT 0 CHECK (min_order_egp >= 0),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage coupons"
  ON public.coupons
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 8. ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  governorate text NOT NULL,
  city_area text NOT NULL,
  address text NOT NULL,
  notes text,
  payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled')),
  subtotal_egp numeric NOT NULL DEFAULT 0 CHECK (subtotal_egp >= 0),
  shipping_egp numeric NOT NULL DEFAULT 0 CHECK (shipping_egp >= 0),
  discount_egp numeric NOT NULL DEFAULT 0 CHECK (discount_egp >= 0),
  total_egp numeric NOT NULL DEFAULT 0 CHECK (total_egp >= 0),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_en text NOT NULL,
  product_name_ar text NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  unit_price_egp numeric NOT NULL CHECK (unit_price_egp >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage order items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_order ON public.order_status_history(order_id, created_at ASC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage status history"
  ON public.order_status_history
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 9. CUSTOM DESIGN REQUESTS
CREATE TABLE IF NOT EXISTS public.custom_design_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  garment_type text NOT NULL,
  preferred_fabric text,
  preferred_colors text,
  embroidery_style text,
  size_details text,
  description text NOT NULL,
  reference_image_urls text[] NOT NULL DEFAULT '{}',
  target_budget_egp numeric,
  needed_by date,
  deposit_rate numeric NOT NULL DEFAULT 0.30,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'deposit_paid', 'in_progress', 'completed', 'cancelled')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_requests_number ON public.custom_design_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_custom_requests_created ON public.custom_design_requests(created_at DESC);

ALTER TABLE public.custom_design_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage custom design requests"
  ON public.custom_design_requests
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- 10. STORAGE BUCKETS & STORAGE RLS POLICIES
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('design-references', 'design-references', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Product images storage policies
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
CREATE POLICY "Admins can upload product images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images' AND
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
CREATE POLICY "Admins can update product images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images' AND
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;
CREATE POLICY "Admins can delete product images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images' AND
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Design references storage policies (private bucket: anyone can upload references, only admins can view)
DROP POLICY IF EXISTS "Public and guests can upload design references" ON storage.objects;
CREATE POLICY "Public and guests can upload design references"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'design-references');

DROP POLICY IF EXISTS "Admins can view design references" ON storage.objects;
CREATE POLICY "Admins can view design references"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'design-references' AND
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete design references" ON storage.objects;
CREATE POLICY "Admins can delete design references"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'design-references' AND
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- =====================================================================
-- 11. RPC: SUBMIT STORE ORDER
-- Atomic stock decrement for ready/limited products, zero decrement for
-- made_to_order, server-side verified pricing & shipping calculations.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_governorate text DEFAULT 'Cairo',
  p_city_area text DEFAULT '',
  p_address text DEFAULT '',
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash_on_delivery',
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_seq_val bigint;
  v_order_number text;
  v_item record;
  v_product record;
  v_variant record;
  v_subtotal numeric := 0;
  v_shipping numeric := 60;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_item_qty integer;
  v_item_pid uuid;
  v_item_size text;
  v_item_color text;
  v_coupon_code text;
  v_coupon record;
BEGIN
  -- Input validations
  IF length(trim(coalesce(p_customer_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters';
  END IF;

  IF length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'A valid phone number with at least 7 digits is required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Generate sequential order number
  v_seq_val := nextval('order_number_seq');
  v_order_number := 'MERO-' || lpad(v_seq_val::text, 4, '0');

  -- Resolve verified shipping rate from shipping_rates table
  SELECT fee_egp INTO v_shipping
  FROM public.shipping_rates
  WHERE lower(trim(governorate)) = lower(trim(p_governorate)) AND is_active = true
  LIMIT 1;

  IF v_shipping IS NULL THEN
    v_shipping := 60; -- Default Egyptian standard courier fee
  END IF;

  -- Process line items with row-level locks
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, size text, color text, quantity integer)
  LOOP
    v_item_qty := coalesce(v_item.quantity, 1);
    IF v_item_qty < 1 OR v_item_qty > 20 THEN
      RAISE EXCEPTION 'Item quantity must be between 1 and 20';
    END IF;

    -- Lock product row for atomic stock check and decrement
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % does not exist', v_item.product_id;
    END IF;

    IF NOT v_product.is_published THEN
      RAISE EXCEPTION 'Product "%" is not currently published', v_product.name_en;
    END IF;

    -- INVENTORY LOGIC:
    -- 'ready' and 'limited' require strict stock verification and atomic decrement.
    -- 'made_to_order' is produced on demand and MUST NOT decrement inventory or block order.
    IF v_product.production_type IN ('ready', 'limited') THEN
      IF v_product.stock < v_item_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product "%". Requested: %, Available: %',
          v_product.name_en, v_item_qty, v_product.stock;
      END IF;

      -- Check and decrement variant stock if variant exists
      IF v_item.size IS NOT NULL AND v_item.color IS NOT NULL THEN
        SELECT * INTO v_variant
        FROM public.product_variants
        WHERE product_id = v_product.id
          AND lower(trim(size)) = lower(trim(v_item.size))
          AND lower(trim(color)) = lower(trim(v_item.color))
        FOR UPDATE;

        IF FOUND THEN
          IF v_variant.stock < v_item_qty THEN
            RAISE EXCEPTION 'Insufficient stock for % in size % / color %. Available: %',
              v_product.name_en, v_item.size, v_item.color, v_variant.stock;
          END IF;

          UPDATE public.product_variants
          SET stock = stock - v_item_qty,
              updated_at = now()
          WHERE id = v_variant.id;
        END IF;
      END IF;

      -- Atomic decrement of main product stock
      UPDATE public.products
      SET stock = stock - v_item_qty,
          updated_at = now()
      WHERE id = v_product.id;
    END IF;

    -- Accumulate verified server-side price (never trusting frontend price)
    v_subtotal := v_subtotal + (v_product.price_egp * v_item_qty);
  END LOOP;

  -- Optional Coupon Evaluation if present in notes (e.g. "[Applied Coupon: CODE]")
  IF p_notes ILIKE '%[Applied Coupon:%' THEN
    v_coupon_code := upper(trim(substring(p_notes FROM '\[Applied Coupon:\s*([A-Za-z0-9_-]+)\]')));
    IF v_coupon_code IS NOT NULL THEN
      SELECT * INTO v_coupon
      FROM public.coupons
      WHERE upper(trim(code)) = v_coupon_code AND is_active = true
      LIMIT 1;

      IF FOUND THEN
        IF v_coupon.expires_at IS NULL OR v_coupon.expires_at > now() THEN
          IF v_subtotal >= v_coupon.min_order_egp THEN
            IF v_coupon.discount_type = 'percent' THEN
              v_discount := round((v_subtotal * v_coupon.discount_value) / 100);
            ELSE
              v_discount := least(v_subtotal, v_coupon.discount_value);
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  v_discount := greatest(0, least(v_subtotal, v_discount));
  v_total := greatest(0, v_subtotal - v_discount + v_shipping);

  -- Insert Master Order Record
  INSERT INTO public.orders (
    id,
    order_number,
    customer_name,
    phone,
    email,
    governorate,
    city_area,
    address,
    notes,
    payment_method,
    status,
    subtotal_egp,
    shipping_egp,
    discount_egp,
    total_egp,
    admin_notes,
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    v_order_number,
    trim(p_customer_name),
    trim(p_phone),
    trim(p_email),
    trim(p_governorate),
    trim(p_city_area),
    trim(p_address),
    p_notes,
    coalesce(p_payment_method, 'cash_on_delivery'),
    'pending',
    v_subtotal,
    v_shipping,
    v_discount,
    v_total,
    CASE WHEN v_discount > 0 THEN 'Applied coupon: ' || v_coupon_code || ' (-' || v_discount || ' EGP)' ELSE NULL END,
    now(),
    now()
  );

  -- Insert Order Items
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, size text, color text, quantity integer)
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name_en,
      product_name_ar,
      size,
      color,
      quantity,
      unit_price_egp
    ) VALUES (
      v_order_id,
      v_product.id,
      v_product.name_en,
      v_product.name_ar,
      coalesce(v_item.size, 'Standard'),
      coalesce(v_item.color, 'Standard'),
      coalesce(v_item.quantity, 1),
      v_product.price_egp
    );
  END LOOP;

  -- Insert initial status history
  INSERT INTO public.order_status_history (
    order_id,
    status,
    notes,
    changed_by,
    created_at
  ) VALUES (
    v_order_id,
    'pending',
    'Order received via boutique online storefront',
    'customer_checkout',
    now()
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_egp', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_store_order TO anon, authenticated;

-- =====================================================================
-- 12. RPC: LOOKUP PUBLIC ORDER
-- Secure order status lookup for customers. Returns ONLY public tracking
-- information. Protects customer privacy (never leaks full address or phone)
-- and never leaks private internal admin notes.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.lookup_public_order(
  p_order_number text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_num text := upper(trim(coalesce(p_order_number, '')));
  v_order record;
  v_items jsonb;
  v_history jsonb;
  v_obfuscated_name text;
BEGIN
  IF length(v_clean_num) < 3 THEN
    RETURN NULL;
  END IF;

  -- Support searching with or without "MERO-" prefix
  SELECT * INTO v_order
  FROM public.orders
  WHERE upper(trim(order_number)) = v_clean_num
     OR upper(trim(order_number)) = ('MERO-' || v_clean_num)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Optional phone verification if provided
  IF p_phone IS NOT NULL AND length(trim(p_phone)) >= 4 THEN
    IF right(regexp_replace(v_order.phone, '\D', '', 'g'), 4) != right(regexp_replace(p_phone, '\D', '', 'g'), 4) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Obfuscate customer name for public privacy: e.g. "Yasmin A***"
  IF length(v_order.customer_name) > 3 THEN
    v_obfuscated_name := split_part(v_order.customer_name, ' ', 1) || ' ' || substring(v_order.customer_name FROM length(split_part(v_order.customer_name, ' ', 1)) + 2 FOR 1) || '***';
  ELSE
    v_obfuscated_name := v_order.customer_name;
  END IF;

  -- Get order items
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'product_id', oi.product_id,
      'product_name_en', oi.product_name_en,
      'product_name_ar', oi.product_name_ar,
      'size', oi.size,
      'color', oi.color,
      'quantity', oi.quantity,
      'unit_price_egp', oi.unit_price_egp
    ) ORDER BY oi.created_at ASC
  ), '[]'::jsonb) INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  -- Get public status history log (customer-facing notes only)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'notes', h.notes,
      'created_at', h.created_at
    ) ORDER BY h.created_at ASC
  ), '[]'::jsonb) INTO v_history
  FROM public.order_status_history h
  WHERE h.order_id = v_order.id;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'customer_name', v_obfuscated_name,
    'governorate', v_order.governorate,
    'city_area', v_order.city_area,
    'status', v_order.status,
    'payment_method', v_order.payment_method,
    'subtotal_egp', v_order.subtotal_egp,
    'shipping_egp', v_order.shipping_egp,
    'discount_egp', v_order.discount_egp,
    'total_egp', v_order.total_egp,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'items', v_items,
    'status_history', v_history
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_public_order TO anon, authenticated;

-- =====================================================================
-- 13. RPC: SUBMIT CUSTOM DESIGN REQUEST
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_custom_design_request(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_garment_type text DEFAULT 'Embroidered Dress',
  p_preferred_fabric text DEFAULT NULL,
  p_preferred_colors text DEFAULT NULL,
  p_embroidery_style text DEFAULT NULL,
  p_size_details text DEFAULT NULL,
  p_description text DEFAULT '',
  p_reference_image_urls text[] DEFAULT '{}',
  p_target_budget_egp numeric DEFAULT NULL,
  p_needed_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_req_id uuid := gen_random_uuid();
  v_seq_val bigint;
  v_req_number text;
  v_needed_date date := NULL;
BEGIN
  IF length(trim(coalesce(p_customer_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;

  IF length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  IF length(trim(coalesce(p_description, ''))) < 10 THEN
    RAISE EXCEPTION 'Description must be at least 10 characters';
  END IF;

  v_seq_val := nextval('bespoke_request_seq');
  v_req_number := 'BESPOKE-' || lpad(v_seq_val::text, 4, '0');

  IF p_needed_by IS NOT NULL AND length(trim(p_needed_by)) > 0 THEN
    BEGIN
      v_needed_date := p_needed_by::date;
    EXCEPTION WHEN OTHERS THEN
      v_needed_date := NULL;
    END;
  END IF;

  INSERT INTO public.custom_design_requests (
    id,
    request_number,
    customer_name,
    phone,
    email,
    garment_type,
    preferred_fabric,
    preferred_colors,
    embroidery_style,
    size_details,
    description,
    reference_image_urls,
    target_budget_egp,
    needed_by,
    deposit_rate,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_req_id,
    v_req_number,
    trim(p_customer_name),
    trim(p_phone),
    trim(p_email),
    trim(p_garment_type),
    trim(p_preferred_fabric),
    trim(p_preferred_colors),
    trim(p_embroidery_style),
    trim(p_size_details),
    trim(p_description),
    coalesce(p_reference_image_urls, '{}'),
    p_target_budget_egp,
    v_needed_date,
    0.30,
    'new',
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'request_number', v_req_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_custom_design_request TO anon, authenticated;
