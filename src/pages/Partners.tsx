import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Handshake, Users, DollarSign, Plus, Trash2, Loader2, FileDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientProfitability } from "@/hooks/useClientProfitability";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

type CommissionType = "per_hour" | "percent_profit" | "percent_revenue";

const COMMISSION_LABELS: Record<CommissionType, string> = {
  per_hour: "₪ per hour",
  percent_profit: "% of profit",
  percent_revenue: "% of revenue",
};

const Partners = () => {
  const qc = useQueryClient();
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);

  const fromStr = month;
  const toStr = format(endOfMonth(new Date(month)), "yyyy-MM-dd");

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const { clients, byClient, isLoading: loadingProfit } = useClientProfitability(fromStr, toStr);

  const { data: partners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners" as any)
        .select("id, name, phone, email, notes, is_active")
        .order("name");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ["partner-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_clients" as any)
        .select("id, partner_id, client_id, commission_type, commission_value, notes");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const activePartnerId = selectedPartner ?? partners[0]?.id ?? null;
  const activePartner = partners.find((p) => p.id === activePartnerId);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "—";

  const payoutFor = (link: any) => {
    const p = byClient.get(link.client_id);
    const hours = p?.hours || 0;
    const profit = p?.profit || 0;
    const revenue = p?.revenue || 0;
    const v = Number(link.commission_value || 0);
    if (link.commission_type === "per_hour") return hours * v;
    if (link.commission_type === "percent_profit") return (profit * v) / 100;
    return (revenue * v) / 100;
  };

  const partnerTotal = (partnerId: string) =>
    links.filter((l) => l.partner_id === partnerId).reduce((s, l) => s + payoutFor(l), 0);

  const partnerRows = useMemo(() => {
    if (!activePartnerId) return [];
    return links
      .filter((l) => l.partner_id === activePartnerId)
      .map((l) => {
        const p = byClient.get(l.client_id);
        return {
          link: l,
          name: clientName(l.client_id),
          hours: p?.hours || 0,
          revenue: p?.revenue || 0,
          profit: p?.profit || 0,
          payout: payoutFor(l),
        };
      })
      .sort((a, b) => b.payout - a.payout);
  }, [links, activePartnerId, byClient, clients]);

  const totals = useMemo(
    () => ({
      hours: partnerRows.reduce((s, r) => s + r.hours, 0),
      profit: partnerRows.reduce((s, r) => s + r.profit, 0),
      payout: partnerRows.reduce((s, r) => s + r.payout, 0),
    }),
    [partnerRows],
  );

  const grandPayout = useMemo(() => links.reduce((s, l) => s + payoutFor(l), 0), [links, byClient]);

  /* ---------- partner dialog ---------- */
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [pForm, setPForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openNewPartner = () => {
    setEditingPartner(null);
    setPForm({ name: "", phone: "", email: "", notes: "" });
    setPartnerOpen(true);
  };
  const openEditPartner = (p: any) => {
    setEditingPartner(p);
    setPForm({ name: p.name || "", phone: p.phone || "", email: p.email || "", notes: p.notes || "" });
    setPartnerOpen(true);
  };

  const savePartner = async () => {
    if (!pForm.name.trim()) {
      toast.error("Partner name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: pForm.name.trim(),
      phone: pForm.phone || null,
      email: pForm.email || null,
      notes: pForm.notes || null,
    };
    const { error } = editingPartner
      ? await supabase.from("partners" as any).update(payload).eq("id", editingPartner.id)
      : await supabase.from("partners" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingPartner ? "Partner updated" : "Partner added");
    setPartnerOpen(false);
    qc.invalidateQueries({ queryKey: ["partners"] });
  };

  const deletePartner = async (id: string) => {
    if (!confirm("Delete this partner and all its client links?")) return;
    const { error } = await supabase.from("partners" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Partner deleted");
    if (selectedPartner === id) setSelectedPartner(null);
    qc.invalidateQueries({ queryKey: ["partners"] });
    qc.invalidateQueries({ queryKey: ["partner-clients"] });
  };

  /* ---------- link dialog ---------- */
  const [linkOpen, setLinkOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<any>(null);
  const [lForm, setLForm] = useState<{ client_id: string; commission_type: CommissionType; commission_value: string }>({
    client_id: "",
    commission_type: "per_hour",
    commission_value: "",
  });

  const openNewLink = () => {
    setEditingLink(null);
    setLForm({ client_id: "", commission_type: "per_hour", commission_value: "" });
    setLinkOpen(true);
  };
  const openEditLink = (l: any) => {
    setEditingLink(l);
    setLForm({
      client_id: l.client_id,
      commission_type: l.commission_type,
      commission_value: String(l.commission_value ?? ""),
    });
    setLinkOpen(true);
  };

  const saveLink = async () => {
    if (!activePartnerId) return;
    if (!lForm.client_id) {
      toast.error("Select a client");
      return;
    }
    setSaving(true);
    const payload = {
      partner_id: activePartnerId,
      client_id: lForm.client_id,
      commission_type: lForm.commission_type,
      commission_value: Number(lForm.commission_value || 0),
    };
    const { error } = editingLink
      ? await supabase.from("partner_clients" as any).update(payload).eq("id", editingLink.id)
      : await supabase.from("partner_clients" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setLinkOpen(false);
    qc.invalidateQueries({ queryKey: ["partner-clients"] });
  };

  const deleteLink = async (id: string) => {
    const { error } = await supabase.from("partner_clients" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["partner-clients"] });
  };

  const exportCsv = () => {
    const header = ["Partner", "Client", "Hours", "Revenue", "Profit", "Commission", "Payout"];
    const lines = [header.join(",")];
    for (const r of partnerRows) {
      lines.push(
        [
          `"${activePartner?.name || ""}"`,
          `"${r.name}"`,
          r.hours.toFixed(1),
          r.revenue.toFixed(0),
          r.profit.toFixed(0),
          `"${r.link.commission_value} ${COMMISSION_LABELS[r.link.commission_type as CommissionType]}"`,
          r.payout.toFixed(0),
        ].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `partners-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const linkedClientIds = new Set(
    links.filter((l) => l.partner_id === activePartnerId && l.id !== editingLink?.id).map((l) => l.client_id),
  );

  return (
    <div className="flex flex-col">
      <AppHeader title="Partners" subtitle="Partner commissions per client" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!partnerRows.length}>
              <FileDown className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={openNewPartner}>
              <Plus className="h-4 w-4 mr-1" /> Add partner
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Partners" value={String(partners.length)} icon={Users} />
          <KpiCard title="Total payouts (all partners)" value={fmt(grandPayout)} icon={DollarSign} />
          <KpiCard title="Hours (selected partner)" value={totals.hours.toFixed(1)} icon={Handshake} />
          <KpiCard title="Payout (selected partner)" value={fmt(totals.payout)} icon={DollarSign} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Partners</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {loadingPartners ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : partners.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No partners yet.</p>
              ) : (
                partners.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-muted",
                      p.id === activePartnerId && "bg-muted",
                    )}
                    onClick={() => setSelectedPartner(p.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(partnerTotal(p.id))}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditPartner(p);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePartner(p.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">
                {activePartner ? `${activePartner.name} — linked clients` : "Linked clients"}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={openNewLink} disabled={!activePartnerId}>
                <Plus className="h-4 w-4 mr-1" /> Link client
              </Button>
            </CardHeader>
            <CardContent>
              {loadingProfit ? (
                <div className="py-10 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                </div>
              ) : partnerRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {activePartnerId ? "No clients linked to this partner." : "Add a partner to get started."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead className="text-right">Partner payout</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partnerRows.map((r) => (
                      <TableRow key={r.link.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.hours.toFixed(1)}</TableCell>
                        <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                        <TableCell
                          className={cn("text-right", r.profit >= 0 ? "text-success" : "text-destructive")}
                        >
                          {fmt(r.profit)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {r.link.commission_type === "per_hour"
                              ? `₪${r.link.commission_value}/hr`
                              : `${r.link.commission_value}% ${
                                  r.link.commission_type === "percent_profit" ? "profit" : "revenue"
                                }`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(r.payout)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditLink(r.link)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteLink(r.link.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{totals.hours.toFixed(1)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{fmt(totals.profit)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right">{fmt(totals.payout)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Partner dialog */}
      <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPartner ? "Edit partner" : "Add partner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input value={pForm.phone} onChange={(e) => setPForm({ ...pForm, phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={pForm.email} onChange={(e) => setPForm({ ...pForm, email: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={pForm.notes} onChange={(e) => setPForm({ ...pForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartnerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePartner} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit client commission" : "Link client to partner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client</Label>
              <Select
                value={lForm.client_id}
                onValueChange={(v) => setLForm({ ...lForm, client_id: v })}
                disabled={!!editingLink}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((c) => !linkedClientIds.has(c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Commission type</Label>
              <Select
                value={lForm.commission_type}
                onValueChange={(v) => setLForm({ ...lForm, commission_type: v as CommissionType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_hour">₪ per hour</SelectItem>
                  <SelectItem value="percent_profit">% of profit</SelectItem>
                  <SelectItem value="percent_revenue">% of revenue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lForm.commission_type === "per_hour" ? "Amount per hour (₪)" : "Percentage (%)"}</Label>
              <Input
                type="number"
                step="0.01"
                value={lForm.commission_value}
                onChange={(e) => setLForm({ ...lForm, commission_value: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLink} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Partners;
