import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";

type Snapshot = {
  id: string;
  entity_type: string;
  entity_id: string;
  snapshot_data: Record<string, any>;
  created_at: string;
};

const ENTITY_LABELS: Record<string, string> = {
  attendance_records: "דיווח נוכחות",
  replacement_reports: "דיווח מחליף",
  replacement_planned_events: "אירוע מתוכנן",
  attendance_absences: "היעדרות",
  employees: "עובד",
  clients: "לקוח",
  employee_client_assignments: "שיוך עובד-לקוח",
};

function describe(s: Snapshot) {
  const d = s.snapshot_data || {};
  const name =
    d.worker_name ||
    [d.first_name, d.last_name].filter(Boolean).join(" ") ||
    d.name ||
    d.title ||
    "";
  const date = d.work_date || d.date || d.event_date || "";
  const hours = d.total_hours ?? d.hours_worked ?? d.expected_hours;
  return [name, date, hours != null ? `${Number(hours).toFixed(2)} שעות` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function DeletedRecordsPanel() {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: logs } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("action", "delete")
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = (logs || []).map((l: any) => l.id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("change_snapshots")
      .select("id, entity_type, entity_id, snapshot_data, created_at")
      .in("audit_log_id", ids)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any as Snapshot[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (type === "all" || r.entity_type === type) &&
        (!q || describe(r).toLowerCase().includes(q))
    );
  }, [rows, type, search]);

  const restore = async (s: Snapshot) => {
    setRestoring(s.id);
    const { error } = await supabase.rpc("restore_deleted_row", { _snapshot_id: s.id });
    setRestoring(null);
    if (error) return toast.error(error.message);
    toast.success("הרשומה שוחזרה");
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>שחזור מחיקות</CardTitle>
          <Badge variant="outline">{filtered.length}</Badge>
          <div className="ml-auto flex gap-2">
            <Input
              placeholder="חיפוש..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load}>
              רענן
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            אין מחיקות מתועדות. מהרגע הזה כל מחיקה נשמרת כאן וניתן לשחזר אותה.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מתי נמחק</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>פרטים</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{new Date(s.created_at).toLocaleString("he-IL")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ENTITY_LABELS[s.entity_type] || s.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{describe(s) || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => restore(s)} disabled={restoring === s.id}>
                      {restoring === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" /> שחזר
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
