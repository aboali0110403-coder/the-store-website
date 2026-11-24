-- Mero Boutique commerce foundation
-- Public storefront reads published products and submits inquiries/orders through constrained RPCs.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  category text not null,
  category_ar text not null,
  description_en text not null default '',
  description_ar text not null default '',
  fabric_en text not null default '',
  fabric_ar text not null default '',
  embroidery_en text not null default '',
  embroidery_ar text not null default '',
  price_egp numeric(12,2) not null check (price_egp >= 0),
  compare_at_egp numeric(12,2) check (compare_at_egp is null or compare_at_egp >= price_egp),
  image_url text not null default '',
  image_alt text not null default '',
  production_type text not null default 'ready' check (production_type in ('ready','made_to_order','limited')),
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  stock integer not null default 0 check (stock >= 0),
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_published_sort_idx
  on public.products (is_published, sort_order, created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('MB-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_name text not null,
  phone text not null,
  email text,
  governorate text not null,
  city_area text not null,
  address text not null,
  notes text,
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery','prepaid','deposit')),
  status text not null default 'pending' check (status in ('pending','confirmed','in_production','ready_to_ship','shipped','delivered','cancelled')),
  subtotal_egp numeric(12,2) not null check (subtotal_egp >= 0),
  shipping_egp numeric(12,2) check (shipping_egp is null or shipping_egp >= 0),
  total_egp numeric(12,2) check (total_egp is null or total_egp >= 0),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_en text not null,
  product_name_ar text not null,
  size text not null default '',
  color text not null default '',
  quantity integer not null check (quantity between 1 and 20),
  unit_price_egp numeric(12,2) not null check (unit_price_egp >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.custom_design_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default ('CD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_name text not null,
  phone text not null,
  email text,
  garment_type text not null,
  preferred_fabric text,
  preferred_colors text,
  embroidery_style text,
  size_details text,
  description text not null,
  reference_image_urls text[] not null default '{}',
  target_budget_egp numeric(12,2),
  needed_by date,
  deposit_rate numeric(5,2) not null default 30 check (deposit_rate = 30),
  status text not null default 'new' check (status in ('new','contacted','quoted','deposit_paid','in_progress','completed','cancelled')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_design_requests_created_idx on public.custom_design_requests(created_at desc);

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.custom_design_requests enable row level security;

drop policy if exists "Published products are public" on public.products;
create policy "Published products are public"
  on public.products for select to anon, authenticated
  using (is_published = true or public.is_store_admin());

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
  on public.products for all to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists "Admins view orders" on public.orders;
create policy "Admins view orders"
  on public.orders for select to authenticated
  using (public.is_store_admin());

drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders"
  on public.orders for update to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

drop policy if exists "Admins view order items" on public.order_items;
create policy "Admins view order items"
  on public.order_items for select to authenticated
  using (public.is_store_admin());

drop policy if exists "Admins manage custom design requests" on public.custom_design_requests;
create policy "Admins manage custom design requests"
  on public.custom_design_requests for all to authenticated
  using (public.is_store_admin())
  with check (public.is_store_admin());

create or replace function public.submit_store_order(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_governorate text,
  p_city_area text,
  p_address text,
  p_notes text,
  p_payment_method text,
  p_items jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
begin
  if length(trim(coalesce(p_customer_name,''))) < 2 or length(trim(coalesce(p_phone,''))) < 7
     or length(trim(coalesce(p_governorate,''))) < 2 or length(trim(coalesce(p_city_area,''))) < 2
     or length(trim(coalesce(p_address,''))) < 8 then
    raise exception 'Please provide complete delivery details';
  end if;
  if p_payment_method not in ('cash_on_delivery','prepaid','deposit') then
    raise exception 'Unsupported payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid order items';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 20 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and is_published = true;
    if not found then raise exception 'A selected product is unavailable'; end if;
    if v_product.production_type = 'ready' and v_product.stock < v_qty then
      raise exception 'Insufficient stock for %', v_product.name_en;
    end if;
    v_subtotal := v_subtotal + (v_product.price_egp * v_qty);
  end loop;

  insert into public.orders(customer_name,phone,email,governorate,city_area,address,notes,payment_method,subtotal_egp)
  values(trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),trim(p_governorate),trim(p_city_area),trim(p_address),nullif(trim(coalesce(p_notes,'')),''),p_payment_method,v_subtotal)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    insert into public.order_items(order_id,product_id,product_name_en,product_name_ar,size,color,quantity,unit_price_egp)
    values(v_order_id,v_product.id,v_product.name_en,v_product.name_ar,coalesce(v_item->>'size',''),coalesce(v_item->>'color',''),v_qty,v_product.price_egp);
    if v_product.production_type = 'ready' then
      update public.products set stock = stock - v_qty, updated_at = now() where id = v_product.id;
    end if;
  end loop;

  return query select o.id, o.order_number from public.orders o where o.id = v_order_id;
end;
$$;

create or replace function public.submit_custom_design_request(
  p_customer_name text,
  p_phone text,
  p_email text,
  p_garment_type text,
  p_preferred_fabric text,
  p_preferred_colors text,
  p_embroidery_style text,
  p_size_details text,
  p_description text,
  p_reference_image_urls text[],
  p_target_budget_egp numeric,
  p_needed_by date
)
returns table(request_id uuid, request_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if length(trim(coalesce(p_customer_name,''))) < 2
    or length(trim(coalesce(p_phone,''))) < 7
    or length(trim(coalesce(p_garment_type,''))) < 2
    or length(trim(coalesce(p_description,''))) < 12 then
    raise exception 'Please complete the required custom design details';
  end if;
  if coalesce(array_length(p_reference_image_urls,1),0) > 5 then
    raise exception 'A maximum of five reference images is allowed';
  end if;
  insert into public.custom_design_requests(
    customer_name,phone,email,garment_type,preferred_fabric,preferred_colors,
    embroidery_style,size_details,description,reference_image_urls,target_budget_egp,needed_by
  ) values (
    trim(p_customer_name),trim(p_phone),nullif(trim(coalesce(p_email,'')),''),
    trim(p_garment_type),nullif(trim(coalesce(p_preferred_fabric,'')),''),
    nullif(trim(coalesce(p_preferred_colors,'')),''),nullif(trim(coalesce(p_embroidery_style,'')),''),
    nullif(trim(coalesce(p_size_details,'')),''),trim(p_description),
    coalesce(p_reference_image_urls,'{}'),p_target_budget_egp,p_needed_by
  ) returning id into v_id;
  return query select r.id,r.request_number from public.custom_design_requests r where r.id=v_id;
end;
$$;

revoke all on function public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.submit_store_order(text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
revoke all on function public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) from public;
grant execute on function public.submit_custom_design_request(text,text,text,text,text,text,text,text,text,text[],numeric,date) to anon, authenticated;

grant select on public.products to anon, authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.custom_design_requests to authenticated;
grant select on public.admin_users to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select to anon, authenticated
using (bucket_id='product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
on storage.objects for insert to authenticated
with check (bucket_id='product-images' and public.is_store_admin());

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
on storage.objects for update to authenticated
using (bucket_id='product-images' and public.is_store_admin())
with check (bucket_id='product-images' and public.is_store_admin());

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
on storage.objects for delete to authenticated
using (bucket_id='product-images' and public.is_store_admin());
