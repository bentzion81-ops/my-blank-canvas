import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";

export function ClientApprovedReplacements({ clientId }: { clientId: string }) {
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["client-approved-replacements", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_reports")
        .select("*")
        .eq("status", "approved")
        .eq("assigned_client_id", clientId)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const summary = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; payment: number; count: number }>();
    for (const r of reports as any[]) {
      const key = r.worker_id || r.passport_number || r.worker_name;
      const cur = map.get(key) || { name: r.worker_name, hours: 0, payment: 0, count: 0 };
      cur.hours += Number(r.total_hours) || 0;
      cur.payment += Number(r.total_payment) || 0;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [reports]);

  const totals = useMemo(() => ({
    hours: reports.reduce((s: number, r: any) => s + (Number(r.total_hours) || 0), 0),
    payment: reports.reduce((s: number, r: any) => s + (Number(r.total_payment) || 0), 0),
  }), [reports]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  if (reports.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No approved replacement reports for this client.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Hours per replacement worker</CardTitle>
            <div className="text-sm text-muted-foreground">
              Total: <strong className="text-foreground">{totals.hours.toFixed(2)}h</strong> ·
              <span className="ml-2">₪{totals.payment.toFixed(2)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead className="text-right">Reports</TableHead>
                  <TableHead className="text-right">Total hours</TableHead>
                  <TableHead className="text-right">Total payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₪{s.payment.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Approved reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reports as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{format(parseISO(r.work_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.worker_name}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.check_in?.slice(0, 5)} – {r.check_out?.slice(0, 5)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.total_hours).toFixed(2)}h</TableCell>
                    <TableCell className="text-right tabular-nums">₪{Number(r.total_payment).toFixed(2)}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{r.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
