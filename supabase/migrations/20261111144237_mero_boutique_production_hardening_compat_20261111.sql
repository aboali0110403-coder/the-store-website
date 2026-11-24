BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS public.bespoke_request_seq START WITH 2000;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE public.orders SET tracking_token = gen_random_uuid() WHERE tracking_token IS NULL;
ALTER TABLE public.orders ALTER COLUMN tracking_token SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.order_status_history ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, auth, extensions
AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()); $$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name_en text NOT NULL,
  name_ar text NOT NULL, filter text NOT NULL UNIQUE, image_url text NOT NULL,
  description_en text DEFAULT '', description_ar text DEFAULT '', sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read published categories" ON public.categories;
CREATE POLICY "Public read published categories" ON public.categories FOR SELECT TO public USING (is_published = true OR public.is_admin());
DROP POLICY IF EXISTS "Admin full access on categories" ON public.categories;
CREATE POLICY "Admin full access on categories" ON public.categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_published ON public.categories(is_published, sort_order);
INSERT INTO public.categories (slug,name_en,name_ar,filter,image_url,sort_order,is_published) VALUES
('dresses','Embroidered Dresses','فساتين مطرزة','Dresses','/products/embroidered-dress.svg',1,true),
('abayas','Abayas','عبايات','Abayas','/products/heritage-abaya.svg',2,true),
('kaftans','Kaftans','قفاطين','Kaftans','/products/golden-kaftan.svg',3,true),
('tops','Embroidered Tops','قمصان مطرزة','Tops','/products/embroidered-top.svg',4,true),
('sets','Two-Piece Sets','أطقم من قطعتين','Sets','/products/ivory-set.svg',5,true),
('exclusive-pieces','Exclusive Pieces','قطع حصرية','Exclusive Pieces','/products/embroidered-dress.svg',6,true)
ON CONFLICT (slug) DO NOTHING;

DROP FUNCTION IF EXISTS public.submit_store_order(text,text,text,text,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.submit_store_order(text,text,text,text,text,text,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.submit_store_order(
 p_customer_name text, p_phone text, p_email text DEFAULT NULL, p_governorate text DEFAULT 'Cairo',
 p_city_area text DEFAULT '', p_address text DEFAULT '', p_notes text DEFAULT NULL,
 p_payment_method text DEFAULT 'cash_on_delivery', p_items jsonb DEFAULT '[]'::jsonb, p_idempotency_key text DEFAULT NULL
) RETURNS TABLE(order_id uuid, order_number text, subtotal_egp numeric, shipping_egp numeric, total_egp numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE v_order_id uuid := gen_random_uuid(); v_order_number text; v_item jsonb; v_product record; v_variant record;
 v_subtotal numeric := 0; v_shipping numeric := 60; v_discount numeric := 0; v_total numeric := 0; v_qty integer; v_has_variants boolean;
BEGIN
 IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name must be at least 2 characters.'; END IF;
 IF p_phone IS NULL OR length(regexp_replace(trim(p_phone),'\D','','g')) < 7 THEN RAISE EXCEPTION 'Please provide a valid contact phone number.'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Order must contain at least one line item.'; END IF;
 IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
   SELECT o.id,o.order_number,o.subtotal_egp,o.shipping_egp,o.total_egp INTO v_order_id,v_order_number,v_subtotal,v_shipping,v_total FROM public.orders o WHERE o.idempotency_key=trim(p_idempotency_key) LIMIT 1;
   IF FOUND THEN RETURN QUERY SELECT v_order_id,v_order_number,v_subtotal,v_shipping,v_total; RETURN; END IF;
 END IF;
 v_order_number := 'MERO-' || nextval('public.order_number_seq')::text;
 SELECT fee_egp INTO v_shipping FROM public.shipping_rates WHERE lower(trim(governorate))=lower(trim(p_governorate)) AND is_active=true LIMIT 1;
 v_shipping := coalesce(v_shipping,60);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   v_qty := (v_item->>'quantity')::integer;
   IF v_qty < 1 OR v_qty > 20 THEN RAISE EXCEPTION 'Item quantity must be between 1 and 20.'; END IF;
   SELECT * INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid AND is_published=true FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product is no longer available.'; END IF;
   SELECT EXISTS(SELECT 1 FROM public.product_variants WHERE product_id=v_product.id AND is_active=true) INTO v_has_variants;
   IF v_has_variants THEN
     SELECT * INTO v_variant FROM public.product_variants WHERE product_id=v_product.id AND lower(trim(size))=lower(trim(coalesce(v_item->>'size',''))) AND lower(trim(color))=lower(trim(coalesce(v_item->>'color',''))) AND is_active=true FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Selected size/color is not available.'; END IF;
     IF v_product.production_type IN ('ready','limited') THEN
       IF v_variant.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
       UPDATE public.product_variants SET stock=stock-v_qty, updated_at=now() WHERE id=v_variant.id;
       UPDATE public.products p SET stock=(SELECT coalesce(sum(stock),0) FROM public.product_variants pv WHERE pv.product_id=p.id AND pv.is_active=true), updated_at=now() WHERE p.id=v_product.id;
     END IF;
   ELSIF v_product.production_type IN ('ready','limited') THEN
     IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
     UPDATE public.products SET stock=stock-v_qty, updated_at=now() WHERE id=v_product.id;
   END IF;
   v_subtotal := v_subtotal + v_product.price_egp*v_qty;
 END LOOP;
 v_total := greatest(0,v_subtotal-v_discount+v_shipping);
 INSERT INTO public.orders(id,order_number,customer_name,phone,email,governorate,city_area,address,notes,payment_method,status,subtotal_egp,shipping_egp,total_egp,tracking_token,idempotency_key)
 VALUES(v_order_id,v_order_number,trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),trim(p_governorate),trim(p_city_area),trim(p_address),p_notes,p_payment_method,'pending',v_subtotal,v_shipping,v_total,gen_random_uuid(),nullif(trim(coalesce(p_idempotency_key,'')),''));
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid;
   INSERT INTO public.order_items(order_id,product_id,product_name_en,product_name_ar,size,color,quantity,unit_price_egp) VALUES(v_order_id,v_product.id,v_product.name_en,v_product.name_ar,coalesce(v_item->>'size',''),coalesce(v_item->>'color',''),(v_item->>'quantity')::integer,v_product.price_egp);
 END LOOP;
 INSERT INTO public.order_status_history(order_id,new_status,note,changed_by,is_internal) VALUES(v_order_id,'pending','Order received via boutique online storefront',auth.uid(),false);
 RETURN QUERY SELECT v_order_id,v_order_number,v_subtotal,v_shipping,v_total;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_store_order TO anon, authenticated;

DROP FUNCTION IF EXISTS public.lookup_public_order(text,text,text);
CREATE OR REPLACE FUNCTION public.lookup_public_order(p_order_number text,p_phone text DEFAULT NULL,p_tracking_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,extensions AS $$
DECLARE o record; items jsonb; hist jsonb; authorized boolean:=false; inp text; ordp text;
BEGIN
 SELECT * INTO o FROM public.orders WHERE upper(order_number)=upper(trim(p_order_number)) OR upper(order_number)='MERO-'||upper(trim(p_order_number)) LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF public.is_admin() THEN authorized:=true; END IF;
 IF NOT authorized AND p_tracking_token IS NOT NULL AND trim(p_tracking_token)<>'' AND o.tracking_token::text=trim(p_tracking_token) THEN authorized:=true; END IF;
 IF NOT authorized AND p_phone IS NOT NULL AND length(regexp_replace(trim(p_phone),'\D','','g'))>=9 THEN
   inp:=regexp_replace(trim(p_phone),'\D','','g'); ordp:=regexp_replace(coalesce(o.phone,''),'\D','','g');
   IF inp=ordp OR inp='2'||ordp OR ordp='2'||inp OR inp='20'||ordp OR ordp='20'||inp THEN authorized:=true; END IF;
 END IF;
 IF NOT authorized THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'product_name_en',i.product_name_en,'product_name_ar',i.product_name_ar,'size',i.size,'color',i.color,'quantity',i.quantity,'unit_price_egp',i.unit_price_egp)),'[]'::jsonb) INTO items FROM public.order_items i WHERE i.order_id=o.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status',h.new_status,'notes',CASE WHEN public.is_admin() OR NOT h.is_internal THEN h.note ELSE NULL END,'created_at',h.changed_at) ORDER BY h.changed_at),'[]'::jsonb) INTO hist FROM public.order_status_history h WHERE h.order_id=o.id AND (public.is_admin() OR NOT h.is_internal);
 RETURN jsonb_build_object('id',o.id,'order_number',o.order_number,'customer_name',CASE WHEN public.is_admin() THEN o.customer_name ELSE 'Valued Client' END,'status',o.status,'payment_method',o.payment_method,'governorate',o.governorate,'city_area',o.city_area,'subtotal_egp',o.subtotal_egp,'shipping_egp',o.shipping_egp,'discount_egp',o.discount_egp,'total_egp',o.total_egp,'items',items,'status_history',hist,'created_at',o.created_at,'updated_at',o.updated_at);
