import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Printer,
  FileDown,
  Loader2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  employeeId: string;
}

const HEB_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

type Row = {
  date: Date;
  dateStr: string;
  isWeekend: boolean;
  checkIn?: string;
  checkOut?: string;
  hours: number; // total hours for the day
  paidHours: number;
  break: number;
  note?: string;
  event?: string;
};

function fmtHM(totalMinutes: number) {
  if (!totalMinutes || totalMinutes < 0) return "00:00";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const EmployeeAttendanceReport = ({ employeeId }: Props) => {
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const fromStr = format(monthStart, "yyyy-MM-dd");
  const toStr = format(monthEnd, "yyyy-MM-dd");

  const { data: employee } = useQuery({
    queryKey: ["employee-basic", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("first_name, last_name, meckano_employee_id, employee_client_assignments(clients(name))")
        .eq("id", employeeId)
        .maybeSingle();
      return data;
    },
  });

  const { data: records, isFetching } = useQuery({
    queryKey: ["employee-attendance-month", employeeId, fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("date, check_in, check_out, hours_worked, notes")
        .eq("employee_id", employeeId)
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: true });
      return data || [];
    },
  });

  const rows = useMemo<Row[]>(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const byDate = new Map<string, any[]>();
    (records || []).forEach((r: any) => {
      const arr = byDate.get(r.date) || [];
      arr.push(r);
      byDate.set(r.date, arr);
    });

    return days.map((d) => {
      const ds = format(d, "yyyy-MM-dd");
      const dayRecs = byDate.get(ds) || [];
      const dow = d.getDay();
      const isWeekend = dow === 5 || dow === 6;

      // Earliest check_in / latest check_out for the day
      let checkIn: string | undefined;
      let checkOut: string | undefined;
      let hours = 0;
      let note: string | undefined;
      for (const r of dayRecs) {
        if (r.check_in) {
          const t = format(new Date(r.check_in), "HH:mm");
          if (!checkIn || t < checkIn) checkIn = t;
        }
        if (r.check_out) {
          const t = format(new Date(r.check_out), "HH:mm");
          if (!checkOut || t > checkOut) checkOut = t;
        }
        hours += Number(r.hours_worked || 0);
        if (r.notes && !note) note = r.notes;
      }

      // If hours not set, compute from in/out
      if (!hours && checkIn && checkOut) {
        const [h1, m1] = checkIn.split(":").map(Number);
        const [h2, m2] = checkOut.split(":").map(Number);
        const mins = h2 * 60 + m2 - (h1 * 60 + m1);
        hours = mins > 0 ? mins / 60 : 0;
      }

      return {
        date: d,
        dateStr: ds,
        isWeekend,
        checkIn,
        checkOut,
        hours,
        paidHours: hours,
        break: 0,
        note,
      };
    });
  }, [records, monthStart, monthEnd]);

  const totals = useMemo(() => {
    const totalMins = rows.reduce((s, r) => s + r.hours * 60, 0);
    const paidMins = rows.reduce((s, r) => s + r.paidHours * 60, 0);
    const presentDays = rows.filter((r) => r.hours > 0).length;
    return {
      totalHM: fmtHM(totalMins),
      paidHM: fmtHM(paidMins),
      decimal: (totalMins / 60).toFixed(2),
      presentDays,
    };
  }, [rows]);

  const employeeName =
    employee?.first_name || employee?.last_name
      ? `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim()
      : "—";
  const clientName = (employee as any)?.employee_client_assignments?.[0]?.clients?.name ?? "—";

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* Toolbar (hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(subMonths(month, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-[180px] justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(month, "MMMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={month}
                month={month}
                onMonthChange={setMonth}
                onSelect={(d) => d && setMonth(startOfMonth(d))}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Printable report */}
      <Card className="border-0 shadow-sm print:shadow-none print:border-0" id="attendance-report-print">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Attendance Report</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {format(monthStart, "dd/MM/yyyy")} – {format(monthEnd, "dd/MM/yyyy")}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{employeeName}</p>
              <p className="text-xs text-muted-foreground">{clientName}</p>
              {employee?.meckano_employee_id && (
                <p className="text-xs text-muted-foreground">תג עובד: {employee.meckano_employee_id}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[80px]">תאריך</TableHead>
                <TableHead className="w-[70px]">סוג</TableHead>
                <TableHead className="w-[70px]">כניסה</TableHead>
                <TableHead className="w-[70px]">יציאה</TableHead>
                <TableHead className="w-[70px]">סה"כ שעות</TableHead>
                <TableHead className="w-[70px]">הפסקה</TableHead>
                <TableHead className="w-[80px]">שעות משולמות</TableHead>
                <TableHead className="w-[60px]">תקן</TableHead>
                <TableHead className="w-[60px]">חוסר</TableHead>
                <TableHead className="w-[60px]">100%</TableHead>
                <TableHead className="w-[70px]">שעות עודף</TableHead>
                <TableHead className="w-[60px]">איחור</TableHead>
                <TableHead>אירוע</TableHead>
                <TableHead>הערה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const dow = r.date.getDay();
                const dayLabel = `${HEB_DAYS[dow]} - ${format(r.date, "dd")}`;
                const typeLabel = r.isWeekend ? 'סופ"ש' : "יום חול";
                return (
                  <TableRow
                    key={r.dateStr}
                    className={cn(r.isWeekend && "bg-muted/30 font-medium")}
                  >
                    <TableCell className="text-xs">{dayLabel}</TableCell>
                    <TableCell className="text-xs">{typeLabel}</TableCell>
                    <TableCell className="text-xs">{r.checkIn || ""}</TableCell>
                    <TableCell className="text-xs">{r.checkOut || ""}</TableCell>
                    <TableCell className="text-xs">{r.hours ? fmtHM(r.hours * 60) : ""}</TableCell>
                    <TableCell className="text-xs">{r.break ? fmtHM(r.break * 60) : ""}</TableCell>
                    <TableCell className="text-xs">{r.paidHours ? fmtHM(r.paidHours * 60) : ""}</TableCell>
                    <TableCell className="text-xs"></TableCell>
                    <TableCell className="text-xs"></TableCell>
                    <TableCell className="text-xs">{r.hours ? fmtHM(r.hours * 60) : ""}</TableCell>
                    <TableCell className="text-xs"></TableCell>
                    <TableCell className="text-xs"></TableCell>
                    <TableCell className="text-xs">{r.event || ""}</TableCell>
                    <TableCell className="text-xs">{r.note || ""}</TableCell>
                  </TableRow>
                );
              })}

              {/* Totals */}
              <TableRow className="bg-primary/5 font-semibold">
                <TableCell colSpan={2} className="text-xs">חישוב יומי: שעות ודקות</TableCell>
                <TableCell colSpan={2}></TableCell>
                <TableCell className="text-xs">{totals.totalHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">{totals.paidHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">{totals.totalHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
              <TableRow className="bg-primary/5 font-semibold">
                <TableCell colSpan={2} className="text-xs">סיכום חודשי: שעות ודקות</TableCell>
                <TableCell colSpan={2}></TableCell>
                <TableCell className="text-xs">{totals.totalHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">{totals.paidHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">{totals.totalHM}</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell className="text-xs">00:00</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
              <TableRow className="bg-primary/10 font-semibold">
                <TableCell colSpan={2} className="text-xs">סיכום חודשי: עשרוני</TableCell>
                <TableCell colSpan={2}></TableCell>
                <TableCell className="text-xs">{totals.decimal}</TableCell>
                <TableCell className="text-xs">0</TableCell>
                <TableCell className="text-xs">{totals.decimal}</TableCell>
                <TableCell className="text-xs">0</TableCell>
                <TableCell className="text-xs">0</TableCell>
                <TableCell className="text-xs">{totals.decimal}</TableCell>
                <TableCell className="text-xs">0</TableCell>
                <TableCell className="text-xs">0</TableCell>
                <TableCell colSpan={2}></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Summary boxes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border-t">
            <div className="border rounded-md">
              <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold border-b">סיכום</div>
              <div className="p-3 text-xs space-y-1">
                <div className="flex justify-between"><span>ימי נוכחות</span><span>{totals.presentDays}</span></div>
                <div className="flex justify-between"><span>ימי תקן</span><span>0</span></div>
                <div className="flex justify-between"><span>שעות נוכחות</span><span>{totals.decimal}</span></div>
                <div className="flex justify-between"><span>שעות תקן</span><span>0</span></div>
                <div className="flex justify-between"><span>שעות משולמות</span><span>{totals.decimal}</span></div>
                <div className="flex justify-between"><span>שעות חוסר</span><span>0</span></div>
                <div className="flex justify-between"><span>איחור</span><span>0</span></div>
              </div>
            </div>
            <div className="border rounded-md">
              <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold border-b">שעות לחישוב</div>
              <div className="p-3 text-xs">
                <div className="flex justify-between"><span>{totals.decimal}</span><span>100%</span></div>
              </div>
            </div>
            <div className="border rounded-md">
              <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold border-b">אישור דוח</div>
              <div className="p-3 text-xs space-y-2">
                <div className="flex justify-between"><span>תאריך</span><span className="text-muted-foreground">__________</span></div>
                <div className="flex justify-between"><span>חתימה</span><span className="text-muted-foreground">__________</span></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #attendance-report-print, #attendance-report-print * { visibility: visible; }
          #attendance-report-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};
