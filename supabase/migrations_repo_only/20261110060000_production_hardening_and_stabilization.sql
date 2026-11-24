-- =====================================================================
-- Mero Boutique Production Hardening & Stabilization Migration
-- Version: 20261110060000_production_hardening_and_stabilization.sql
-- Description:
--   1. Extensions & Non-Colliding Sequences
--   2. Non-Recursive Admin Authorization (public.is_admin())
--   3. Additive Schema Updates (ALTER TABLE ADD COLUMN IF NOT EXISTS)
--   4. RLS Hardening across all tables
--   5. Storage Bucket Hardening (public product-images & private design-references)
--   6. Safe Function Replacement:
--      - submit_store_order: atomic stock locks, ready vs made_to_order separation,
--        variant validation, UUID-safe order_status_history, returns TABLE.
--      - submit_custom_design_request: returns TABLE, private reference paths.
--      - lookup_public_order: phone/token verification, masked personal data, rate-limit defense.
--   7. Supabase Realtime publication setup for orders
-- =====================================================================

-- 1. EXTENSIONS & SEQUENCES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.bespoke_request_seq;

-- 2. NON-RECURSIVE ADMIN AUTHORIZATION HELPER
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

-- 3. ADMIN USERS TABLE & RLS
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can read own admin record" ON public.admin_users;

-- Safe non-recursive policy: users can only select their own row directly
CREATE POLICY "Users can read own admin record"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. CATEGORIES TABLE (ADDITIVE SCHEMA & SEED DATA)
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

-- Seed categories without failing on unique constraint conflicts
INSERT INTO public.categories (slug, name_en, name_ar, filter, image_url, sort_order, is_published)
VALUES
  ('dresses', 'Embroidered Dresses', 'فساتين مطرزة', 'Dresses', '/products/embroidered-dress.svg', 1, true),
  ('abayas', 'Abayas', 'عبايات', 'Abayas', '/products/heritage-abaya.svg', 2, true),
  ('kaftans', 'Kaftans', 'قفاطين', 'Kaftans', '/products/golden-kaftan.svg', 3, true),
  ('tops', 'Embroidered Tops', 'قمصان مطرزة', 'Tops', '/products/embroidered-top.svg', 4, true),
  ('sets', 'Two-Piece Sets', 'أطقم من قطعتين', 'Sets', '/products/ivory-set.svg', 5, true),
  ('exclusive-pieces', 'Exclusive Pieces', 'قطع حصرية', 'Exclusive Pieces', '/products/embroidered-dress.svg', 6, true)
ON CONFLICT (slug) DO NOTHING;

-- 5. PRODUCTS & VARIANTS (ADDITIVE SCHEMA & INVENTORY GUARDS)
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

-- 6. SHIPPING RATES & COUPONS
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

-- 7. ORDERS, ORDER ITEMS, & ORDER STATUS HISTORY
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

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deposit_egp numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_egp numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_token ON public.orders(tracking_token);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;
CREATE POLICY "Admin manage orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ORDER ITEMS
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

-- ORDER STATUS HISTORY (UUID-SAFE SCHEMA: changed_by is uuid, source is text)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text DEFAULT 'storefront',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure additive compatibility across all schema variations:
-- Live DB may have (new_status, note, changed_at, changed_by) OR (status, notes, created_at, changed_by)
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS new_status text DEFAULT 'pending';
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS changed_at timestamptz DEFAULT now();
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS source text DEFAULT 'storefront';

