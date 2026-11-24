grant select on table public.admin_users to authenticated;

drop policy if exists "Users can verify their own admin status" on public.admin_users;
create policy "Users can verify their own admin status"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));
