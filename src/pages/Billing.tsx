import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Receipt, DollarSign, AlertTriangle, CheckCircle, Plus } from "lucide-react";

const invoicesData = [
  { client: "ABC Corp", number: "INV-001", month: "2026-03", amount: 12000, paid: 12000, balance: 0, due: "2026-03-30", status: "paid" },
  { client: "XYZ Ltd", number: "INV-002", month: "2026-03", amount: 15000, paid: 8000, balance: 7000, due: "2026-03-30", status: "partial" },
  { client: "Delta Inc", number: "INV-003", month: "2026-02", amount: 9000, paid: 0, balance: 9000, due: "2026-02-28", status: "overdue" },
  { client: "Omega LLC", number: "INV-004", month: "2026-03", amount: 14000, paid: 0, balance: 14000, due: "2026-04-15", status: "sent" },
];

const Billing = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Billing & Collections" subtitle="Invoice management" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Total Billing" value="₪50K" icon={Receipt} variant="info" />
          <KpiCard title="Total Paid" value="₪20K" icon={CheckCircle} variant="success" />
          <KpiCard title="Outstanding" value="₪30K" icon={DollarSign} variant="warning" />
          <KpiCard title="Overdue" value="1" icon={AlertTriangle} variant="destructive" />
        </div>

        <div className="flex justify-end">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Invoice</Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Invoice #</TableHead>
                  <TableHead className="hidden md:table-cell">Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesData.map((inv) => (
                  <TableRow key={inv.number} className="cursor-pointer">
                    <TableCell className="font-medium">{inv.client}</TableCell>
                    <TableCell className="hidden md:table-cell">{inv.number}</TableCell>
                    <TableCell className="hidden md:table-cell">{inv.month}</TableCell>
                    <TableCell>₪{inv.amount.toLocaleString()}</TableCell>
                    <TableCell className="hidden md:table-cell">₪{inv.paid.toLocaleString()}</TableCell>
                    <TableCell>₪{inv.balance.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell">{inv.due}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Billing;
