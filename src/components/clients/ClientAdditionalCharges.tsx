import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string;
  selectedMonth: string;
}

const defaultCharge = { name: "", quantity: 1, unit_cost: 0, unit_charge: 0, notes: "" };

export function ClientAdditionalCharges({ clientId, selectedMonth }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultCharge);

  const { data: charges = [], isLoading } = useQuery({
    queryKey: ["client-additional-charges", clientId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_additional_charges" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("month", selectedMonth)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_additional_charges" as any)
        .insert({
          client_id: clientId,
          month: selectedMonth,
          name: form.name,
          quantity: Number(form.quantity) || 1,
          unit_cost: Number(form.unit_cost) || 0,
          unit_charge: Number(form.unit_charge) || 0,
          notes: form.notes || null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-additional-charges", clientId, selectedMonth] });
      setForm(defaultCharge);
      setOpen(false);
      toast.success("החיוב נוסף בהצלחה");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      const { error } = await supabase
        .from("client_additional_charges" as any)
        .delete()
        .eq("id", chargeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-additional-charges", clientId, selectedMonth] });
      toast.success("החיוב נמחק");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const totals = charges.reduce(
    (acc, c) => ({
      cost: acc.cost + (c.total_cost || 0),
      charge: acc.charge + (c.total_charge || 0),
      profit: acc.profit + (c.profit || 0),
    }),
    { cost: 0, charge: 0, profit: 0 }
  );

  const update = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">חיובים נוספים</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> הוסף חיוב
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>חיוב נוסף חדש</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label>שם החיוב *</Label>
                <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="לדוגמה: ציוד ניקיון" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>כמות</Label>
                  <Input type="number" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>עלות ליחידה (₪)</Label>
                  <Input type="number" value={form.unit_cost} onChange={(e) => update("unit_cost", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>חיוב ליחידה (₪)</Label>
                  <Input type="number" value={form.unit_charge} onChange={(e) => update("unit_charge", e.target.value)} />
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                רווח צפוי: ₪{((Number(form.quantity) || 0) * ((Number(form.unit_charge) || 0) - (Number(form.unit_cost) || 0))).toLocaleString()}
              </div>
              <Button onClick={() => addMutation.mutate()} disabled={!form.name || addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                שמור
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : charges.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            אין חיובים נוספים לחודש זה
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>כמות</TableHead>
                <TableHead>עלות</TableHead>
                <TableHead>חיוב</TableHead>
                <TableHead>רווח</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.quantity}</TableCell>
                  <TableCell>₪{(c.total_cost || 0).toLocaleString()}</TableCell>
                  <TableCell>₪{(c.total_charge || 0).toLocaleString()}</TableCell>
                  <TableCell className={c.profit >= 0 ? "text-success" : "text-destructive"}>
                    ₪{(c.profit || 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => deleteMutation.mutate(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {charges.length > 0 && (
                <TableRow className="font-medium bg-muted/50">
                  <TableCell>סה״כ</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>₪{totals.cost.toLocaleString()}</TableCell>
                  <TableCell>₪{totals.charge.toLocaleString()}</TableCell>
                  <TableCell className={totals.profit >= 0 ? "text-success" : "text-destructive"}>
                    ₪{totals.profit.toLocaleString()}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
