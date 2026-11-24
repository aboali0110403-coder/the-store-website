
drop policy if exists "Admins read product images for upsert" on storage.objects;
create policy "Admins read product images for upsert"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_admin()
);
