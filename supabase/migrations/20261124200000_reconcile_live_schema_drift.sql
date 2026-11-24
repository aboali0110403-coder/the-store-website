-- Reconcile live-schema drift into migration history.
-- These objects exist in the live Supabase project (read-only catalog check, 2026-11-24)
-- but were created outside migration history. Every statement is idempotent, so applying
-- this file to the live project changes nothing; applying it to a fresh database
-- recreates what the storefront and Admin already expect.

-- 1. store_settings (read by the storefront for store_contact etc., managed by Admin)
create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.store_settings enable row level security;
drop policy if exists "Admins can manage all settings" on public.store_settings;
create policy "Admins can manage all settings" on public.store_settings
  for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());
drop policy if exists "Public can read public settings" on public.store_settings;
create policy "Public can read public settings" on public.store_settings
  for select to anon, authenticated using (is_public = true);

-- 2. custom design request proposal columns
alter table public.custom_design_requests
  add column if not exists agreed_price_egp numeric,
  add column if not exists customer_approved_at timestamptz,
  add column if not exists deposit_amount_egp numeric,
  add column if not exists production_timeline text,
  add column if not exists proposal_notes text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='custom_design_requests_agreed_price_egp_check') then
    alter table public.custom_design_requests add constraint custom_design_requests_agreed_price_egp_check
      check (agreed_price_egp is null or agreed_price_egp >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='custom_design_requests_deposit_amount_egp_check') then
    alter table public.custom_design_requests add constraint custom_design_requests_deposit_amount_egp_check
      check (deposit_amount_egp is null or deposit_amount_egp >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='shipping_rates_gov_area_key') then
    alter table public.shipping_rates add constraint shipping_rates_gov_area_key unique (governorate, area);
  end if;
end $$;

-- 3. storage: live has no broad SELECT policy on storage.objects for product images
-- (the product-images bucket is public, so object URLs work without one).
drop policy if exists "Public can view product images" on storage.objects;
