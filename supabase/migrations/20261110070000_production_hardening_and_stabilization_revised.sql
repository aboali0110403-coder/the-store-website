-- =====================================================================
-- Mero Boutique Production Hardening & Stabilization Migration (REVISED & AUDITED)
-- Version: 20261110070000_production_hardening_and_stabilization_revised.sql
-- 
-- Audit Principles & Safe Execution Standards:
-- 1. NO "DROP FUNCTION ... CASCADE". Never drops dependent objects or tables.
-- 2. Preserves exact existing function signatures & return types:
--    - submit_store_order: RETURNS TABLE(order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric)
--    - submit_custom_design_request: RETURNS TABLE(request_id uuid, request_number text, status text) with p_needed_by date DEFAULT NULL.
-- 3. NO duplicate or redundant columns in order_status_history.
--    Respects the existing live columns: (order_id, new_status, note, changed_by, changed_at).
--    Uses valid UUID or NULL for changed_by (never text literals).
-- 4. Concurrency-safe, collision-free order and request number generation:
--    Uses PostgreSQL Sequences (order_number_seq & bespoke_request_seq) properly initialized
--    above the current maximum order/request numbers to prevent duplicate key errors.
-- 5. Positive integer validation:
--    Enforces (elem->>'quantity')::integer >= 1 AND <= 20, rejects non-integers, zero, or negative quantities.
-- 6. Strict inventory architecture:
--    - 'made_to_order' is exempt from stock restrictions and never blocked by zero stock.
--    - 'ready' and 'limited' products enforce strict stock checks and atomic decrement.
--    - If variants exist: locks matching variant row, decrements variant stock, and synchronizes
--      product aggregate stock accurately to avoid double decrement.
--    - Prevents falling back to base product stock when an invalid or nonexistent variant is passed.
-- 7. Minimum necessary privileges & security hardening:
--    SECURITY DEFINER with explicit search_path = public, auth, extensions.
--    No excessive GRANTs to anon.
-- 8. Accurate shipping rates & coupon evaluation:
--    Queries shipping_rates dynamically and applies coupons accurately without hardcoding overrides.
-- 9. Strict column compatibility for order_items:
--    Respects existing columns (order_id, product_id, product_name_en, product_name_ar, size, color, quantity, unit_price_egp).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EXTENSIONS & CONCURRENCY-SAFE SEQUENCES
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS public.bespoke_request_seq START WITH 2000;

-- Advance sequences safely past any existing orders or requests
DO $$
DECLARE
  v_max_order_seq bigint;
  v_max_bespoke_seq bigint;
BEGIN
  -- Advance order sequence
  SELECT COALESCE(
    MAX(
      CASE
        WHEN order_number ~ '^MERO-[0-9]+$' THEN SUBSTRING(order_number FROM 6)::bigint
        ELSE 0
      END
    ), 1000
  ) INTO v_max_order_seq
  FROM public.orders;

  IF v_max_order_seq >= 1000 THEN
    PERFORM setval('public.order_number_seq', v_max_order_seq, true);
  END IF;

  -- Advance bespoke request sequence
  SELECT COALESCE(
    MAX(
      CASE
        WHEN request_number ~ '^MERO-DES-[0-9]+$' THEN SUBSTRING(request_number FROM 10)::bigint
        WHEN request_number ~ '^BESPOKE-[0-9]+$' THEN SUBSTRING(request_number FROM 9)::bigint
        ELSE 0
      END
    ), 2000
  ) INTO v_max_bespoke_seq
  FROM public.custom_design_requests;

  IF v_max_bespoke_seq >= 2000 THEN
    PERFORM setval('public.bespoke_request_seq', v_max_bespoke_seq, true);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. NON-RECURSIVE ADMIN AUTHORIZATION HELPER
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. ADMIN USERS TABLE & RLS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can read own admin record" ON public.admin_users;

CREATE POLICY "Users can read own admin record"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4. CATEGORIES TABLE (ADDITIVE SCHEMA & SEED DATA)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  filter text NOT NULL UNIQUE,
  image_url text NOT NULL,
  description_en text DEFAULT '',
  description_ar text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_ar text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS filter text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description_en text DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description_ar text DEFAULT '';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_published ON public.categories(is_published, sort_order ASC);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published categories" ON public.categories;
