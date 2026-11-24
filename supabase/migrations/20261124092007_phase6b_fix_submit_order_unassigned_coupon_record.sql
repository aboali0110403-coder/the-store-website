-- Fix: submit_store_order referenced v_coupon.id in the orders INSERT even when no coupon was applied.
-- PL/pgSQL raises 'record "v_coupon" is not assigned yet' for every order without a coupon.
-- Idempotent: only rewrites the function if the defective expression is still present.
DO $fix$
DECLARE
  d text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.submit_store_order(text,text,text,text,text,text,text,text,jsonb,text)'))
    INTO d;
  IF d IS NULL THEN
    RAISE EXCEPTION 'public.submit_store_order signature not found';
  END IF;
  IF position('CASE WHEN v_coupon_applied THEN v_coupon.id ELSE NULL END' IN d) = 0 THEN
    RETURN;
  END IF;
  d := replace(d, 'CASE WHEN v_coupon_applied THEN v_coupon.id ELSE NULL END', 'v_coupon_id');
  d := replace(d, E'  v_rate_count integer := 0;', E'  v_rate_count integer := 0;\n  v_coupon_id uuid := NULL;');
  d := replace(d, 'v_coupon_applied := true;', E'v_coupon_applied := true;\n    v_coupon_id := v_coupon.id;');
  IF position('v_coupon_id uuid := NULL;' IN d) = 0 OR position('v_coupon_id := v_coupon.id;' IN d) = 0 THEN
    RAISE EXCEPTION 'Unexpected function text; aborting';
  END IF;
  EXECUTE d;
END;
$fix$;
