CREATE OR REPLACE FUNCTION public.get_active_client_locations()
RETURNS TABLE(id uuid, name text, location_lat numeric, location_lng numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, location_lat, location_lng
  FROM public.clients
  WHERE status = 'active'
    AND location_lat IS NOT NULL
    AND location_lng IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_client_locations() TO public;
GRANT EXECUTE ON FUNCTION public.get_active_client_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_client_locations() TO service_role;