import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns a function isVisible(navItem) for current user.
 * Owners always see everything. Missing row defaults to visible.
 */
export function useNavPermissions() {
  const { user, roles } = useAuth();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const isOwner = roles.includes("owner");

  useEffect(() => {
    if (!user) {
      setHidden(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_nav_permissions" as any)
        .select("nav_item,is_visible")
        .eq("user_id", user.id);
      if (cancelled) return;
      const s = new Set<string>();
      (data as any[] | null)?.forEach((r) => {
        if (r.is_visible === false) s.add(r.nav_item);
      });
      setHidden(s);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const isVisible = (navItem: string) => {
    if (isOwner) return true;
    return !hidden.has(navItem);
  };

  return { isVisible, loading, isOwner };
}
