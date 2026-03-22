import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

const defaultForm = {
  first_name: "",
  last_name: "",
  israeli_phone: "",
  foreign_phone: "",
  citizenship: "",
  passport_number: "",
  employee_type: "permanent" as "permanent" | "temporary",
  status: "active" as "active" | "inactive",
  target_monthly_hours: 0,
  hourly_wage: 0,
  transportation: 0,
  medical_insurance: 0,
  food: 0,
  other_expenses: 0,
  rent_deduction: 0,
  loan_deduction: 0,
  equipment_deduction: 0,
  other_deductions: 0,
  notes: "",
  passport_expiration: "",
  visa_expiration: "",
};

const EmployeeForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        first_name: existing.first_name || "",
        last_name: existing.last_name || "",
        israeli_phone: existing.israeli_phone || "",
        foreign_phone: existing.foreign_phone || "",
        citizenship: existing.citizenship || "",
        passport_number: existing.passport_number || "",
        employee_type: existing.employee_type || "permanent",
        status: existing.status || "active",
        target_monthly_hours: existing.target_monthly_hours || 0,
        hourly_wage: existing.hourly_wage || 0,
        transportation: existing.transportation || 0,
        medical_insurance: existing.medical_insurance || 0,
        food: existing.food || 0,
        other_expenses: existing.other_expenses || 0,
        rent_deduction: existing.rent_deduction || 0,
        loan_deduction: existing.loan_deduction || 0,
        equipment_deduction: existing.equipment_deduction || 0,
        other_deductions: existing.other_deductions || 0,
        notes: existing.notes || "",
        passport_expiration: existing.passport_expiration || "",
        visa_expiration: existing.visa_expiration || "",
      });
    }
  }, [existing]);

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const numericPayload = () => ({
    ...form,
    target_monthly_hours: Number(form.target_monthly_hours) || 0,
    hourly_wage: Number(form.hourly_wage) || 0,
    transportation: Number(form.transportation) || 0,
    medical_insurance: Number(form.medical_insurance) || 0,
    food: Number(form.food) || 0,
    other_expenses: Number(form.other_expenses) || 0,
    rent_deduction: Number(form.rent_deduction) || 0,
    loan_deduction: Number(form.loan_deduction) || 0,
    equipment_deduction: Number(form.equipment_deduction) || 0,
    other_deductions: Number(form.other_deductions) || 0,
    passport_expiration: form.passport_expiration || null,
    visa_expiration: form.visa_expiration || null,
  });

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) {
      toast.error("First and last name are required");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("employees").update(numericPayload()).eq("id", id!);
        if (error) throw error;
        toast.success("Employee updated");
      } else {
        const { error } = await supabase.from("employees").insert(numericPayload());
        if (error) throw error;
        toast.success("Employee created");
      }
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      navigate(isEdit ? `/employees/${id}` : "/employees");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AppHeader title={isEdit ? "Edit Employee" : "Add Employee"} />
      <div className="flex-1 space-y-4 p-4 lg:p-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/employees/${id}` : "/employees")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Personal Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Israeli Phone</Label>
              <Input value={form.israeli_phone} onChange={(e) => update("israeli_phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Foreign Phone</Label>
              <Input value={form.foreign_phone} onChange={(e) => update("foreign_phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Citizenship</Label>
              <Input value={form.citizenship} onChange={(e) => update("citizenship", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Passport Number</Label>
              <Input value={form.passport_number} onChange={(e) => update("passport_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Passport Expiration</Label>
              <Input type="date" value={form.passport_expiration} onChange={(e) => update("passport_expiration", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Visa Expiration</Label>
              <Input type="date" value={form.visa_expiration} onChange={(e) => update("visa_expiration", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Employment</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.employee_type} onValueChange={(v) => update("employee_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="temporary">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Monthly Hours</Label>
              <Input type="number" value={form.target_monthly_hours} onChange={(e) => update("target_monthly_hours", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hourly Wage (₪)</Label>
              <Input type="number" value={form.hourly_wage} onChange={(e) => update("hourly_wage", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Employer Expenses</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Transportation (₪)</Label>
              <Input type="number" value={form.transportation} onChange={(e) => update("transportation", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Medical Insurance (₪)</Label>
              <Input type="number" value={form.medical_insurance} onChange={(e) => update("medical_insurance", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Food (₪)</Label>
              <Input type="number" value={form.food} onChange={(e) => update("food", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Other Expenses (₪)</Label>
              <Input type="number" value={form.other_expenses} onChange={(e) => update("other_expenses", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Deductions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Rent (₪)</Label>
              <Input type="number" value={form.rent_deduction} onChange={(e) => update("rent_deduction", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Loan (₪)</Label>
              <Input type="number" value={form.loan_deduction} onChange={(e) => update("loan_deduction", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Equipment (₪)</Label>
              <Input type="number" value={form.equipment_deduction} onChange={(e) => update("equipment_deduction", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Other Deductions (₪)</Label>
              <Input type="number" value={form.other_deductions} onChange={(e) => update("other_deductions", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} />
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end pb-8">
          <Button variant="outline" onClick={() => navigate(isEdit ? `/employees/${id}` : "/employees")}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? "Update Employee" : "Save Employee"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeForm;
