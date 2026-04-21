import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, RefreshCw, CheckCheck, Bell, UserX, CalendarX } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { AbsenceDialog } from "@/components/attendance/AbsenceDialog";

const Notifications = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(format(firstOfMonth, "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [running, setRunning] = useState(false);

  const [absenceDialog, setAbsenceDialog] = useState<{ employeeId: string; name: string; date: string } | null>(null);

  const { data: notifs, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const lateCount = (notifs || []).filter((n) => n.type === "late_attendance" && !n.is_read).length;
  const missingCount = (notifs || []).filter((n) => n.type === "missing_attendance" && !n.is_read).length;

  const recheck = async () => {
    setRunning(true);
    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc("recheck_all_lateness" as any, { _from_date: from, _to_date: to }),
        supabase.rpc("recheck_all_absences" as any, { _from_date: from, _to_date: to }),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      toast.success(`נבדקו איחורים וחיסורים`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const markAllRead = async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user!.id)
      .eq("is_read", false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="flex flex-col">
      <AppHeader title="Notifications" subtitle="Late attendance & system alerts" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[160px]" />
            </div>
            <Button onClick={recheck} disabled={running} variant="outline" size="sm">
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Re-check Lateness & Absences
            </Button>
            <Button onClick={markAllRead} variant="ghost" size="sm">
              <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Badge variant={missingCount > 0 ? "destructive" : "secondary"}>
                <UserX className="h-3 w-3 mr-1" />{missingCount} חיסורים
              </Badge>
              <Badge variant={lateCount > 0 ? "destructive" : "secondary"}>
                {lateCount} איחורים
              </Badge>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !notifs?.length ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              No notifications yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => {
              const isAbsence = n.type === "missing_attendance" && n.entity_type === "employee_absence";
              // Parse "חיסור: FirstName LastName - DD/MM/YYYY"
              let parsedDate: string | null = null;
              let parsedName: string | null = null;
              if (isAbsence) {
                const m = n.title.match(/חיסור:\s*(.+?)\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
                if (m) {
                  parsedName = m[1].trim();
                  parsedDate = `${m[4]}-${m[3]}-${m[2]}`;
                }
              }
              const Icon = isAbsence ? CalendarX : AlertTriangle;
              return (
                <Card
                  key={n.id}
                  className={`border-0 shadow-sm cursor-pointer transition ${!n.is_read ? "bg-accent/40" : ""}`}
                  onClick={() => !n.is_read && markRead(n.id)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`mt-0.5 ${n.type === "late_attendance" ? "text-destructive" : isAbsence ? "text-orange-500" : "text-primary"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{n.title}</span>
                        {!n.is_read && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">NEW</Badge>}
                      </div>
                      {n.message && <p className="text-xs text-muted-foreground mt-1">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                      </p>
                    </div>
                    {isAbsence && parsedDate && parsedName && n.entity_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAbsenceDialog({ employeeId: n.entity_id!, name: parsedName!, date: parsedDate! });
                        }}
                      >
                        סמן חיסור
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {absenceDialog && (
        <AbsenceDialog
          open={!!absenceDialog}
          onOpenChange={(o) => !o && setAbsenceDialog(null)}
          employeeId={absenceDialog.employeeId}
          employeeName={absenceDialog.name}
          date={absenceDialog.date}
        />
      )}
    </div>
  );
};

export default Notifications;
