-- Forward-only integrity fix based on the captured production function definitions.
-- Do not replay or reconstruct missing historical migrations.
-- Replaces RPC bodies only; the existing orders_record_status_history trigger remains authoritative.

DO $preflight$
BEGIN
  IF pg_catalog.to_regprocedure('public.submit_store_order(text,text,text,text,text,text,text,text,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected production signature public.submit_store_order(text,text,text,text,text,text,text,text,jsonb,text) is missing';
  END IF;
  IF pg_catalog.to_regprocedure('public.lookup_public_order(text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected production signature public.lookup_public_order(text,text,text) is missing';
  END IF;
  IF pg_catalog.to_regprocedure('public.admin_update_order_status(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected production signature public.admin_update_order_status(uuid,text,text) is missing';
  END IF;
  IF pg_catalog.to_regprocedure('public.is_admin()') IS NULL
     OR pg_catalog.to_regprocedure('public.is_store_admin()') IS NULL
     OR pg_catalog.to_regprocedure('public.record_order_status_history()') IS NULL THEN
    RAISE EXCEPTION 'Expected production authorization/history helper function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'orders'
      AND trigger_row.tgname = 'orders_record_status_history'
      AND trigger_row.tgfoid = pg_catalog.to_regprocedure('public.record_order_status_history()')
      AND NOT trigger_row.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Expected orders_record_status_history trigger is missing or points to a different function';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL::text,
  p_governorate text DEFAULT NULL::text,
  p_city_area text DEFAULT NULL::text,
  p_address text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'cash_on_delivery'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS TABLE(order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_variant record;
  v_coupon record;
  v_subtotal numeric := 0;
  v_shipping numeric;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_qty integer;
  v_has_variants boolean;
  v_coupon_code text;
  v_coupon_applied boolean := false;
  v_rate_count integer := 0;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name must be at least 2 characters.'; END IF;
  IF p_phone IS NULL OR length(regexp_replace(trim(p_phone), '\D', '', 'g')) < 7 THEN RAISE EXCEPTION 'Please provide a valid contact phone number.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Order must contain at least one line item.'; END IF;
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) < 16 THEN RAISE EXCEPTION 'Idempotency key must contain at least 16 characters.'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key), 0));
    SELECT o.id, o.order_number, o.subtotal_egp, o.shipping_egp, o.total_egp
      INTO order_id, order_number, subtotal_egp, shipping_egp, total_egp
    FROM public.orders AS o
    WHERE o.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN RETURN NEXT; RETURN; END IF;
  END IF;

  IF p_governorate IS NULL OR length(trim(p_governorate)) = 0 THEN
    RAISE EXCEPTION 'A governorate is required to calculate shipping.';
  END IF;

  -- Resolve selected area first, then only an explicit blank-area governorate default.
  IF nullif(trim(coalesce(p_city_area, '')), '') IS NOT NULL THEN
    SELECT count(*), min(sr.fee_egp)
      INTO v_rate_count, v_shipping
    FROM public.shipping_rates AS sr
    WHERE lower(trim(sr.governorate)) = lower(trim(p_governorate))
      AND lower(trim(sr.area)) = lower(trim(p_city_area))
      AND sr.is_active = true;

    IF v_rate_count > 1 THEN
      RAISE EXCEPTION 'Multiple active shipping rates match the selected area.';
    END IF;
  END IF;

  IF v_rate_count = 0 THEN
    SELECT count(*), min(sr.fee_egp)
      INTO v_rate_count, v_shipping
    FROM public.shipping_rates AS sr
    WHERE lower(trim(sr.governorate)) = lower(trim(p_governorate))
      AND trim(sr.area) = ''
      AND sr.is_active = true;

    IF v_rate_count > 1 THEN
      RAISE EXCEPTION 'Multiple active governorate-default shipping rates are configured.';
    END IF;
  END IF;

  IF v_rate_count = 0 THEN
    RAISE EXCEPTION 'Shipping rate is not configured for the selected governorate and area.';
  END IF;
  -- End shipping resolution.

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'Item quantity must be between 1 and 20.'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid AND is_published = true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product is no longer available.'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.product_variants AS pv WHERE pv.product_id = v_product.id AND pv.is_active = true) INTO v_has_variants;
    IF v_product.production_type IN ('ready', 'limited') THEN
      IF v_has_variants THEN
        SELECT * INTO v_variant
        FROM public.product_variants AS pv
        WHERE pv.product_id = v_product.id
          AND lower(trim(pv.size)) = lower(trim(coalesce(v_item->>'size', '')))
          AND lower(trim(pv.color)) = lower(trim(coalesce(v_item->>'color', '')))
          AND pv.is_active = true
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected size/color is not available.'; END IF;
        IF v_variant.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
        UPDATE public.product_variants SET stock = stock - v_qty, updated_at = now() WHERE id = v_variant.id;
        UPDATE public.products AS p
        SET stock = (SELECT coalesce(sum(pv.stock), 0) FROM public.product_variants AS pv WHERE pv.product_id = p.id AND pv.is_active = true),
            updated_at = now()
        WHERE p.id = v_product.id;
      ELSE
        IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
        UPDATE public.products SET stock = stock - v_qty, updated_at = now() WHERE id = v_product.id;
      END IF;
    END IF;
    v_subtotal := v_subtotal + (v_product.price_egp * v_qty);
  END LOOP;

  IF p_notes ILIKE '%[Applied Coupon:%' THEN
    v_coupon_code := upper(trim(substring(p_notes FROM '\[Applied Coupon:\s*([A-Za-z0-9_-]+)\]')));
    IF v_coupon_code IS NULL OR v_coupon_code = '' THEN RAISE EXCEPTION 'Invalid coupon code.'; END IF;
    SELECT * INTO v_coupon FROM public.coupons AS c WHERE upper(trim(c.code)) = v_coupon_code FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive coupon code.'; END IF;
    IF NOT v_coupon.is_active THEN RAISE EXCEPTION 'Invalid or inactive coupon code.'; END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN RAISE EXCEPTION 'Coupon is not active yet.'; END IF;
    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN RAISE EXCEPTION 'Coupon has expired.'; END IF;
    IF v_subtotal < coalesce(v_coupon.min_order_egp, 0) THEN RAISE EXCEPTION 'Minimum order amount for this coupon was not reached.'; END IF;
    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit has been reached.'; END IF;
    IF v_coupon.per_customer_limit IS NOT NULL AND (SELECT count(*) FROM public.orders AS o WHERE o.coupon_id = v_coupon.id AND o.phone = trim(p_phone)) >= v_coupon.per_customer_limit THEN RAISE EXCEPTION 'Customer coupon usage limit has been reached.'; END IF;
    IF v_coupon.discount_type = 'percentage' THEN v_discount := (v_subtotal * v_coupon.discount_value) / 100;
    ELSIF v_coupon.discount_type = 'fixed' THEN v_discount := v_coupon.discount_value;
    ELSE RAISE EXCEPTION 'Unsupported coupon discount type.'; END IF;
    IF v_coupon.max_discount_egp IS NOT NULL THEN v_discount := least(v_discount, v_coupon.max_discount_egp); END IF;
    v_discount := greatest(0, least(v_subtotal, v_discount));
    v_coupon_applied := true;
  END IF;

  v_total := greatest(0, v_subtotal - v_discount + v_shipping);
  v_order_number := 'MERO-' || nextval('public.order_number_seq')::text;
  INSERT INTO public.orders(
    id, order_number, customer_name, phone, email, governorate, city_area, address, notes,
    payment_method, status, subtotal_egp, shipping_egp, discount_egp, total_egp,
    admin_notes, tracking_token, idempotency_key, coupon_id
  )
  VALUES (
    v_order_id, v_order_number, trim(p_customer_name), trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''), trim(p_governorate), trim(p_city_area),
    trim(p_address), p_notes, coalesce(p_payment_method, 'cash_on_delivery'), 'pending',
    v_subtotal, v_shipping, v_discount, v_total,
    CASE WHEN v_discount > 0 THEN 'Applied coupon: ' || v_coupon_code || ' (-' || v_discount || ' EGP)' ELSE NULL END,
    gen_random_uuid(), nullif(trim(coalesce(p_idempotency_key, '')), ''),
    CASE WHEN v_coupon_applied THEN v_coupon.id ELSE NULL END
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items(order_id, product_id, product_name_en, product_name_ar, size, color, quantity, unit_price_egp)
    VALUES (v_order_id, v_product.id, v_product.name_en, v_product.name_ar, coalesce(v_item->>'size', ''), coalesce(v_item->>'color', ''), (v_item->>'quantity')::integer, v_product.price_egp);
  END LOOP;

  IF v_coupon_applied THEN
    UPDATE public.coupons SET usage_count = usage_count + 1, updated_at = now() WHERE id = v_coupon.id;
  END IF;

  -- orders_record_status_history writes the one authoritative initial history row.
  RETURN QUERY SELECT v_order_id, v_order_number, v_subtotal, v_shipping, v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_order record;
  v_item record;
  v_product record;
  v_variant record;
  v_has_variants boolean;
  v_new_status text := trim(coalesce(p_new_status, ''));
  v_allowed boolean := false;
