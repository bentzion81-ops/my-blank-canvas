import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Wallet, DollarSign, TrendingDown } from "lucide-react";

const payrollData = [
  { employee: "Ahmed Hassan", client: "ABC Corp", hours: 165, wage: 35, gross: 5775, deductions: 800, net: 4975, cost: 6575, status: "ready" },
  { employee: "Maria Santos", client: "XYZ Ltd", hours: 190, wage: 32, gross: 6080, deductions: 950, net: 5130, cost: 6880, status: "draft" },
  { employee: "John Smith", client: "Delta Inc", hours: 105, wage: 30, gross: 3150, deductions: 600, net: 2550, cost: 3750, status: "draft" },
  { employee: "Li Wei", client: "Omega LLC", hours: 175, wage: 38, gross: 6650, deductions: 1100, net: 5550, cost: 7450, status: "paid" },
];

const Payroll = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Payroll" subtitle="March 2026" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Total Hours" value="635" icon={Clock} variant="info" />
          <KpiCard title="Gross Payroll" value="₪21.6K" icon={Wallet} variant="default" />
          <KpiCard title="Total Deductions" value="₪3.5K" icon={TrendingDown} variant="warning" />
          <KpiCard title="Employer Cost" value="₪24.7K" icon={DollarSign} variant="destructive" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Hours</TableHead>
                  <TableHead className="hidden lg:table-cell">Wage</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead className="hidden md:table-cell">Deductions</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead className="hidden lg:table-cell">Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollData.map((p) => (
                  <TableRow key={p.employee} className="cursor-pointer">
                    <TableCell className="font-medium">{p.employee}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.client}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.hours}h</TableCell>
                    <TableCell className="hidden lg:table-cell">₪{p.wage}</TableCell>
                    <TableCell>₪{p.gross.toLocaleString()}</TableCell>
                    <TableCell className="hidden md:table-cell">₪{p.deductions.toLocaleString()}</TableCell>
                    <TableCell>₪{p.net.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell">₪{p.cost.toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
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

export default Payroll;
