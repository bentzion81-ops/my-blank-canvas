import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Download } from "lucide-react";

const reportTypes = [
  { title: "Employee Report", description: "Hours, costs, deductions, net payment per employee" },
  { title: "Client Profitability", description: "Revenue, employee cost, and profit per client" },
  { title: "Attendance Report", description: "Planned vs actual hours and completion rates" },
  { title: "Billing Report", description: "Invoice amounts, payments, and balances" },
  { title: "Payroll Report", description: "Gross, net, and payment status per employee" },
  { title: "Expiring Documents", description: "Passports and visas expiring soon" },
];

const Reports = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Reports" subtitle="Generate and export reports" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTypes.map((report) => (
            <Card key={report.title} className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{report.title}</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{report.description}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <Download className="h-3 w-3 mr-1" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <Download className="h-3 w-3 mr-1" /> Excel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
