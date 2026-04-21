import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Plus, Trash2, UserX, Building2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const REASONS = [
  { value: "no_work", label: "אין עבודה" },
  { value: "holiday", label: "חופשה" },
  { value: "sick", label: "מחלה" },
  { value: "vacation", label: "חופש" },
  { value: "other", label: "אחר" },
];

const reasonLabel = (r: string) => REASONS.find((x) => x.value === r)?.label || r;

export const NoWorkPeriodsPanel = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scope, setScope] = useState<"employee" | "client">("employee");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("no_work");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: periods = [] } = useQuery({
    queryKey: ["no-work-periods"],
    queryFn: async () => {
      const { data } = await supabase
        .from("no_work_periods" as any)
        .select("*, employees(first_name, last_name), clients(name)")
        .order("from_date", { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .order("first_name");
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-active-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      return data || [];
    },
  });

  const reset = () => {
    setScope("employee");
    setEmployeeId("");
    setClientId("");
    setFromDate(undefined);
    setToDate(undefined);
    setReason("no_work");
    setNotes("");
  };

  const handleSave = async () => {
    if (!fromDate || !toDate) {
      toast({ title: "חסרים תאריכים", description: "יש לבחור תאריך התחלה וסיום", variant: "destructive" });
      return;
    }
    if (scope === "employee" && !employeeId) {
      toast({ title: "חסר עובד", variant: "destructive" });
      return;
    }
    if (scope === "client" && !clientId) {
      toast({ title: "חסר לקוח", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      scope,
      employee_id: scope === "employee" ? employeeId : null,
      client_id: scope === "client" ? clientId : null,
      from_date: format(fromDate, "yyyy-MM-dd"),
      to_date: format(toDate, "yyyy-MM-dd"),
      reason,
      notes: notes || null,
    };
    const { error } = await supabase.from("no_work_periods" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "נשמר", description: "תקופת אי-עבודה נוצרה והחיסורים בטווח עודכנו" });
    qc.invalidateQueries({ queryKey: ["no-work-periods"] });
    qc.invalidateQueries({ queryKey: ["attendance-range"] });
    qc.invalidateQueries({ queryKey: ["attendance-absences"] });
    qc.invalidateQueries({ queryKey: ["alerts-absences"] });
    reset();
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("למחוק את התקופה? החיסורים שסומנו לא יוחזרו אוטומטית.")) return;
    const { error } = await supabase.from("no_work_periods" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["no-work-periods"] });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold">תקופות "אין עבודה"</CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> הוסף תקופה
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {periods.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            אין תקופות מוגדרות. הוסף תקופה כדי לבטל אוטומטית חיסורים בטווח תאריכים.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>סוג</TableHead>
                <TableHead>עובד / לקוח</TableHead>
                <TableHead>מתאריך</TableHead>
                <TableHead>עד תאריך</TableHead>
                <TableHead>סיבה</TableHead>
                <TableHead>הערות</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.scope === "employee" ? (
                      <Badge variant="outline" className="gap-1"><UserX className="h-3 w-3" />עובד</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />לקוח</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.scope === "employee"
                      ? `${p.employees?.first_name || ""} ${p.employees?.last_name || ""}`.trim() || "—"
                      : p.clients?.name || "—"}
                  </TableCell>
                  <TableCell>{format(new Date(p.from_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{format(new Date(p.to_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{reasonLabel(p.reason)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוסף תקופת אי-עבודה</DialogTitle>
          </DialogHeader>

          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="employee">לעובד</TabsTrigger>
              <TabsTrigger value="client">ללקוח</TabsTrigger>
            </TabsList>

            <TabsContent value="employee" className="space-y-2 pt-3">
              <Label>עובד</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="בחר עובד" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="client" className="space-y-2 pt-3">
              <Label>לקוח</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="space-y-2">
              <Label>מתאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "dd/MM/yyyy") : "בחר"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fromDate} onSelect={setFromDate} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>עד תאריך</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "dd/MM/yyyy") : "בחר"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={toDate} onSelect={setToDate} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>סיבה</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>הערות (אופציונלי)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "שומר..." : "שמור"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
