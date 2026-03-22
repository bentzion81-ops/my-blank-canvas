import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Users, Target, CheckCircle } from "lucide-react";
import { useState } from "react";
import { format, startOfMonth, subMonths, endOfMonth, eachDayOfInterval, getDay } from "date-fns";

interface Props {
  client: any;
  clientId: string;
}

function getWorkingDaysInMonth(month: string, includeFriday: boolean, includeSaturday: boolean) {
  const start = startOfMonth(new Date(month));
  const end = endOfMonth(start);
  const days = eachDayOfInterval({ start, end });

  let sunThu = 0;
  let fridays = 0;
  let saturdays = 0;

  for (const day of days) {
    const dow = getDay(day); // 0=Sun, 5=Fri, 6=Sat
    if (dow === 6) saturdays++;
    else if (dow === 5) fridays++;
    else sunThu++;
  }

  return { sunThu, fridays: includeFriday ? fridays : 0, saturdays: includeSaturday ? saturdays : 0 };
}

export const ClientWorkPlanningCard = ({ client, clientId }: Props) => {
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const dailyHours = client.daily_planned_hours || 0;
  const fridayHours = (client as any).friday_hours || 0;
  const saturdayHours = (client as any).saturday_hours || 0;

  const { sunThu, fridays, saturdays } = getWorkingDaysInMonth(
    selectedMonth,
    client.include_friday,
    client.include_saturday
  );

  const targetMonthlyHours = (sunThu * dailyHours) + (fridays * fridayHours) + (saturdays * saturdayHours);

  // Get actual employee hours for this client in the selected month
  const { data: metrics = [] } = useQuery({
    queryKey: ["client-employee-metrics-planning", clientId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_monthly_metrics")
        .select("actual_hours")
        .eq("client_id", clientId)
        .eq("month", selectedMonth);
      if (error) throw error;
      return data;
    },
  });

  const totalActualHours = metrics.reduce((sum: number, m: any) => sum + (m.actual_hours || 0), 0);
  const completionPct = targetMonthlyHours > 0 ? Math.round((totalActualHours / targetMonthlyHours) * 100) : 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Work Planning</CardTitle>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Sun–Thu</span>
            <span>{dailyHours}h/day × {sunThu} days = {sunThu * dailyHours}h</span>
          </div>
          {client.include_friday && (
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Friday</span>
              <span>{fridayHours}h/day × {fridays} days = {fridays * fridayHours}h</span>
            </div>
          )}
          {client.include_saturday && (
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Saturday</span>
              <span>{saturdayHours}h/day × {saturdays} days = {saturdays * saturdayHours}h</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="Target Hours" value={`${targetMonthlyHours}h`} icon={Target} />
          <KpiCard title="Actual Hours" value={`${totalActualHours}h`} icon={Clock} />
          <KpiCard title="Completion" value={`${completionPct}%`} icon={CheckCircle} />
          <KpiCard title="Remaining" value={`${Math.max(0, targetMonthlyHours - totalActualHours)}h`} icon={Users} />
        </div>
      </CardContent>
    </Card>
  );
};
