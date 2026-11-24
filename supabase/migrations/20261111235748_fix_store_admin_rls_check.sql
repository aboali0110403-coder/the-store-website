create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users as a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
revoke all on function public.is_store_admin() from anon;
grant execute on function public.is_store_admin() to authenticated;

revoke all on table public.admin_users from anon, authenticated;
