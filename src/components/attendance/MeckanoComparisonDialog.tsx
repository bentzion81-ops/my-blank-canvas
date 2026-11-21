import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { Download, FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildAttendanceComparison, comparisonCsv, comparisonStatusLabels, israelDayRange, type ComparisonStatus } from "@/lib/attendance-comparison";

async function allPages<T>(query: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

const statusClasses: Record<ComparisonStatus, string> = {
  reported: "text-success border-success/30 bg-success/10",
  not_reported: "text-destructive border-destructive/30 bg-destructive/10",
  not_linked: "text-warning border-warning/30 bg-warning/10",
};

export function MeckanoComparisonDialog({ selectedDate }: { selectedDate: Date }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(format(subMonths(selectedDate, 1), "yyyy-MM"));
  const [checkDate, setCheckDate] = useState(format(selectedDate, "yyyy-MM-dd"));
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const valid = /^\d{4}-\d{2}$/.test(month) && /^\d{4}-\d{2}-\d{2}$/.test(checkDate);

  const { data: rows, isFetching, error, refetch } = useQuery({
    queryKey: ["meckano-reference-month-comparison", month, checkDate],
    enabled: open && valid,
    queryFn: async () => {
      const from = `${month}-01`;
      const nextMonth = format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1), "yyyy-MM-dd");
      const day = israelDayRange(checkDate);
      const [employees, clients, attendance, replacements, dailyRecords, rawEvents] = await Promise.all([
        allPages((a, b) => supabase.from("employees")
          .select("id, first_name, last_name, passport_number, meckano_employee_id").order("created_at").order("id").range(a, b)),
        allPages((a, b) => supabase.from("clients").select("id, name").order("id").range(a, b)),
        allPages((a, b) => supabase.from("attendance_records").select("employee_id, client_id, hours_worked")
          .gte("date", from).lt("date", nextMonth).gt("hours_worked", 0).order("id").range(a, b)),
        allPages((a, b) => supabase.from("replacement_reports")
          .select("worker_id, worker_name, passport_number, assigned_client_id, assigned_custom_workplace, workplace_description, total_hours")
          .gte("work_date", from).lt("work_date", nextMonth).eq("status", "approved").gt("total_hours", 0).order("id").range(a, b)),
        allPages((a, b) => supabase.from("attendance_records").select("employee_id, client_id, check_in, check_out")
          .eq("date", checkDate).eq("source", "meckano").order("id").range(a, b)),
        allPages((a, b) => supabase.from("meckano_attendance_raw").select("employee_id, meckano_employee_id")
          .gte("event_timestamp", day.from).lt("event_timestamp", day.to).order("id").range(a, b)),
      ]);
      return buildAttendanceComparison({ employees, clients, attendance, replacements, dailyRecords, rawEvents });
    },
  });

  const clients = useMemo(() => {
    const list = new Map((rows ?? []).map((row) => [row.clientKey, row.clientName]));
    return [...list].sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [rows]);
  const filtered = (rows ?? []).filter((row) =>
    (clientFilter === "all" || row.clientKey === clientFilter) &&
    (statusFilter === "all" || row.status === statusFilter));
  const counts = new Map<ComparisonStatus, Set<string>>();
  for (const row of rows ?? []) {
    const ids = counts.get(row.status) ?? new Set<string>();
    ids.add(row.employeeId);
    counts.set(row.status, ids);
  }

  const exportCsv = async () => {
    try {
      const name = `meckano-check-${month}-${checkDate}.csv`;
      const blob = new Blob([comparisonCsv(filtered, month, checkDate)], { type: "text/csv;charset=utf-8" });
      const file = new File([blob], name, { type: blob.type });
      if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") return;
      toast.error("לא ניתן לייצא את הבדיקה. נסו שוב.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (value) {
        setCheckDate(format(selectedDate, "yyyy-MM-dd"));
        setMonth(format(subMonths(selectedDate, 1), "yyyy-MM"));
        setClientFilter("all");
        setStatusFilter("all");
      }
      setOpen(value);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><FileCheck2 className="h-4 w-4 mr-2" />Meckano check by client</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Meckano check by client</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1"><Label htmlFor="comparison-month">Reference month</Label>
            <Input id="comparison-month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setClientFilter("all"); }} /></div>
          <div className="space-y-1"><Label htmlFor="comparison-date">Check date</Label>
            <Input id="comparison-date" type="date" value={checkDate} onChange={(event) => setCheckDate(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="comparison-client">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}><SelectTrigger id="comparison-client" className="min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All clients</SelectItem>{clients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1"><Label htmlFor="comparison-status">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger id="comparison-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(comparisonStatusLabels).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {!isFetching && !error && valid && Object.entries(comparisonStatusLabels).map(([status, label]) =>
              <Badge variant="outline" className={statusClasses[status as ComparisonStatus]} key={status}>
                {label}: {counts.get(status as ComparisonStatus)?.size ?? 0}
              </Badge>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!valid || isFetching} onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            <Button size="sm" disabled={!valid || isFetching || Boolean(error) || filtered.length === 0} onClick={() => void exportCsv()}>
              <Download className="h-4 w-4 mr-2" />Export CSV</Button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto flex-1 border rounded-md">
          {isFetching ? <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
            : error ? <div role="alert" className="p-6 text-destructive">לא ניתן לטעון את הבדיקה. נסו לרענן.</div>
            : !valid ? <div className="p-6 text-muted-foreground">Select a reference month and check date.</div>
            : filtered.length === 0 ? <div className="p-6 text-muted-foreground">No results</div>
            : <Table className="min-w-[650px]">
              <TableHeader><TableRow><TableHead>Client · reference month</TableHead><TableHead>Employee</TableHead><TableHead>Report status</TableHead><TableHead>Reported at · check date</TableHead></TableRow></TableHeader>
              <TableBody>{filtered.map((row) => <TableRow key={JSON.stringify([row.employeeId, row.clientKey])}>
                <TableCell className="max-w-[220px] whitespace-normal break-words">{row.clientName}</TableCell>
                <TableCell className="max-w-[240px] whitespace-normal break-words">{row.employeeName}</TableCell>
                <TableCell><Badge variant="outline" className={`whitespace-nowrap ${statusClasses[row.status]}`}>{comparisonStatusLabels[row.status]}</Badge></TableCell>
                <TableCell className="max-w-[220px] whitespace-normal break-words">{row.reportedClients || "—"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>}
        </div>
      </DialogContent>
    </Dialog>
  );
}