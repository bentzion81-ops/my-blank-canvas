import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Shield } from "lucide-react";

const usersData = [
  { name: "Admin User", email: "admin@company.com", role: "owner", status: "active", lastLogin: "2026-03-15" },
  { name: "Sarah Manager", email: "sarah@company.com", role: "manager", status: "active", lastLogin: "2026-03-14" },
  { name: "David Accountant", email: "david@company.com", role: "accountant", status: "active", lastLogin: "2026-03-13" },
];

const UserManagement = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="User Management" subtitle="Manage users and permissions" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex justify-end">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add User</Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData.map((u) => (
                  <TableRow key={u.email} className="cursor-pointer">
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="capitalize">{u.role}</TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="hidden md:table-cell">{u.lastLogin}</TableCell>
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

export default UserManagement;