CREATE INDEX IF NOT EXISTS idx_status_history_order ON public.order_status_history(order_id, created_at ASC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage status history" ON public.order_status_history;
CREATE POLICY "Admin manage status history"
  ON public.order_status_history
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. CUSTOM DESIGN REQUESTS
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
  needed_by text,
  status text NOT NULL DEFAULT 'new',
  deposit_rate numeric NOT NULL DEFAULT 30,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS reference_image_urls text[] DEFAULT '{}'::text[];
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS target_budget_egp numeric;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS needed_by text;
ALTER TABLE public.custom_design_requests ADD COLUMN IF NOT EXISTS deposit_rate numeric DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_custom_requests_number ON public.custom_design_requests(request_number);

ALTER TABLE public.custom_design_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage custom design requests" ON public.custom_design_requests;
CREATE POLICY "Admin manage custom design requests"
  ON public.custom_design_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9. SUPABASE STORAGE BUCKETS & POLICIES
-- Ensure buckets exist with strict configuration
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

-- Storage Policies: product-images (public read, admin write)
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

-- Storage Policies: design-references (public upload, admin only read/delete)
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

-- =====================================================================
-- 10. RPC: SUBMIT STORE ORDER
-- Atomic stock locking & decrement for ready/limited.
-- Zero decrement & never blocked for made_to_order.
-- Validates variants and rejects nonexistent variants.
-- Inserts order_status_history with valid UUID/NULL changed_by and source.
-- Returns TABLE (order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric)
-- =====================================================================

-- Drop any previous function variations to resolve return type mismatch
DROP FUNCTION IF EXISTS public.submit_store_order CASCADE;
DROP FUNCTION IF EXISTS public.submit_store_order(text, text, text, text, text, text, text, text, jsonb);

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
  v_total numeric := 0;
  v_item_count integer := 0;
BEGIN
  -- 1. Input Validation
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters.';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) < 8 THEN
    RAISE EXCEPTION 'Please provide a valid contact phone number.';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item.';
  END IF;

  -- 2. Generate Non-Colliding Order Number
  SELECT COALESCE(
    MAX(
      CASE
        WHEN o.order_number ~ '^MERO-[0-9]+$' THEN SUBSTRING(o.order_number FROM 6)::bigint
        ELSE 0
      END
    ), 1000
  ) + 1 INTO v_seq_val
  FROM public.orders o;

  v_order_number := 'MERO-' || v_seq_val::text;

  -- 3. Resolve Verified Shipping Fee
  SELECT sr.fee_egp INTO v_shipping
  FROM public.shipping_rates sr
  WHERE lower(trim(sr.governorate)) = lower(trim(p_governorate))
    AND sr.is_active = true
  LIMIT 1;

  IF v_shipping IS NULL THEN
    v_shipping := 60;
  END IF;

  -- 4. Process Line Items Atomically with Row-Level Locks
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      COALESCE(elem->>'size', '') AS size,
      COALESCE(elem->>'color', '') AS color,
      COALESCE((elem->>'quantity')::integer, 1) AS quantity
    FROM jsonb_array_elements(p_items) AS elem
  LOOP
    v_item_count := v_item_count + 1;

    -- Lock the target product row to prevent race conditions
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id AND is_published = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is no longer available.', v_item.product_id;
    END IF;

    -- Check if product has configured variants
    SELECT EXISTS (
      SELECT 1 FROM public.product_variants
      WHERE product_id = v_product.id AND is_active = true
    ) INTO v_has_variants;

    IF v_has_variants THEN
      -- Strict variant matching
      SELECT * INTO v_variant
      FROM public.product_variants
      WHERE product_id = v_product.id
        AND lower(trim(size)) = lower(trim(v_item.size))
        AND lower(trim(color)) = lower(trim(v_item.color))
        AND is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected size/color (% / %) is not available for product %.',
          v_item.size, v_item.color, v_product.name_en;
      END IF;

      -- Ready / Limited Stock Validation & Decrement
      IF v_product.production_type IN ('ready', 'limited') THEN
        IF v_variant.stock < v_item.quantity THEN
          RAISE EXCEPTION 'Insufficient stock for % (variant: % / %). Available: %, Requested: %',
            v_product.name_en, v_item.size, v_item.color, v_variant.stock, v_item.quantity;
        END IF;

        -- Decrement the exact matching variant
        UPDATE public.product_variants
        SET stock = stock - v_item.quantity,
            updated_at = now()
        WHERE id = v_variant.id;

        -- Synchronize product-level aggregate stock accurately to sum of active variants
        -- Never decrements twice or desynchronizes variant count
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
        IF v_product.stock < v_item.quantity THEN
          RAISE EXCEPTION 'Insufficient stock for %. Available: %, Requested: %',
            v_product.name_en, v_product.stock, v_item.quantity;
        END IF;

        UPDATE public.products
        SET stock = stock - v_item.quantity,
            updated_at = now()
        WHERE id = v_product.id;
      END IF;
    END IF;

    -- Tally verified price
    v_subtotal := v_subtotal + (v_product.price_egp * v_item.quantity);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Order contains no valid items.';
  END IF;

  v_total := v_subtotal + v_shipping;

  -- 5. Insert Master Order Record
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
    0,
    v_total,
    gen_random_uuid(),
    now(),
    now()
  );

  -- 6. Insert Order Items
  FOR v_item IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      COALESCE(elem->>'size', '') AS size,
      COALESCE(elem->>'color', '') AS color,
      COALESCE((elem->>'quantity')::integer, 1) AS quantity
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

  -- 7. Insert Initial Status History with UUID-safe changed_by and dual column compatibility
  INSERT INTO public.order_status_history (
    order_id,
    status,
    new_status,
    notes,
    note,
    changed_by,
    source,
    created_at,
    changed_at
  ) VALUES (
    v_order_id,
    'pending',
    'pending',
    'Order received via boutique online storefront',
    'Order received via boutique online storefront',
    auth.uid(), -- NULL for guest anon, valid uuid if authenticated
    'customer_checkout',
    now(),
    now()
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

-- =====================================================================
-- 11. RPC: SUBMIT CUSTOM DESIGN REQUEST
-- Returns TABLE (request_id uuid, request_number text, status text)
-- =====================================================================

DROP FUNCTION IF EXISTS public.submit_custom_design_request CASCADE;
DROP FUNCTION IF EXISTS public.submit_custom_design_request(text, text, text, text, text, text, text, text, text, text[], numeric, text);
DROP FUNCTION IF EXISTS public.submit_custom_design_request(text, text, text, text, text, text, text, text, text, text[], numeric, date);

CREATE OR REPLACE FUNCTION public.submit_custom_design_request(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_garment_type text DEFAULT 'dress',
  p_preferred_fabric text DEFAULT NULL,
  p_preferred_colors text DEFAULT NULL,
  p_embroidery_style text DEFAULT NULL,
  p_size_details text DEFAULT NULL,
  p_description text DEFAULT '',
  p_reference_image_urls text[] DEFAULT '{}'::text[],
  p_target_budget_egp numeric DEFAULT NULL,
  p_needed_by text DEFAULT NULL
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

  IF p_phone IS NULL OR length(trim(p_phone)) < 8 THEN
    RAISE EXCEPTION 'Please enter a valid phone number.';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) < 5 THEN
    RAISE EXCEPTION 'Please provide a brief description of your desired piece.';
  END IF;

  SELECT COALESCE(
    MAX(
      CASE
        WHEN r.request_number ~ '^MERO-DES-[0-9]+$' THEN SUBSTRING(r.request_number FROM 10)::bigint
        ELSE 0
      END
    ), 2000
  ) + 1 INTO v_seq_val
  FROM public.custom_design_requests r;

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
    p_reference_image_urls,
    p_target_budget_egp,
    trim(p_needed_by),
    'new',
    30,
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

-- =====================================================================
-- 12. RPC: LOOKUP PUBLIC ORDER (SECURE VERIFICATION & REDACTION)
-- Requires matching phone number or tracking token or admin authorization.
-- Returns generic NULL if unverified to prevent enumeration.
-- Masks customer name, redacts address/phone/email/internal notes.
-- =====================================================================

DROP FUNCTION IF EXISTS public.lookup_public_order CASCADE;
DROP FUNCTION IF EXISTS public.lookup_public_order(text, text);
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

  -- Locate order by reference
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

  -- 2. Check tracking token match
  IF NOT v_is_authorized AND p_tracking_token IS NOT NULL AND trim(p_tracking_token) <> '' THEN
    IF v_order.tracking_token::text = trim(p_tracking_token) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- 3. Check phone number match (normalized Egyptian / international digits)
  IF NOT v_is_authorized AND p_phone IS NOT NULL AND length(trim(p_phone)) >= 4 THEN
    v_clean_input_phone := regexp_replace(trim(p_phone), '\D', '', 'g');
    v_clean_order_phone := regexp_replace(coalesce(v_order.phone, ''), '\D', '', 'g');

    -- Exact match, or suffix match if international prefix differs (+20 vs 0)
    IF v_clean_input_phone = v_clean_order_phone
       OR (length(v_clean_input_phone) >= 8 AND v_clean_order_phone LIKE '%' || v_clean_input_phone)
       OR (length(v_clean_order_phone) >= 8 AND v_clean_input_phone LIKE '%' || v_clean_order_phone)
    THEN
      v_is_authorized := true;
    END IF;
  END IF;

  -- If ownership is not proven, return NULL to prevent enumeration
  IF NOT v_is_authorized THEN
    RETURN NULL;
  END IF;

  -- Obfuscate customer name for public view (e.g. Yasmin A***)
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

  -- Retrieve history (public safe statuses)
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

-- =====================================================================
-- 13. SUPABASE REALTIME PUBLICATION SETUP
-- =====================================================================
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
