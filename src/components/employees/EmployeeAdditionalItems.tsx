import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth } from "date-fns";

interface Props { employeeId: string; }

export const EmployeeAdditionalItems = ({ employeeId }: Props) => {
  const qc = useQueryClient();
  const [type, setType] = useState<"expense" | "deduction">("expense");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState<string>(""); // empty = recurring
  const [saving, setSaving] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["employee-additional-items", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_additional_items" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleAdd = async () => {
    if (!name || !amount) return toast.error("Name and amount required");
    setSaving(true);
    const { error } = await supabase.from("employee_additional_items" as any).insert({
      employee_id: employeeId,
      type, name, amount: Number(amount),
      month: month || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Added");
      setName(""); setAmount(""); setMonth("");
      qc.invalidateQueries({ queryKey: ["employee-additional-items", employeeId] });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("employee_additional_items" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["employee-additional-items", employeeId] });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Additional Payments & Deductions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <Select value={type} onValueChange={(v: any) => setType(v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Pay to employee (+)</SelectItem>
              <SelectItem value="deduction">Deduct from employee (-)</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-9" placeholder="Name (e.g. travel, rent)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="h-9" type="number" placeholder="Amount ₪" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input className="h-9" type="month" placeholder="Month (empty = recurring)" value={month ? month.slice(0, 7) : ""} onChange={(e) => setMonth(e.target.value ? `${e.target.value}-01` : "")} />
          <Button className="h-9" onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Add</>}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No additional items</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Badge variant={it.type === "expense" ? "default" : "destructive"} className="text-[10px]">
                      {it.type === "expense" ? "+ Pay" : "- Deduct"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {it.month ? format(new Date(it.month), "MMM yyyy") : "Recurring (every month)"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">₪{Number(it.amount).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(it.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
