import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

type DayType = "weekday" | "friday" | "saturday";
type Weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday";

interface DayConfig {
  day_type: DayType;
  is_working_day: boolean;
  expected_check_in: string;
  expected_check_out: string;
  active_days: Weekday[] | null; // only meaningful for "weekday"
}

const LABELS: Record<DayType, string> = {
  weekday: "Sun–Thu (ימי חול)",
  friday: "Friday (שישי)",
  saturday: "Saturday (שבת)",
};

const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: "sunday", label: "Sun (א)" },
  { value: "monday", label: "Mon (ב)" },
  { value: "tuesday", label: "Tue (ג)" },
  { value: "wednesday", label: "Wed (ד)" },
  { value: "thursday", label: "Thu (ה)" },
];
const ALL_WEEKDAYS: Weekday[] = WEEKDAY_OPTIONS.map((w) => w.value);

const DEFAULTS: DayConfig[] = [
  { day_type: "weekday", is_working_day: true, expected_check_in: "08:00", expected_check_out: "17:00", active_days: null },
  { day_type: "friday", is_working_day: false, expected_check_in: "08:00", expected_check_out: "13:00", active_days: null },
  { day_type: "saturday", is_working_day: false, expected_check_in: "", expected_check_out: "", active_days: null },
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
            active_days: (found.active_days as Weekday[] | null) ?? null,
          }
        : d;
    });
    setRows(merged);
  }, [data]);

  const update = (i: number, field: keyof DayConfig, value: any) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  };

  const toggleWeekday = (i: number, day: Weekday) => {
    setRows((r) =>
      r.map((row, idx) => {
        if (idx !== i) return row;
        const current = row.active_days ?? [...ALL_WEEKDAYS];
        const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
        // If user re-selects all 5, store null (= all days, the default)
        const normalized = ALL_WEEKDAYS.every((d) => next.includes(d)) ? null : next;
        return { ...row, active_days: normalized };
      }),
    );
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
        active_days: r.day_type === "weekday" && r.is_working_day ? r.active_days : null,
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
        {rows.map((row, i) => {
          const selected = row.active_days ?? ALL_WEEKDAYS;
          return (
            <div key={row.day_type} className="space-y-2 pb-3 border-b last:border-0">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
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

              {row.day_type === "weekday" && row.is_working_day && (
                <div className="pl-1 pt-1">
                  <Label className="text-xs text-muted-foreground">
                    Apply to specific days (default: all)
                  </Label>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    {WEEKDAY_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                      >
                        <Checkbox
                          checked={selected.includes(opt.value)}
                          onCheckedChange={() => toggleWeekday(i, opt.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
