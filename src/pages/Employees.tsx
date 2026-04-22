import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users } from "lucide-react";
import { DuplicateEmployeesPanel } from "@/components/employees/DuplicateEmployeesPanel";
import { MissingExpectedHoursPanel } from "@/components/employees/MissingExpectedHoursPanel";

const Employees = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_client_assignments(is_primary, end_date, client_id, clients(name))")
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const getClientName = (e: any): string => {
    const assignments = e.employee_client_assignments ?? [];
    const active = assignments.filter((a: any) => a.clients && !a.end_date);
    const primary = active.find((a: any) => a.is_primary) ?? active[0] ?? assignments.find((a: any) => a.clients);
    return primary?.clients?.name ?? "";
  };

  const filtered = employees
    .filter((e: any) =>
      `${e.first_name} ${e.last_name} ${e.passport_number || ""} ${e.israeli_phone || ""} ${getClientName(e)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a: any, b: any) => {
      // Inactive employees always at the bottom
      const aInactive = a.status === "inactive" ? 1 : 0;
      const bInactive = b.status === "inactive" ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;
      const ca = getClientName(a) || "\uffff";
      const cb = getClientName(b) || "\uffff";
      if (ca !== cb) return ca.localeCompare(cb);
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

  return (
    <div className="flex flex-col">
      <AppHeader title="Employees" subtitle={`${employees.length} total employees`} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <DuplicateEmployeesPanel />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, passport..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => navigate("/employees/new")}>
            <Plus className="h-4 w-4 mr-1" /> Add Employee
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Citizenship</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  (() => {
                    const rows: JSX.Element[] = [];
                    let lastClient: string | null = null;
                    filtered.forEach((emp: any) => {
                      const isInactive = emp.status === "inactive";
                      const clientName = getClientName(emp) || "Unassigned";
                      const groupLabel = isInactive ? "Inactive" : clientName;
                      if (groupLabel !== lastClient) {
                        rows.push(
                          <TableRow key={`grp-${groupLabel}`} className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={6} className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {groupLabel}
                            </TableCell>
                          </TableRow>,
                        );
                        lastClient = groupLabel;
                      }
                      rows.push(
                        <TableRow
                          key={emp.id}
                          className={`cursor-pointer ${isInactive ? "opacity-60" : ""}`}
                          onClick={() => navigate(`/employees/${emp.id}`)}
                        >
                          <TableCell className="text-muted-foreground text-sm">{clientName}</TableCell>
                          <TableCell className="font-medium">
                            {emp.first_name} {emp.last_name}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {emp.israeli_phone || emp.foreign_phone || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{emp.citizenship || "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell capitalize">{emp.employee_type}</TableCell>
                          <TableCell>
                            <StatusBadge status={emp.status} />
                          </TableCell>
                        </TableRow>,
                      );
                    });
                    return rows;
                  })()
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Employees;
