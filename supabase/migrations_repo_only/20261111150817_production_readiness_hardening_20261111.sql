-- Mero Boutique Production Readiness Hardening
-- Non-destructive: functions, grants, and storage policy only.
-- No table/data deletion or mutation outside order RPC transactions.

-- SECURITY DEFINER helpers: only signed-in users may invoke admin checks directly.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_store_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_admin() TO authenticated;

-- Keep guest-facing RPCs callable by visitors, but pin their search_path.
ALTER FUNCTION public.lookup_public_order(text, text, text)
  SET search_path = pg_catalog, public, auth, extensions;
ALTER FUNCTION public.submit_custom_design_request(text, text, text, text, text, text, text, text, text, text[], numeric, date)
  SET search_path = pg_catalog, public, auth, extensions;

-- Guest order submission: server-authoritative prices, shipping, coupons, idempotency,
-- row locks, and stock rules for ready/limited only. Made-to-order never uses stock.
CREATE OR REPLACE FUNCTION public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_governorate text DEFAULT NULL,
  p_city_area text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash_on_delivery',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_product record;
  v_variant record;
  v_subtotal numeric := 0;
  v_shipping numeric := 60;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_qty integer;
  v_has_variants boolean;
  v_coupon_code text;
  v_coupon record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters.';
  END IF;
  IF p_phone IS NULL OR length(regexp_replace(trim(p_phone), '\D', '', 'g')) < 7 THEN
    RAISE EXCEPTION 'Please provide a valid contact phone number.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one line item.';
  END IF;

  -- Safe retry: return the original order before touching inventory.
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) >= 16 THEN
    SELECT o.id, o.order_number, o.subtotal_egp, o.shipping_egp, o.total_egp
      INTO order_id, order_number, subtotal_egp, shipping_egp, total_egp
    FROM public.orders o
    WHERE o.idempotency_key = trim(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN RETURN NEXT; RETURN; END IF;
  END IF;

  SELECT sr.fee_egp INTO v_shipping
  FROM public.shipping_rates sr
  WHERE lower(trim(sr.governorate)) = lower(trim(coalesce(p_governorate, '')))
    AND sr.is_active = true
  LIMIT 1;
  v_shipping := coalesce(v_shipping, 60);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'Item quantity must be between 1 and 20.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid AND is_published = true
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product is no longer available.'; END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.product_variants pv
      WHERE pv.product_id = v_product.id AND pv.is_active = true
    ) INTO v_has_variants;

    IF v_product.production_type IN ('ready', 'limited') THEN
      IF v_has_variants THEN
        SELECT * INTO v_variant
        FROM public.product_variants pv
        WHERE pv.product_id = v_product.id
          AND lower(trim(pv.size)) = lower(trim(coalesce(v_item->>'size', '')))
          AND lower(trim(pv.color)) = lower(trim(coalesce(v_item->>'color', '')))
          AND pv.is_active = true
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected size/color is not available.'; END IF;
        IF v_variant.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
        UPDATE public.product_variants
        SET stock = stock - v_qty, updated_at = now()
        WHERE id = v_variant.id;
        UPDATE public.products p
        SET stock = (SELECT coalesce(sum(pv.stock), 0) FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true),
            updated_at = now()
        WHERE p.id = v_product.id;
      ELSE
        IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
        UPDATE public.products SET stock = stock - v_qty, updated_at = now() WHERE id = v_product.id;
      END IF;
    END IF;

    v_subtotal := v_subtotal + (v_product.price_egp * v_qty);
  END LOOP;

  -- The UI records the selected code in notes; the server independently validates it.
  IF p_notes ILIKE '%[Applied Coupon:%' THEN
    v_coupon_code := upper(trim(substring(p_notes FROM '\[Applied Coupon:\s*([A-Za-z0-9_-]+)\]')));
    SELECT * INTO v_coupon
    FROM public.coupons c
    WHERE upper(trim(c.code)) = v_coupon_code AND c.is_active = true
    LIMIT 1;
    IF FOUND AND (v_coupon.expires_at IS NULL OR v_coupon.expires_at > now())
       AND v_subtotal >= coalesce(v_coupon.min_order_egp, 0) THEN
      IF v_coupon.discount_type = 'percent' THEN
        v_discount := round((v_subtotal * v_coupon.discount_value) / 100);
      ELSE
        v_discount := least(v_subtotal, v_coupon.discount_value);
      END IF;
    END IF;
  END IF;

  v_discount := greatest(0, least(v_subtotal, v_discount));
  v_total := greatest(0, v_subtotal - v_discount + v_shipping);
  v_order_number := 'MERO-' || nextval('public.order_number_seq')::text;

  INSERT INTO public.orders(
    id, order_number, customer_name, phone, email, governorate, city_area, address,
    notes, payment_method, status, subtotal_egp, shipping_egp, discount_egp, total_egp,
    admin_notes, tracking_token, idempotency_key
  ) VALUES (
    v_order_id, v_order_number, trim(p_customer_name), trim(p_phone), nullif(trim(coalesce(p_email, '')), ''),
    trim(p_governorate), trim(p_city_area), trim(p_address), p_notes, coalesce(p_payment_method, 'cash_on_delivery'),
    'pending', v_subtotal, v_shipping, v_discount, v_total,
    CASE WHEN v_discount > 0 THEN 'Applied coupon: ' || v_coupon_code || ' (-' || v_discount || ' EGP)' ELSE NULL END,
    gen_random_uuid(), nullif(trim(coalesce(p_idempotency_key, '')), '')
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items(
      order_id, product_id, product_name_en, product_name_ar, size, color, quantity, unit_price_egp
    ) VALUES (
      v_order_id, v_product.id, v_product.name_en, v_product.name_ar,
      coalesce(v_item->>'size', ''), coalesce(v_item->>'color', ''), (v_item->>'quantity')::integer, v_product.price_egp
    );
  END LOOP;

  INSERT INTO public.order_status_history(order_id, old_status, new_status, note, changed_by, is_internal)
  VALUES (v_order_id, NULL, 'pending', 'Order received via boutique online storefront', auth.uid(), false);

  RETURN QUERY SELECT v_order_id, v_order_number, v_subtotal, v_shipping, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_store_order(text, text, text, text, text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_store_order(text, text, text, text, text, text, text, text, jsonb, text) TO anon, authenticated;

-- Admin status transition: one transaction for status, history, and cancellation stock restore.
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions
AS $$
DECLARE
  v_order record;
  v_item record;
  v_variant record;
BEGIN
  IF NOT public.is_store_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_new_status IS NULL OR length(trim(p_new_status)) = 0 THEN RAISE EXCEPTION 'Invalid order status'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.status IS DISTINCT FROM 'cancelled' AND trim(p_new_status) = 'cancelled' THEN
    FOR v_item IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id = p_order_id
    LOOP
      SELECT p.* INTO v_order FROM public.products p WHERE p.id = v_item.product_id FOR UPDATE;
      IF FOUND AND v_order.production_type IN ('ready', 'limited') THEN
        SELECT pv.* INTO v_variant
        FROM public.product_variants pv
        WHERE pv.product_id = v_item.product_id
          AND lower(trim(pv.size)) = lower(trim(coalesce(v_item.size, '')))
          AND lower(trim(pv.color)) = lower(trim(coalesce(v_item.color, '')))
          AND pv.is_active = true
        FOR UPDATE;
        IF FOUND THEN
          UPDATE public.product_variants SET stock = stock + v_item.quantity, updated_at = now() WHERE id = v_variant.id;
          UPDATE public.products p
          SET stock = (SELECT coalesce(sum(pv.stock), 0) FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true), updated_at = now()
          WHERE p.id = v_item.product_id;
        ELSE
          UPDATE public.products SET stock = stock + v_item.quantity, updated_at = now() WHERE id = v_item.product_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders
  SET status = trim(p_new_status), admin_notes = coalesce(p_note, admin_notes), updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history(order_id, old_status, new_status, note, changed_by, is_internal)
  VALUES (p_order_id, v_order.status, trim(p_new_status), coalesce(p_note, 'Status updated to ' || trim(p_new_status)), auth.uid(), false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text, text) TO authenticated;

-- Restrict design-reference uploads to authenticated/anonymous API roles, the intended folder,
-- and image extensions. Bucket-level 5MB/private settings remain enforced.
DROP POLICY IF EXISTS "Public upload design references" ON storage.objects;
CREATE POLICY "Public upload design references"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'design-references'
    AND (storage.foldername(name))[1] = 'references'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );
