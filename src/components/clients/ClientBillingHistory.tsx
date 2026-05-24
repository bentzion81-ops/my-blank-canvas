import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, Receipt } from "lucide-react";

const fmt = (n: number) => `₪${Math.round(Number(n) || 0).toLocaleString()}`;

export function ClientBillingHistory({ clientId }: { clientId: string }) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["client-billing-history", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_payments(amount, payment_date, payment_method, notes)")
        .eq("client_id", clientId)
        .order("month", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-sm">Billing History</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No invoices yet
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{format(new Date(inv.month), "MMM yyyy")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(inv.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-success">{fmt(inv.paid_amount)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${Number(inv.balance) > 0 ? "text-destructive" : "text-success"}`}>{fmt(inv.balance)}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell><StatusBadge status={inv.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
