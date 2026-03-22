import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  employeeId: string;
}

export const EmployeeAssignments = ({ employeeId }: Props) => {
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["employee-assignments", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("*, clients(name, hourly_rate, billing_type)")
        .eq("employee_id", employeeId)
        .is("end_date", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const assignedClientIds = assignments.map((a: any) => a.client_id);
  const availableClients = clients.filter((c: any) => !assignedClientIds.includes(c.id));

  const handleAdd = async () => {
    if (!selectedClient) return;
    setAdding(true);
    const { error } = await supabase.from("employee_client_assignments").insert({
      employee_id: employeeId,
      client_id: selectedClient,
      is_primary: assignments.length === 0,
    });
    if (error) {
      toast.error("Failed to assign client");
    } else {
      toast.success("Client assigned");
      setSelectedClient("");
      queryClient.invalidateQueries({ queryKey: ["employee-assignments", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
    }
    setAdding(false);
  };

  const handleRemove = async (assignmentId: string) => {
    const { error } = await supabase
      .from("employee_client_assignments")
      .delete()
      .eq("id", assignmentId);
    if (error) {
      toast.error("Failed to remove assignment");
    } else {
      toast.success("Assignment removed");
      queryClient.invalidateQueries({ queryKey: ["employee-assignments", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Assigned Clients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="flex-1 h-9">
              <SelectValue placeholder="Select a client..." />
            </SelectTrigger>
            <SelectContent>
              {availableClients.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedClient || adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No clients assigned yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.clients?.name || "Unknown"}</TableCell>
                  <TableCell>
                    {a.clients?.billing_type === "hourly" ? `₪${a.clients?.hourly_rate || 0}/hr` : "Fixed"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(a.id)}>
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
