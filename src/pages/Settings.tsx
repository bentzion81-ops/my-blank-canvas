import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MeckanoSyncPanel } from "@/components/settings/MeckanoSyncPanel";

const SettingsPage = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Settings" subtitle="Platform configuration" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card className="border-0 shadow-sm max-w-lg">
              <CardHeader><CardTitle className="text-sm">Company Info</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Company Name</Label>
                  <Input defaultValue="My Service Company" />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Input defaultValue="₪ (ILS)" disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Timezone</Label>
                  <Input defaultValue="Asia/Jerusalem" disabled />
                </div>
                <Button size="sm">Save Changes</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance">
            <MeckanoSyncPanel />
          </TabsContent>

          {["calendar", "payroll", "billing", "notifications"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p className="text-sm capitalize">{tab} settings coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsPage;
