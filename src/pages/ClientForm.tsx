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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MapPin } from "lucide-react";
import { resolveMapsCoords } from "@/lib/geo";

const defaultForm = {
  name: "",
  client_type: "business" as "institution" | "business" | "factory" | "other",
  company_id: "",
  address: "",
  city: "",
  google_maps_link: "",
  location_lat: "" as string | number,
  location_lng: "" as string | number,
  billing_type: "fixed" as "fixed" | "hourly",
  monthly_payment: 0,
  hourly_rate: 0,
  payment_terms_days: 30,
  vat_rate: 18,
  tax_withholding_pct: 0,
  invoicing_company: "urban_link" as "urban_link" | "ab_property",
  billing_notes: "",
  daily_planned_hours: 0,
  friday_hours: 0,
  saturday_hours: 0,
  include_friday: false,
  include_saturday: false,
  status: "active" as "active" | "paused" | "ended",
  notes: "",
};

const ClientForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name || "",
        client_type: existing.client_type || "business",
        company_id: existing.company_id || "",
        address: existing.address || "",
        city: existing.city || "",
        google_maps_link: existing.google_maps_link || "",
        location_lat: (existing as any).location_lat ?? "",
        location_lng: (existing as any).location_lng ?? "",
        billing_type: existing.billing_type || "fixed",
        monthly_payment: existing.monthly_payment || 0,
        hourly_rate: existing.hourly_rate || 0,
        payment_terms_days: (existing as any).payment_terms_days ?? 30,
        vat_rate: (existing as any).vat_rate ?? 18,
        tax_withholding_pct: (existing as any).tax_withholding_pct ?? 0,
        invoicing_company: ((existing as any).invoicing_company as any) || "urban_link",
        billing_notes: (existing as any).billing_notes || "",
        daily_planned_hours: existing.daily_planned_hours || 0,
        friday_hours: (existing as any).friday_hours || 0,
        saturday_hours: (existing as any).saturday_hours || 0,
        include_friday: existing.include_friday || false,
        include_saturday: existing.include_saturday || false,
        status: existing.status || "active",
        notes: existing.notes || "",
      });
    }
  }, [existing]);

  const update = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        monthly_payment: Number(form.monthly_payment) || 0,
        hourly_rate: Number(form.hourly_rate) || 0,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        vat_rate: Number(form.vat_rate) || 0,
        tax_withholding_pct: Number(form.tax_withholding_pct) || 0,
        daily_planned_hours: Number(form.daily_planned_hours) || 0,
        friday_hours: Number(form.friday_hours) || 0,
        saturday_hours: Number(form.saturday_hours) || 0,
        location_lat: form.location_lat === "" || form.location_lat == null ? null : Number(form.location_lat),
        location_lng: form.location_lng === "" || form.location_lng == null ? null : Number(form.location_lng),
      };
      if (isEdit) {
        const { error } = await (supabase.from("clients") as any).update(payload).eq("id", id!);
        if (error) throw error;
        toast.success("Client updated");
      } else {
        const { error } = await (supabase.from("clients") as any).insert(payload);
        if (error) throw error;
        toast.success("Client created");
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      navigate(isEdit ? `/clients/${id}` : "/clients");
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
      <AppHeader title={isEdit ? "Edit Client" : "Add Client"} />
      <div className="flex-1 space-y-4 p-4 lg:p-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/clients/${id}` : "/clients")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">General Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Client Name *</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.client_type} onValueChange={(v) => update("client_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="institution">Institution</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="factory">Factory</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Company ID</Label>
              <Input value={form.company_id} onChange={(e) => update("company_id", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Location</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Google Maps Link</Label>
              <div className="flex gap-2">
                <Input value={form.google_maps_link} onChange={(e) => update("google_maps_link", e.target.value)} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.google_maps_link}
                  onClick={async () => {
                    const url = String(form.google_maps_link || "").trim();
                    if (!url) return;
                    toast.message("Resolving coordinates…");
                    const coords = await resolveMapsCoords(url);
                    if (!coords) { toast.error("Could not extract coordinates from this link"); return; }
                    update("location_lat", coords.lat);
                    update("location_lng", coords.lng);
                    toast.success(`Coordinates set: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
                  }}
                >
                  <MapPin className="h-3 w-3" /> Resolve
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Used to auto-suggest this client when replacement workers report from nearby.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Latitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={form.location_lat}
                onChange={(e) => update("location_lat", e.target.value)}
                placeholder="e.g. 31.7683"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitude</Label>
              <Input
                type="number"
                step="0.000001"
                value={form.location_lng}
                onChange={(e) => update("location_lng", e.target.value)}
                placeholder="e.g. 35.2137"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Work Planning</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Sun–Thu Hours/Day</Label>
              <Input type="number" value={form.daily_planned_hours} onChange={(e) => update("daily_planned_hours", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Checkbox checked={form.include_friday} onCheckedChange={(v) => update("include_friday", v)} id="friday" />
                <Label htmlFor="friday">Include Friday</Label>
              </div>
              {form.include_friday && (
                <Input type="number" placeholder="Friday hours" value={form.friday_hours} onChange={(e) => update("friday_hours", e.target.value)} />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Checkbox checked={form.include_saturday} onCheckedChange={(v) => update("include_saturday", v)} id="saturday" />
                <Label htmlFor="saturday">Include Saturday</Label>
              </div>
              {form.include_saturday && (
                <Input type="number" placeholder="Saturday hours" value={form.saturday_hours} onChange={(e) => update("saturday_hours", e.target.value)} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Billing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Billing Type</Label>
              <Select value={form.billing_type} onValueChange={(v) => update("billing_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Monthly</SelectItem>
                  <SelectItem value="hourly">Hourly Rate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.billing_type === "fixed" ? (
              <div className="space-y-1.5">
                <Label>Monthly Payment (₪)</Label>
                <Input type="number" value={form.monthly_payment} onChange={(e) => update("monthly_payment", e.target.value)} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Hourly Rate (₪)</Label>
                <Input type="number" value={form.hourly_rate} onChange={(e) => update("hourly_rate", e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Payment Terms (days)</Label>
              <Input type="number" value={form.payment_terms_days} onChange={(e) => update("payment_terms_days", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VAT Rate (%)</Label>
              <Input type="number" step="0.01" value={form.vat_rate} onChange={(e) => update("vat_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Withholding (%)</Label>
              <Input type="number" step="0.01" value={form.tax_withholding_pct} onChange={(e) => update("tax_withholding_pct", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoicing Company</Label>
              <Select value={form.invoicing_company} onValueChange={(v) => update("invoicing_company", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urban_link">אורבן לינק</SelectItem>
                  <SelectItem value="ab_property">א.ב ניהול נכסים</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Billing Notes</Label>
              <Textarea value={form.billing_notes} onChange={(e) => update("billing_notes", e.target.value)} rows={2} />
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
          <Button variant="outline" onClick={() => navigate(isEdit ? `/clients/${id}` : "/clients")}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? "Update Client" : "Save Client"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClientForm;
