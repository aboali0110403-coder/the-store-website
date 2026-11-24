-- Explicitly remove direct anon invocation of administrative helpers.
ALTER FUNCTION public.is_admin() SET search_path = pg_catalog, public, auth, extensions;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text, text) TO authenticated;
