BEGIN;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('design-references','design-references',false,5242880,ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp']::text[];
DROP POLICY IF EXISTS "Public upload design references" ON storage.objects;
CREATE POLICY "Public upload design references" ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id='design-references' AND (storage.foldername(name))[1]='references');
DROP POLICY IF EXISTS "Admin read design references" ON storage.objects;
CREATE POLICY "Admin read design references" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='design-references' AND public.is_admin());
DROP POLICY IF EXISTS "Admin delete design references" ON storage.objects;
CREATE POLICY "Admin delete design references" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='design-references' AND public.is_admin());
COMMIT; NOTIFY pgrst, 'reload schema';
