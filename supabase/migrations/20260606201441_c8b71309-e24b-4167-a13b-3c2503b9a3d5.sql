
CREATE TABLE public.user_nav_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nav_item text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, nav_item)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_nav_permissions TO authenticated;
GRANT ALL ON public.user_nav_permissions TO service_role;

ALTER TABLE public.user_nav_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own nav permissions"
  ON public.user_nav_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins insert nav permissions"
  ON public.user_nav_permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins update nav permissions"
  ON public.user_nav_permissions FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins delete nav permissions"
  ON public.user_nav_permissions FOR DELETE
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_user_nav_permissions_updated_at
  BEFORE UPDATE ON public.user_nav_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
