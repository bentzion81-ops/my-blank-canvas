import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Loader2, MapPin } from "lucide-react";
import { ClientEmployeesTab, ClientHoursAndBilling } from "@/components/clients/ClientEmployeesAndBilling";
import { ClientWorkPlanningCard } from "@/components/clients/ClientWorkPlanningCard";
import { WorkLogsTable } from "@/components/work-logs/WorkLogsTable";
import { ClientApprovedReplacements } from "@/components/clients/ClientApprovedReplacements";
import { ClientBillingHistory } from "@/components/clients/ClientBillingHistory";

const ClientProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_contacts(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (!client) {
    return <div className="flex flex-col items-center justify-center h-64"><p className="text-muted-foreground">Client not found</p></div>;
  }

  const revenue = client.billing_type === "fixed" ? (client.monthly_payment || 0) : 0;

  return (
    <div className="flex flex-col">
      <AppHeader title={client.name} subtitle={`${client.client_type} • ${client.city || "No city"}`} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/clients")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <StatusBadge status={client.status} />
            <Button size="sm" variant="outline" onClick={() => navigate(`/clients/${id}/edit`)}>
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="work-logs">Work Logs</TabsTrigger>
            <TabsTrigger value="replacements">Replacements</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Company Details</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{client.client_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Company ID</span><span>{client.company_id || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Billing</span><span className="capitalize">{client.billing_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span>
                    <span>{client.billing_type === "fixed" ? `₪${revenue.toLocaleString()}/mo` : `₪${client.hourly_rate}/hr`}</span>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Location</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span>{client.address || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">City</span><span>{client.city || "—"}</span></div>
                  {client.google_maps_link && (
                    <a href={client.google_maps_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary text-xs hover:underline">
                      <MapPin className="h-3 w-3" /> Open in Maps
                    </a>
                  )}
                </CardContent>
              </Card>
            </div>
            <ClientWorkPlanningCard client={client} clientId={id!} />
            {client.client_contacts && client.client_contacts.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">Contacts</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {client.client_contacts.map((contact: any) => (
                    <div key={contact.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{contact.role}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {contact.phone && <p>{contact.phone}</p>}
                        {contact.email && <p>{contact.email}</p>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="employees">
            <ClientEmployeesTab clientId={id!} />
          </TabsContent>

          <TabsContent value="hours">
            <ClientHoursAndBilling
              clientId={id!}
              hourlyRate={client.hourly_rate || 0}
              billingType={client.billing_type}
              monthlyPayment={client.monthly_payment || 0}
            />
          </TabsContent>

          <TabsContent value="work-logs">
            <WorkLogsTable scope="client" clientId={id!} />
          </TabsContent>

          <TabsContent value="replacements">
            <ClientApprovedReplacements clientId={id!} />
          </TabsContent>

          <TabsContent value="billing">
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                Billing and invoice data will appear here.
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

export default ClientProfile;
