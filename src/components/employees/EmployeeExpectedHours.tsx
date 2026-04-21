import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

type DayType = "weekday" | "friday" | "saturday";

interface DayConfig {
  day_type: DayType;
  is_working_day: boolean;
  expected_check_in: string;
  expected_check_out: string;
}

const LABELS: Record<DayType, string> = {
  weekday: "Sun–Thu (ימי חול)",
  friday: "Friday (שישי)",
  saturday: "Saturday (שבת)",
};

const DEFAULTS: DayConfig[] = [
  { day_type: "weekday", is_working_day: true, expected_check_in: "08:00", expected_check_out: "17:00" },
  { day_type: "friday", is_working_day: false, expected_check_in: "08:00", expected_check_out: "13:00" },
  { day_type: "saturday", is_working_day: false, expected_check_in: "", expected_check_out: "" },
];

export const EmployeeExpectedHours = ({ employeeId }: { employeeId: string }) => {
  const qc = useQueryClient();
  const [rows, setRows] = useState<DayConfig[]>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["employee-expected-hours", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_expected_hours" as any)
        .select("*")
        .eq("employee_id", employeeId);
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (!data) return;
    const merged = DEFAULTS.map((d) => {
      const found = data.find((x: any) => x.day_type === d.day_type);
      return found
        ? {
            day_type: d.day_type,
            is_working_day: found.is_working_day,
            expected_check_in: found.expected_check_in?.slice(0, 5) || "",
            expected_check_out: found.expected_check_out?.slice(0, 5) || "",
          }
        : d;
    });
    setRows(merged);
  }, [data]);

  const update = (i: number, field: keyof DayConfig, value: any) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        employee_id: employeeId,
        day_type: r.day_type,
        is_working_day: r.is_working_day,
        expected_check_in: r.is_working_day && r.expected_check_in ? r.expected_check_in : null,
        expected_check_out: r.is_working_day && r.expected_check_out ? r.expected_check_out : null,
      }));
      const { error } = await supabase
        .from("employee_expected_hours" as any)
        .upsert(payload, { onConflict: "employee_id,day_type" });
      if (error) throw error;
      toast.success("Expected hours saved");
      qc.invalidateQueries({ queryKey: ["employee-expected-hours", employeeId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" /> Expected Working Hours
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Used to detect late check-in/out (alerts trigger after 20 min deviation).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row, i) => (
          <div key={row.day_type} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end pb-3 border-b last:border-0">
            <div>
              <Label className="text-xs text-muted-foreground">{LABELS[row.day_type]}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={row.is_working_day}
                onCheckedChange={(v) => update(i, "is_working_day", v)}
              />
              <span className="text-xs">Working</span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Check-in</Label>
              <Input
                type="time"
                disabled={!row.is_working_day}
                value={row.expected_check_in}
                onChange={(e) => update(i, "expected_check_in", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Check-out</Label>
              <Input
                type="time"
                disabled={!row.is_working_day}
                value={row.expected_check_out}
                onChange={(e) => update(i, "expected_check_out", e.target.value)}
              />
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
