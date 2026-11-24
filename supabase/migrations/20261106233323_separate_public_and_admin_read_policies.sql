-- Do not call the admin membership helper from the anon role.
DROP POLICY IF EXISTS "Published products are public" ON public.products;
CREATE POLICY "Published products are public" ON public.products
  FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "Published products visible to authenticated users" ON public.products
  FOR SELECT TO authenticated USING (is_published = true OR public.is_store_admin());

DROP POLICY IF EXISTS "Public can view images for published products" ON public.product_images;
CREATE POLICY "Public can view images for published products" ON public.product_images
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true));
CREATE POLICY "Published product images visible to authenticated users" ON public.product_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true)
    OR public.is_store_admin()
  );

DROP POLICY IF EXISTS "Public can view active variants for published products" ON public.product_variants;
CREATE POLICY "Public can view active variants for published products" ON public.product_variants
  FOR SELECT TO anon
  USING (is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true));
CREATE POLICY "Published product variants visible to authenticated users" ON public.product_variants
  FOR SELECT TO authenticated
  USING (
    (is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_published = true))
    OR public.is_store_admin()
  );

DROP POLICY IF EXISTS "Public can view active shipping rates" ON public.shipping_rates;
CREATE POLICY "Public can view active shipping rates" ON public.shipping_rates
  FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Active shipping rates visible to authenticated users" ON public.shipping_rates
  FOR SELECT TO authenticated USING (is_active = true OR public.is_store_admin());
