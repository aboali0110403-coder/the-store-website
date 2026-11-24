create or replace function public.is_store_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

drop policy if exists "Admins can read own admin membership" on public.admin_users;
create policy "Admins can read own admin membership"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

create index if not exists order_items_product_idx on public.order_items(product_id);

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to authenticated;
