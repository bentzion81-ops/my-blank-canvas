import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ALL_NAV_ITEMS } from "@/lib/navItems";

type UserRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  last_login: string | null;
  roles: string[];
};

const UserManagement = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [permLoading, setPermLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, is_active, last_login"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    setUsers(
      (profiles ?? []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name || "—",
        email: p.email,
        is_active: p.is_active,
        last_login: p.last_login,
        roles: roleMap.get(p.user_id) ?? [],
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openPerms = async (u: UserRow) => {
    setSelected(u);
    setPermLoading(true);
    const init: Record<string, boolean> = {};
    ALL_NAV_ITEMS.forEach((n) => (init[n] = true));
    const { data } = await supabase
      .from("user_nav_permissions" as any)
      .select("nav_item,is_visible")
      .eq("user_id", u.user_id);
    (data as any[] | null)?.forEach((r) => {
      init[r.nav_item] = r.is_visible;
    });
    setPerms(init);
    setPermLoading(false);
  };

  const closeDialog = () => {
    setSelected(null);
    setPerms({});
  };

  const savePerms = async () => {
    if (!selected) return;
    setSaving(true);
    const rows = ALL_NAV_ITEMS.map((n) => ({
      user_id: selected.user_id,
      nav_item: n,
      is_visible: perms[n] ?? true,
    }));
    const { error } = await supabase
      .from("user_nav_permissions" as any)
      .upsert(rows, { onConflict: "user_id,nav_item" });
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הרשאות נשמרו" });
    closeDialog();
  };

  const isOwner = selected?.roles.includes("owner");

  return (
    <div className="flex flex-col">
      <AppHeader title="User Management" subtitle="Manage users and permissions" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      טוען...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      אין משתמשים
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell className="capitalize">{u.roles.join(", ") || "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={u.is_active ? "active" : "inactive"} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openPerms(u)}>
                          <Shield className="h-4 w-4 mr-1" /> הרשאות ניווט
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הרשאות ניווט — {selected?.full_name}</DialogTitle>
            <DialogDescription>
              {isOwner
                ? "משתמש Owner רואה תמיד את כל הלשוניות, לא ניתן להסתיר ממנו."
                : "סמן אילו לשוניות יוצגו למשתמש בסרגל הצד."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {permLoading ? (
              <p className="text-center text-muted-foreground py-4">טוען...</p>
            ) : (
              ALL_NAV_ITEMS.map((n) => (
                <div key={n} className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor={`nav-${n}`} className="cursor-pointer">
                    {n}
                  </Label>
                  <Switch
                    id={`nav-${n}`}
                    checked={isOwner ? true : perms[n] ?? true}
                    disabled={isOwner}
                    onCheckedChange={(v) => setPerms((p) => ({ ...p, [n]: v }))}
                  />
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={savePerms} disabled={saving || isOwner || permLoading}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
