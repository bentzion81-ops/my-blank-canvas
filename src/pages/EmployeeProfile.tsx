import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Loader2 } from "lucide-react";
import { EmployeeAssignments } from "@/components/employees/EmployeeAssignments";
import { EmployeeMonthlyHours } from "@/components/employees/EmployeeMonthlyHours";

const EmployeeProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_client_assignments(*, clients(name))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted-foreground">Employee not found</p>
        <Button variant="link" onClick={() => navigate("/employees")}>Go back</Button>
      </div>
    );
  }

  const totalExpenses = (employee.transportation || 0) + (employee.medical_insurance || 0) + (employee.food || 0) + (employee.other_expenses || 0);
  const totalDeductions = (employee.rent_deduction || 0) + (employee.loan_deduction || 0) + (employee.equipment_deduction || 0) + (employee.other_deductions || 0);
  const primaryClient = employee.employee_client_assignments?.find((a: any) => a.clients)?.clients?.name;

  return (
    <div className="flex flex-col">
      <AppHeader
        title={`${employee.first_name} ${employee.last_name}`}
        subtitle={primaryClient || "Unassigned"}
      />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/employees")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <StatusBadge status={employee.status} />
            <Button size="sm" variant="outline" onClick={() => navigate(`/employees/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Assignments & Hours</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Personal Info</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Israeli Phone</span><span>{employee.israeli_phone || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Foreign Phone</span><span>{employee.foreign_phone || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Citizenship</span><span>{employee.citizenship || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Passport</span><span>{employee.passport_number || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Passport Exp.</span><span>{employee.passport_expiration || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Visa Exp.</span><span>{employee.visa_expiration || "—"}</span></div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Employment</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{employee.employee_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Client</span><span>{primaryClient || "Unassigned"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Target Hours</span><span>{employee.target_monthly_hours || 0}h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Hourly Wage</span><span>₪{employee.hourly_wage}</span></div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Employer Expenses</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Transportation</span><span>₪{employee.transportation || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Medical</span><span>₪{employee.medical_insurance || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Food</span><span>₪{employee.food || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Other</span><span>₪{employee.other_expenses || 0}</span></div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Total</span><span>₪{totalExpenses}</span></div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Deductions</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Rent</span><span>₪{employee.rent_deduction || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Loan</span><span>₪{employee.loan_deduction || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Equipment</span><span>₪{employee.equipment_deduction || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Other</span><span>₪{employee.other_deductions || 0}</span></div>
                  <div className="flex justify-between font-medium border-t pt-2"><span>Total</span><span>₪{totalDeductions}</span></div>
                </CardContent>
              </Card>
            </div>
            {employee.notes && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">{employee.notes}</p></CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4">
            <EmployeeAssignments employeeId={id!} />
            <EmployeeMonthlyHours employeeId={id!} />
          </TabsContent>

          <TabsContent value="payroll">
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                Payroll data will appear here once a payroll run is created.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expenses">
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                Expense & deduction history will appear here.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                Documents will appear here once uploaded.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EmployeeProfile;