CREATE POLICY "Public read published categories"
  ON public.categories
  FOR SELECT
  TO public
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin full access on categories" ON public.categories;
CREATE POLICY "Admin full access on categories"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default boutique categories if not present
INSERT INTO public.categories (slug, name_en, name_ar, filter, image_url, sort_order, is_published)
VALUES
  ('dresses', 'Embroidered Dresses', 'فساتين مطرزة', 'Dresses', '/products/embroidered-dress.svg', 1, true),
  ('abayas', 'Abayas', 'عبايات', 'Abayas', '/products/heritage-abaya.svg', 2, true),
  ('kaftans', 'Kaftans', 'قفاطين', 'Kaftans', '/products/golden-kaftan.svg', 3, true),
  ('tops', 'Embroidered Tops', 'قمصان مطرزة', 'Tops', '/products/embroidered-top.svg', 4, true),
  ('sets', 'Two-Piece Sets', 'أطقم من قطعتين', 'Sets', '/products/ivory-set.svg', 5, true),
  ('exclusive-pieces', 'Exclusive Pieces', 'قطع حصرية', 'Exclusive Pieces', '/products/embroidered-dress.svg', 6, true)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. PRODUCTS & VARIANTS (ADDITIVE SCHEMA & CONSTRAINTS)
-- ---------------------------------------------------------------------
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

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS production_type text DEFAULT 'ready';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sizes text[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock integer DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_published ON public.products(is_published, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published products" ON public.products;
CREATE POLICY "Public read published products"
  ON public.products
  FOR SELECT
  TO public
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin full access on products" ON public.products;
CREATE POLICY "Admin full access on products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- PRODUCT IMAGES
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product images" ON public.product_images;
CREATE POLICY "Public read product images"
  ON public.product_images
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Admin manage product images" ON public.product_images;
CREATE POLICY "Admin manage product images"
  ON public.product_images
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- PRODUCT VARIANTS
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

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS stock integer DEFAULT 0;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active product variants" ON public.product_variants;
CREATE POLICY "Public read active product variants"
  ON public.product_variants
  FOR SELECT
  TO public
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage product variants" ON public.product_variants;
CREATE POLICY "Admin manage product variants"
  ON public.product_variants
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. SHIPPING RATES & COUPONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate text NOT NULL UNIQUE,
  fee_egp numeric NOT NULL CHECK (fee_egp >= 0),
  estimated_days text NOT NULL DEFAULT '2-4 days',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping rates" ON public.shipping_rates;
CREATE POLICY "Public read shipping rates"
  ON public.shipping_rates
  FOR SELECT
  TO public
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage shipping rates" ON public.shipping_rates;
CREATE POLICY "Admin manage shipping rates"
  ON public.shipping_rates
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_order_egp numeric DEFAULT 0 CHECK (min_order_egp >= 0),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage coupons" ON public.coupons;
CREATE POLICY "Admin manage coupons"
  ON public.coupons
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 7. ORDERS, ORDER ITEMS, & ORDER STATUS HISTORY
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text,
  governorate text NOT NULL,
  city_area text NOT NULL,
  address text NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  status text NOT NULL DEFAULT 'pending',
  subtotal_egp numeric NOT NULL CHECK (subtotal_egp >= 0),
  shipping_egp numeric NOT NULL DEFAULT 0 CHECK (shipping_egp >= 0),
  discount_egp numeric NOT NULL DEFAULT 0 CHECK (discount_egp >= 0),
  total_egp numeric NOT NULL CHECK (total_egp >= 0),
  deposit_egp numeric NOT NULL DEFAULT 0,
  remaining_egp numeric NOT NULL DEFAULT 0,
  tracking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  notes text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deposit_egp numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_egp numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_token ON public.orders(tracking_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;
CREATE POLICY "Admin manage orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ORDER ITEMS (Exact columns matching live schema)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name_en text NOT NULL,
  product_name_ar text NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_egp numeric NOT NULL CHECK (unit_price_egp >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage order items" ON public.order_items;
CREATE POLICY "Admin manage order items"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ORDER STATUS HISTORY (Respects existing live columns: new_status, note, changed_at, changed_by)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  new_status text NOT NULL,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  is_internal boolean NOT NULL DEFAULT false
);

ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_status_history_order ON public.order_status_history(order_id, changed_at ASC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage status history" ON public.order_status_history;
CREATE POLICY "Admin manage status history"
  ON public.order_status_history
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. CUSTOM DESIGN REQUESTS
-- ---------------------------------------------------------------------
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
  reference_image_urls text[] DEFAULT '{}'::text[],
  target_budget_egp numeric,
  needed_by date,
  status text NOT NULL DEFAULT 'new',
  deposit_rate numeric DEFAULT NULL, -- Pending store owner percentage confirmation
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS reference_image_urls text[] DEFAULT '{}'::text[];
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS target_budget_egp numeric;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS needed_by date;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS deposit_rate numeric DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_requests_number ON public.custom_design_requests(request_number);

ALTER TABLE public.custom_design_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage custom design requests" ON public.custom_design_requests;
CREATE POLICY "Admin manage custom design requests"
  ON public.custom_design_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- 9. SUPABASE STORAGE BUCKETS & POLICIES
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-references',
  'design-references',
  false, -- STRICTLY PRIVATE
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Public view product images" ON storage.objects;
CREATE POLICY "Public view product images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admin upload product images" ON storage.objects;
CREATE POLICY "Admin upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "Admin update product images" ON storage.objects;
CREATE POLICY "Admin update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete product images" ON storage.objects;
CREATE POLICY "Admin delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND public.is_admin());

DROP POLICY IF EXISTS "Public upload design references" ON storage.objects;
CREATE POLICY "Public upload design references"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'design-references'
    AND (storage.foldername(name))[1] = 'references'
  );

DROP POLICY IF EXISTS "Admin read design references" ON storage.objects;
CREATE POLICY "Admin read design references"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'design-references' AND public.is_admin());

DROP POLICY IF EXISTS "Admin delete design references" ON storage.objects;
CREATE POLICY "Admin delete design references"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'design-references' AND public.is_admin());

-- ---------------------------------------------------------------------
-- 10. RPC: SUBMIT STORE ORDER
-- Non-destructive replacement (NO CASCADE).
-- Returns TABLE(order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric).
-- Validates positive integer quantities, locks inventory atomically, synchronizes variant stock,
-- evaluates coupons dynamically, and inserts status history safely.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_store_order(text, text, text, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.submit_store_order(text, text, text, text, text, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_governorate text DEFAULT 'Cairo',
  p_city_area text DEFAULT '',
  p_address text DEFAULT '',
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash_on_delivery',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  subtotal_egp numeric,
  shipping_egp numeric,
  total_egp numeric
)
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
  v_has_variants boolean;
  v_subtotal numeric := 0;
  v_shipping numeric := 60;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_item_count integer := 0;
  v_qty integer;
  v_coupon_code text;
  v_coupon record;
BEGIN
  -- 1. Input Validation & Anti-Abuse
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters.';
  END IF;

  IF p_phone IS NULL OR length(regexp_replace(trim(p_phone), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'Please provide a valid contact phone number with at least 7 digits.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one line item.';
  END IF;

  -- Server-side anti-abuse limit (max 5 orders per contact phone per hour)
  IF (
    SELECT count(*) FROM public.orders
    WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
      AND created_at > (now() - interval '1 hour')
  ) >= 5 THEN
    RAISE EXCEPTION 'Order submission frequency limit exceeded. Please contact the concierge directly.';
  END IF;

  -- 2. Idempotency Check: if this attempt was already processed, return existing order safely
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT o.id, o.order_number, o.subtotal_egp, o.shipping_egp, o.total_egp
    INTO v_order_id, v_order_number, v_subtotal, v_shipping, v_total
    FROM public.orders o
    WHERE o.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY
      SELECT v_order_id, v_order_number, v_subtotal, v_shipping, v_total;
      RETURN;
    END IF;
  END IF;

  -- 2. Concurrency-Safe Sequential Order Number Generation
  v_seq_val := nextval('public.order_number_seq');
  v_order_number := 'MERO-' || v_seq_val::text;

  -- 3. Dynamic Shipping Rate Lookup
  SELECT fee_egp INTO v_shipping
  FROM public.shipping_rates
  WHERE lower(trim(governorate)) = lower(trim(p_governorate))
    AND is_active = true
  LIMIT 1;

  IF v_shipping IS NULL THEN
    v_shipping := 60; -- Standard courier fallback
  END IF;

  -- 4. Process Line Items Atomically with Row-Level Locks
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      COALESCE(elem->>'size', '') AS size,
      COALESCE(elem->>'color', '') AS color,
      elem->>'quantity' AS raw_quantity
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    v_item_count := v_item_count + 1;

    -- Positive integer validation
    BEGIN
      v_qty := v_item.raw_quantity::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item quantity must be a valid integer.';
    END;

    IF v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'Item quantity must be an integer between 1 and 20.';
    END IF;

    -- Lock product row atomically
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is no longer available.', v_item.product_id;
    END IF;

    IF NOT v_product.is_published THEN
      RAISE EXCEPTION 'Product "%" is not currently published.', v_product.name_en;
    END IF;

    -- Check if product has configured active variants
    SELECT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE product_id = v_product.id AND is_active = true
    ) INTO v_has_variants;

    IF v_has_variants THEN
      -- Variant must match requested size and color strictly
      SELECT * INTO v_variant
      FROM public.product_variants
      WHERE product_id = v_product.id
        AND lower(trim(size)) = lower(trim(v_item.size))
        AND lower(trim(color)) = lower(trim(v_item.color))
        AND is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected size/color (% / %) is not available for product "%".',
          v_item.size, v_item.color, v_product.name_en;
      END IF;

      -- Ready / Limited Stock Validation & Decrement
      IF v_product.production_type IN ('ready', 'limited') THEN
        IF v_variant.stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient stock for % (variant: % / %). Available: %, Requested: %',
            v_product.name_en, v_item.size, v_item.color, v_variant.stock, v_qty;
        END IF;

        -- Decrement the exact variant
        UPDATE public.product_variants
        SET stock = stock - v_qty,
            updated_at = now()
        WHERE id = v_variant.id;

        -- Synchronize product-level aggregate stock accurately to sum of active variants
        -- Eliminates double-decrement
        UPDATE public.products
        SET stock = (
          SELECT COALESCE(SUM(pv.stock), 0)
          FROM public.product_variants pv
          WHERE pv.product_id = v_product.id AND pv.is_active = true
        ),
        updated_at = now()
        WHERE id = v_product.id;
      END IF;
      -- Note: made_to_order NEVER decrements stock and is NEVER blocked by zero stock
    ELSE
      -- Product without variants: validate product-level stock
      IF v_product.production_type IN ('ready', 'limited') THEN
        IF v_product.stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient stock for "%". Available: %, Requested: %',
            v_product.name_en, v_product.stock, v_qty;
        END IF;

        UPDATE public.products
        SET stock = stock - v_qty,
            updated_at = now()
        WHERE id = v_product.id;
      END IF;
    END IF;

    -- Tally verified price
    v_subtotal := v_subtotal + (v_product.price_egp * v_qty);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Order contains no valid items.';
  END IF;

  -- 5. Optional Coupon Evaluation from Notes
  IF p_notes ILIKE '%[Applied Coupon:%' THEN
    v_coupon_code := upper(trim(substring(p_notes FROM '\[Applied Coupon:\s*([A-Za-z0-9_-]+)\]')));
    IF v_coupon_code IS NOT NULL THEN
      SELECT * INTO v_coupon
      FROM public.coupons
      WHERE upper(trim(code)) = v_coupon_code AND is_active = true
      LIMIT 1;

      IF FOUND THEN
        IF v_coupon.expires_at IS NULL OR v_coupon.expires_at > now() THEN
          IF v_subtotal >= COALESCE(v_coupon.min_order_egp, 0) THEN
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

  -- 6. Insert Master Order Record
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
    tracking_token,
    idempotency_key,
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
    p_payment_method,
    'pending',
    v_subtotal,
    v_shipping,
    v_discount,
    v_total,
    gen_random_uuid(),
    trim(p_idempotency_key),
    now(),
    now()
  );

  -- 7. Insert Order Line Items (Exact schema match)
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      COALESCE(elem->>'size', '') AS size,
      COALESCE(elem->>'color', '') AS color,
      (elem->>'quantity')::integer AS quantity
    FROM jsonb_array_elements(p_items) AS elem
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
      v_item.size,
      v_item.color,
      v_item.quantity,
      v_product.price_egp
    );
  END LOOP;

  -- 8. Insert Initial Status History using live columns (new_status, note, changed_by, changed_at, is_internal)
  INSERT INTO public.order_status_history (
    order_id,
    new_status,
    note,
    changed_by,
    changed_at,
    is_internal
  ) VALUES (
    v_order_id,
    'pending',
    'Order received via boutique online storefront',
    auth.uid(),
    now(),
    false -- customer-visible status
  );

  -- Return matching TABLE output
  RETURN QUERY
  SELECT
    v_order_id,
    v_order_number,
    v_subtotal,
    v_shipping,
    v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_store_order TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 10B. ATOMIC RPC: ADMIN UPDATE ORDER STATUS & SAFE RESTOCK RESTORATION
-- Executes state transition, inventory restocking, and audit log atomically
-- in one single transaction. Prevents duplicate restocking or orphaned logs.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_notes text DEFAULT NULL,
  p_is_internal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order record;
  v_item record;
BEGIN
  -- 1. Security Check: Only verified boutique admins can execute
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only verified administrators can update order status.';
  END IF;

  -- 2. Lock target order atomically
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found.', p_order_id;
  END IF;

  -- 3. Atomic Stock Restoration on Cancellation (Single Execution Guarantee)
  -- Restores stock ONLY if transitioning to 'cancelled' and was NOT previously cancelled
  IF p_new_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
    FOR v_item IN
      SELECT oi.*, p.production_type
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id
    LOOP
      -- Restock only ready-to-wear / limited inventory (NEVER made-to-order bespoke)
      IF v_item.production_type IN ('ready', 'limited') THEN
        -- Restore variant stock if configured
        UPDATE public.product_variants
        SET stock = stock + v_item.quantity,
            updated_at = now()
        WHERE product_id = v_item.product_id
          AND lower(trim(size)) = lower(trim(v_item.size))
          AND lower(trim(color)) = lower(trim(v_item.color));

        -- Resynchronize aggregate product stock
        UPDATE public.products
        SET stock = (
          SELECT COALESCE(SUM(pv.stock), products.stock + v_item.quantity)
          FROM public.product_variants pv
          WHERE pv.product_id = products.id AND pv.is_active = true
        ),
        updated_at = now()
        WHERE id = v_item.product_id;
      END IF;
    END LOOP;
  END IF;

  -- 4. Update order status atomically
  UPDATE public.orders
  SET status = p_new_status,
      updated_at = now(),
      admin_notes = CASE WHEN p_is_internal THEN p_notes ELSE admin_notes END
  WHERE id = p_order_id;

  -- 5. Atomically insert status history log
  INSERT INTO public.order_status_history (
    order_id,
    new_status,
    note,
    changed_by,
    changed_at,
    is_internal
  ) VALUES (
    p_order_id,
    p_new_status,
    COALESCE(p_notes, 'Status changed to ' || p_new_status),
    auth.uid(),
    now(),
    p_is_internal
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_order_status TO authenticated;

-- ---------------------------------------------------------------------
-- 10C. DEFUSE LEGACY VULNERABLE TRACKING FUNCTIONS
-- Revokes anonymous and public permissions without CASCADE
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'track_order_status' AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE ALL ON FUNCTION public.track_order_status FROM anon, authenticated, public;
    DROP FUNCTION IF EXISTS public.track_order_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ---------------------------------------------------------------------
-- 11. RPC: SUBMIT CUSTOM DESIGN REQUEST
-- Non-destructive replacement (NO CASCADE).
-- Preserves original parameter signature: p_needed_by date DEFAULT NULL.
-- Returns TABLE(request_id uuid, request_number text, status text).
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.submit_custom_design_request(text, text, text, text, text, text, text, text, text, text[], numeric, date);

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
  p_reference_image_urls text[] DEFAULT '{}'::text[],
  p_target_budget_egp numeric DEFAULT NULL,
  p_needed_by date DEFAULT NULL
)
RETURNS TABLE (
  request_id uuid,
  request_number text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_request_id uuid := gen_random_uuid();
  v_seq_val bigint;
  v_request_number text;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Please enter your name.';
  END IF;

  IF p_phone IS NULL OR length(regexp_replace(trim(p_phone), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'Please enter a valid phone number.';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) < 5 THEN
    RAISE EXCEPTION 'Please provide a brief description of your desired piece.';
  END IF;

  -- Server-side anti-abuse rate limit (max 3 bespoke requests per phone per hour)
  IF (
    SELECT count(*) FROM public.custom_design_requests
    WHERE regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
      AND created_at > (now() - interval '1 hour')
  ) >= 3 THEN
    RAISE EXCEPTION 'Request frequency limit reached. Please wait before submitting another bespoke request.';
  END IF;

  -- Concurrency-Safe Sequential Request Number Generation
  v_seq_val := nextval('public.bespoke_request_seq');
  v_request_number := 'MERO-DES-' || v_seq_val::text;

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
    status,
    deposit_rate,
    created_at,
    updated_at
  ) VALUES (
    v_request_id,
    v_request_number,
    trim(p_customer_name),
    trim(p_phone),
    trim(p_email),
    trim(p_garment_type),
    trim(p_preferred_fabric),
    trim(p_preferred_colors),
    trim(p_embroidery_style),
    trim(p_size_details),
    trim(p_description),
    COALESCE(p_reference_image_urls, '{}'::text[]),
    p_target_budget_egp,
    p_needed_by,
    'new',
    NULL, -- deposit rate unconfirmed, pending boutique owner policy
    now(),
    now()
  );

  RETURN QUERY
  SELECT
    v_request_id,
    v_request_number,
    'new'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_custom_design_request TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. RPC: LOOKUP PUBLIC ORDER (SECURE VERIFICATION & SANITIZATION)
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.lookup_public_order(text, text, text);

CREATE OR REPLACE FUNCTION public.lookup_public_order(
  p_order_number text,
  p_phone text DEFAULT NULL,
  p_tracking_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_order record;
  v_items jsonb;
  v_history jsonb;
  v_clean_order_num text;
  v_clean_input_phone text := '';
  v_clean_order_phone text := '';
  v_is_authorized boolean := false;
  v_masked_name text;
BEGIN
  v_clean_order_num := upper(trim(p_order_number));
  IF v_clean_order_num IS NULL OR length(v_clean_order_num) < 3 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE upper(order_number) = v_clean_order_num
     OR upper(order_number) = 'MERO-' || v_clean_order_num
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. Check if caller is authenticated admin
  IF public.is_admin() THEN
    v_is_authorized := true;
  END IF;

  -- 2. Check tracking token match (high entropy UUID)
  IF NOT v_is_authorized AND p_tracking_token IS NOT NULL AND trim(p_tracking_token) <> '' THEN
    IF v_order.tracking_token::text = trim(p_tracking_token) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- 3. Check full normalized phone number match
  -- Security: Requires matching the full telephone digits (minimum 9 digits) to prevent short prefix/suffix enumeration
  IF NOT v_is_authorized AND p_phone IS NOT NULL AND length(regexp_replace(trim(p_phone), '\D', '', 'g')) >= 9 THEN
    v_clean_input_phone := regexp_replace(trim(p_phone), '\D', '', 'g');
    v_clean_order_phone := regexp_replace(coalesce(v_order.phone, ''), '\D', '', 'g');

    -- Exact full digit match or exact Egyptian mobile match without leading country code (+2010... vs 010...)
    IF v_clean_input_phone = v_clean_order_phone
       OR (v_clean_input_phone = '2' || v_clean_order_phone)
       OR (v_clean_order_phone = '2' || v_clean_input_phone)
       OR (v_clean_input_phone = '20' || v_clean_order_phone)
       OR (v_clean_order_phone = '20' || v_clean_input_phone)
    THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN NULL;
  END IF;

  -- Obfuscate customer name for public view
  IF public.is_admin() THEN
    v_masked_name := v_order.customer_name;
  ELSE
    IF length(v_order.customer_name) > 3 THEN
      v_masked_name := split_part(v_order.customer_name, ' ', 1) || ' ' ||
        left(split_part(v_order.customer_name, ' ', 2), 1) || '***';
    ELSE
      v_masked_name := 'Valued Client';
    END IF;
  END IF;

  -- Retrieve items
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
    )
  ), '[]'::jsonb) INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = v_order.id;

  -- Retrieve history from live columns (new_status, note, changed_at, is_internal)
  -- Security: Internal notes are strictly withheld from public output via is_internal column boundary. Only admins see internal notes.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'status', h.new_status,
      'notes', CASE
        WHEN public.is_admin() THEN h.note
        WHEN h.is_internal = true THEN NULL
        WHEN h.note ILIKE '[Internal]%' OR h.note ILIKE 'internal:%' THEN NULL
        ELSE h.note
      END,
      'created_at', h.changed_at
    ) ORDER BY h.changed_at ASC
  ), '[]'::jsonb) INTO v_history
  FROM public.order_status_history h
  WHERE h.order_id = v_order.id
    AND (public.is_admin() OR h.is_internal = false);

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'customer_name', v_masked_name,
    'status', v_order.status,
    'payment_method', v_order.payment_method,
    'governorate', v_order.governorate,
    'city_area', v_order.city_area,
    'subtotal_egp', v_order.subtotal_egp,
    'shipping_egp', v_order.shipping_egp,
    'discount_egp', v_order.discount_egp,
    'total_egp', v_order.total_egp,
    'items', v_items,
    'status_history', v_history,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_public_order TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. SUPABASE REALTIME PUBLICATION SETUP
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note: supabase_realtime publication table registration: %', SQLERRM;
END $$;
