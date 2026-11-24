-- Customer checkout/design forms are guest-facing. Admin accounts do not need
-- these SECURITY DEFINER submission RPCs.
REVOKE EXECUTE ON FUNCTION public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) TO anon;

REVOKE EXECUTE ON FUNCTION public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) TO anon;

-- The membership helper is only needed by authenticated RLS policies.
REVOKE EXECUTE ON FUNCTION public.is_store_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_admin() TO authenticated;

-- Cover the new foreign keys to avoid unindexed-FK warnings.
CREATE INDEX IF NOT EXISTS order_status_history_changed_by_idx
  ON public.order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS orders_coupon_id_idx
  ON public.orders(coupon_id);
