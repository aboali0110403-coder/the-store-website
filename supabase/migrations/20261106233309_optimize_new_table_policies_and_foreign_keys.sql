-- Avoid duplicate permissive SELECT policies while retaining admin writes.
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins insert product images" ON public.product_images
  FOR INSERT TO authenticated WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins update product images" ON public.product_images
  FOR UPDATE TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins delete product images" ON public.product_images
  FOR DELETE TO authenticated USING (public.is_store_admin());

DROP POLICY IF EXISTS "Admins manage product variants" ON public.product_variants;
CREATE POLICY "Admins insert product variants" ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins update product variants" ON public.product_variants
  FOR UPDATE TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins delete product variants" ON public.product_variants
  FOR DELETE TO authenticated USING (public.is_store_admin());

DROP POLICY IF EXISTS "Admins manage shipping rates" ON public.shipping_rates;
CREATE POLICY "Admins insert shipping rates" ON public.shipping_rates
  FOR INSERT TO authenticated WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins update shipping rates" ON public.shipping_rates
  FOR UPDATE TO authenticated USING (public.is_store_admin()) WITH CHECK (public.is_store_admin());
CREATE POLICY "Admins delete shipping rates" ON public.shipping_rates
  FOR DELETE TO authenticated USING (public.is_store_admin());

CREATE INDEX IF NOT EXISTS order_status_history_changed_by_idx
  ON public.order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS orders_coupon_id_idx
  ON public.orders(coupon_id);