BEGIN
  IF NOT public.is_store_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_new_status NOT IN ('pending', 'confirmed', 'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown order status: %', v_new_status;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status = v_new_status THEN
    RETURN;
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled orders cannot be reopened';
  END IF;
  CASE v_order.status
    WHEN 'pending' THEN v_allowed := v_new_status IN ('confirmed', 'cancelled');
    WHEN 'confirmed' THEN v_allowed := v_new_status IN ('in_production', 'cancelled');
    WHEN 'in_production' THEN v_allowed := v_new_status IN ('ready_to_ship', 'cancelled');
    WHEN 'ready_to_ship' THEN v_allowed := v_new_status IN ('shipped', 'cancelled');
    WHEN 'shipped' THEN v_allowed := v_new_status = 'delivered';
    WHEN 'delivered' THEN v_allowed := false;
    ELSE v_allowed := false;
  END CASE;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', v_order.status, v_new_status;
  END IF;
  IF v_new_status = 'cancelled' THEN
    FOR v_item IN SELECT oi.* FROM public.order_items AS oi WHERE oi.order_id = p_order_id LOOP
      SELECT p.* INTO v_product FROM public.products AS p WHERE p.id = v_item.product_id FOR UPDATE;
      IF FOUND AND v_product.production_type IN ('ready', 'limited') THEN
        SELECT EXISTS(
          SELECT 1 FROM public.product_variants AS pv
          WHERE pv.product_id = v_item.product_id AND pv.is_active = true
        ) INTO v_has_variants;
        IF v_has_variants THEN
          SELECT pv.* INTO v_variant
          FROM public.product_variants AS pv
          WHERE pv.product_id = v_item.product_id
            AND lower(trim(pv.size)) = lower(trim(coalesce(v_item.size, '')))
            AND lower(trim(pv.color)) = lower(trim(coalesce(v_item.color, '')))
            AND pv.is_active = true
          FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Cannot restore stock: ordered variant no longer exists';
          END IF;
          UPDATE public.product_variants SET stock = stock + v_item.quantity, updated_at = now() WHERE id = v_variant.id;
          UPDATE public.products AS p
          SET stock = (SELECT coalesce(sum(pv.stock), 0) FROM public.product_variants AS pv WHERE pv.product_id = p.id AND pv.is_active = true),
              updated_at = now()
          WHERE p.id = v_item.product_id;
        ELSE
          UPDATE public.products SET stock = stock + v_item.quantity, updated_at = now() WHERE id = v_item.product_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- p_note remains in the admin-protected orders.admin_notes field only.
  UPDATE public.orders
  SET status = v_new_status,
      admin_notes = coalesce(p_note, admin_notes),
      updated_at = now()
  WHERE id = p_order_id;
  -- The orders_record_status_history trigger is the sole status-history writer.
END;
$function$;

CREATE OR REPLACE FUNCTION public.lookup_public_order(
  p_order_number text,
  p_phone text DEFAULT NULL::text,
  p_tracking_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
DECLARE
  o record;
  items jsonb;
  hist jsonb;
  authorized boolean := false;
  inp text;
  ordp text;
BEGIN
  SELECT * INTO o
  FROM public.orders
  WHERE upper(order_number) = upper(trim(p_order_number))
     OR upper(order_number) = 'MERO-' || upper(trim(p_order_number))
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF public.is_admin() THEN authorized := true; END IF;
  IF NOT authorized AND p_tracking_token IS NOT NULL AND trim(p_tracking_token) <> ''
     AND o.tracking_token::text = trim(p_tracking_token) THEN
    authorized := true;
  END IF;
  IF NOT authorized AND p_phone IS NOT NULL AND length(regexp_replace(trim(p_phone), '\D', '', 'g')) >= 9 THEN
    inp := regexp_replace(trim(p_phone), '\D', '', 'g');
    ordp := regexp_replace(coalesce(o.phone, ''), '\D', '', 'g');
    IF inp = ordp OR inp = '2' || ordp OR ordp = '2' || inp OR inp = '20' || ordp OR ordp = '20' || inp THEN
      authorized := true;
    END IF;
  END IF;
  IF NOT authorized THEN RETURN NULL; END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id', i.id,
      'product_id', i.product_id,
      'product_name_en', i.product_name_en,
      'product_name_ar', i.product_name_ar,
      'size', i.size,
      'color', i.color,
      'quantity', i.quantity,
      'unit_price_egp', i.unit_price_egp
    )),
    '[]'::jsonb
  ) INTO items
  FROM public.order_items AS i
  WHERE i.order_id = o.id;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'id', h.id,
      'status', h.new_status,
      'notes', CASE WHEN public.is_admin() THEN h.note ELSE NULL END,
      'created_at', h.changed_at
    ) ORDER BY h.changed_at),
    '[]'::jsonb
  ) INTO hist
  FROM public.order_status_history AS h
  WHERE h.order_id = o.id
    AND (public.is_admin() OR NOT h.is_internal);

  RETURN jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'customer_name', CASE WHEN public.is_admin() THEN o.customer_name ELSE 'Valued Client' END,
    'status', o.status,
    'payment_method', o.payment_method,
    'governorate', o.governorate,
    'city_area', o.city_area,
    'subtotal_egp', o.subtotal_egp,
    'shipping_egp', o.shipping_egp,
    'discount_egp', o.discount_egp,
    'total_egp', o.total_egp,
    'items', items,
    'status_history', hist,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  );
END;
$function$;
