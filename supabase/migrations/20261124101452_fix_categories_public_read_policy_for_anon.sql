-- Anonymous visitors cannot execute is_admin(), so a public policy that references it fails with
-- "permission denied for function is_admin" as soon as an unpublished category row is evaluated.
-- Public read is restricted to published rows; admins keep full access via the existing
-- "Admin full access on categories" policy (ALL, authenticated, is_admin()).
ALTER POLICY "Public read published categories" ON public.categories
  USING (is_published = true);
