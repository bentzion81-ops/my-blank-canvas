import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Search, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type SyncResult = { ok: boolean; [k: string]: any };

export const MeckanoSyncPanel = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data: logs, refetch } = useQuery({
    queryKey: ["sync-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  const run = async (action: string, payload: Record<string, any> = {}) => {
    setBusy(action);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("meckano-sync", {
        body: { action, ...payload },
      });
      if (error) throw error;
      setLastResult(data as SyncResult);
      if ((data as SyncResult)?.ok === false) {
        toast.error((data as any).error || "Sync failed");
      } else {
        toast.success("Done");
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message || String(e));
      setLastResult({ ok: false, error: String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Meckano Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("discover")}>
              {busy === "discover" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              Discover endpoints
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("sync_employees")}>
              {busy === "sync_employees" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Users className="h-4 w-4 mr-1" />}
              Sync employees
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </div>
            <Button size="sm" disabled={!!busy} onClick={() => run("sync_attendance", { from, to })}>
              {busy === "sync_attendance" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Clock className="h-4 w-4 mr-1" />}
              Sync attendance
            </Button>
          </div>

          {lastResult && (
            <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-64 border">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Sync Runs</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!logs?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                    No sync runs yet
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{format(new Date(l.started_at), "dd/MM HH:mm")}</TableCell>
                    <TableCell className="text-xs capitalize">{l.sync_type}</TableCell>
                    <TableCell className="text-xs capitalize">{l.trigger_kind}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "success" ? "default" : l.status === "error" ? "destructive" : "secondary"}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{l.records_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate" title={l.error_message || ""}>
                      {l.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