END; $$;
GRANT EXECUTE ON FUNCTION public.lookup_public_order TO anon, authenticated;

DROP FUNCTION IF EXISTS public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date);
CREATE OR REPLACE FUNCTION public.submit_custom_design_request(p_customer_name text,p_phone text,p_email text DEFAULT NULL,p_garment_type text DEFAULT 'Embroidered Dress',p_preferred_fabric text DEFAULT NULL,p_preferred_colors text DEFAULT NULL,p_embroidery_style text DEFAULT NULL,p_size_details text DEFAULT NULL,p_description text DEFAULT '',p_reference_image_urls text[] DEFAULT '{}'::text[],p_target_budget_egp numeric DEFAULT NULL,p_needed_by date DEFAULT NULL)
RETURNS TABLE(request_id uuid,request_number text,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,extensions AS $$
DECLARE rid uuid:=gen_random_uuid(); rnum text:='MERO-DES-'||nextval('public.bespoke_request_seq')::text;
BEGIN
 IF p_customer_name IS NULL OR length(trim(p_customer_name))<2 THEN RAISE EXCEPTION 'Please enter your name.'; END IF;
 IF p_phone IS NULL OR length(regexp_replace(trim(p_phone),'\D','','g'))<7 THEN RAISE EXCEPTION 'Please enter a valid phone number.'; END IF;
 IF p_description IS NULL OR length(trim(p_description))<5 THEN RAISE EXCEPTION 'Please provide a brief description.'; END IF;
 INSERT INTO public.custom_design_requests(id,request_number,customer_name,phone,email,garment_type,preferred_fabric,preferred_colors,embroidery_style,size_details,description,reference_image_urls,target_budget_egp,needed_by,status)
 VALUES(rid,rnum,trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),trim(p_garment_type),p_preferred_fabric,p_preferred_colors,p_embroidery_style,p_size_details,trim(p_description),coalesce(p_reference_image_urls,'{}'::text[]),p_target_budget_egp,p_needed_by,'new');
 RETURN QUERY SELECT rid,rnum,'new'::text;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_custom_design_request TO anon, authenticated;

DROP FUNCTION IF EXISTS public.track_order_status(text);
NOTIFY pgrst, 'reload schema';
COMMIT;
