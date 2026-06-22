import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, MapPin, ChevronLeft, ChevronRight, ExternalLink, Copy, FileDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/utils";
import ApprovedEventsTab from "@/components/replacement/ApprovedEventsTab";
import PlannedEventsTab from "@/components/replacement/PlannedEventsTab";
import { parseCoordsFromUrl, resolveMapsCoords, findNearbyClients } from "@/lib/geo";
import { Sparkles } from "lucide-react";

type Report = {
  id: string;
  worker_id: string;
  passport_number: string;
  worker_name: string;
  work_date: string;
  check_in: string;
  check_out: string;
  total_hours: number;
  hourly_wage: number;
  total_payment: number;
  workplace_description: string;
  workplace_address: string | null;
  maps_link: string | null;
  status: string;
  assigned_client_id: string | null;
  assigned_custom_workplace: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  location_lat?: number | null;
  location_lng?: number | null;
};

type Client = { id: string; name: string; location_lat?: number | null; location_lng?: number | null };
type Worker = { id: string; full_name: string; passport_number: string; phone: string | null };
type ChangeReq = {
  id: string;
  report_id: string;
  worker_id: string;
  description: string;
  status: string;
  created_at: string;
  replacement_reports?: { worker_name: string; work_date: string };
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  needs_clarification: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
};

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function ReplacementAdmin() {
  const portalUrl = `${getShareableAppOrigin()}/report`;
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">דיווח שעות מחליפים</h1>
          <p className="text-sm text-muted-foreground">Replacement Workers Hour Reporting</p>
        </div>
        <Card className="shrink-0">
          <CardContent className="flex items-center gap-2 py-3">
            <span className="text-sm text-muted-foreground">קישור לעובדים:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{portalUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">דיווחי עובדים</TabsTrigger>
          <TabsTrigger value="approved">אירועים מאושרים</TabsTrigger>
          <TabsTrigger value="planned">אירועים מתוכננים</TabsTrigger>
          <TabsTrigger value="pending">ממתינים לאישור</TabsTrigger>
          <TabsTrigger value="employees">עובדים</TabsTrigger>
          <TabsTrigger value="clients">לקוחות</TabsTrigger>
          <TabsTrigger value="changes">בקשות שינוי</TabsTrigger>
        </TabsList>

        <TabsContent value="reports"><AllReportsTab /></TabsContent>
        <TabsContent value="approved"><ApprovedEventsTab /></TabsContent>
        <TabsContent value="planned"><PlannedEventsTab /></TabsContent>
        <TabsContent value="pending"><PendingTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="changes"><ChangesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ReportRow({ r, clients, onChanged, selectable, selected, onToggleSelect }: { r: Report; clients: Client[]; onChanged: () => void; selectable?: boolean; selected?: boolean; onToggleSelect?: (id: string) => void }) {
  const phones = useWorkerPhones().get(r.worker_id);
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>(r.assigned_client_id || "");
  const [customName, setCustomName] = useState(r.assigned_custom_workplace || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Editable fields
  const [workDate, setWorkDate] = useState(r.work_date);
  const [workerName, setWorkerName] = useState(r.worker_name);
  const [passport, setPassport] = useState(r.passport_number);
  const [checkIn, setCheckIn] = useState(r.check_in);
  const [checkOut, setCheckOut] = useState(r.check_out);
  const [wage, setWage] = useState(String(r.hourly_wage ?? ""));
  const [workplaceDesc, setWorkplaceDesc] = useState(r.workplace_description || "");
  const [workplaceAddress, setWorkplaceAddress] = useState(r.workplace_address || "");
  const [mapsLink, setMapsLink] = useState(r.maps_link || "");
  const [notes, setNotes] = useState(r.notes || "");

  // Reset state when row data changes
  useEffect(() => {
    setClientId(r.assigned_client_id || "");
    setCustomName(r.assigned_custom_workplace || "");
    setWorkDate(r.work_date);
    setWorkerName(r.worker_name);
    setPassport(r.passport_number);
    setCheckIn(r.check_in);
    setCheckOut(r.check_out);
    setWage(String(r.hourly_wage ?? ""));
    setWorkplaceDesc(r.workplace_description || "");
    setWorkplaceAddress(r.workplace_address || "");
    setMapsLink(r.maps_link || "");
    setNotes(r.notes || "");
  }, [r.id]);

  const computedHours = useMemo(() => {
    if (!checkIn || !checkOut) return Number(r.total_hours) || 0;
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    if ([h1, m1, h2, m2].some((n) => isNaN(n))) return Number(r.total_hours) || 0;
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60; // overnight shift
    return diff / 60;
  }, [checkIn, checkOut, r.total_hours]);
  const wageNum = parseFloat(wage) || 0;
  const computedPayment = computedHours * wageNum;

  // --- Likely client suggestion based on the report's coordinates ---
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(
    r.location_lat != null && r.location_lng != null
      ? { lat: Number(r.location_lat), lng: Number(r.location_lng) }
      : (mapsLink ? parseCoordsFromUrl(mapsLink) : null)
  );
  const [resolvingCoords, setResolvingCoords] = useState(false);

  // Re-parse when the maps link changes; resolve short links on demand.
  useEffect(() => {
    if (r.location_lat != null && r.location_lng != null && mapsLink === (r.maps_link || "")) {
      setReportCoords({ lat: Number(r.location_lat), lng: Number(r.location_lng) });
      return;
    }
    if (!mapsLink) { setReportCoords(null); return; }
    const local = parseCoordsFromUrl(mapsLink);
    if (local) { setReportCoords(local); return; }
    let cancelled = false;
    setResolvingCoords(true);
    resolveMapsCoords(mapsLink).then((c) => {
      if (!cancelled) setReportCoords(c);
    }).finally(() => { if (!cancelled) setResolvingCoords(false); });
    return () => { cancelled = true; };
  }, [mapsLink, r.location_lat, r.location_lng, r.maps_link]);

  const clientsWithCoords = useMemo(
    () => clients
      .filter((c) => c.location_lat != null && c.location_lng != null)
      .map((c) => ({ id: c.id, name: c.name, lat: Number(c.location_lat), lng: Number(c.location_lng) })),
    [clients]
  );

  const suggestion = useMemo(() => {
    if (!reportCoords) return null;
    return findNearestClient(reportCoords, clientsWithCoords);
  }, [reportCoords, clientsWithCoords]);


  const buildEditedPatch = () => ({
    work_date: workDate,
    worker_name: workerName.trim(),
    passport_number: passport.trim(),
    check_in: checkIn,
    check_out: checkOut,
    hourly_wage: wageNum,
    total_hours: computedHours,
    total_payment: computedPayment,
    workplace_description: workplaceDesc.trim(),
    workplace_address: workplaceAddress.trim() || null,
    maps_link: mapsLink.trim() || null,
    location_lat: reportCoords?.lat ?? null,
    location_lng: reportCoords?.lng ?? null,
    notes: notes.trim() || null,
  });

  const update = async (patch: any) => {
    setBusy(true);
    const { error } = await supabase.from("replacement_reports").update(patch).eq("id", r.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
    setOpen(false);
  };

  const saveOnly = () => update(buildEditedPatch());

  const resetEdits = () => {
    setClientId(r.assigned_client_id || "");
    setCustomName(r.assigned_custom_workplace || "");
    setWorkDate(r.work_date);
    setWorkerName(r.worker_name);
    setPassport(r.passport_number);
    setCheckIn(r.check_in);
    setCheckOut(r.check_out);
    setWage(String(r.hourly_wage ?? ""));
    setWorkplaceDesc(r.workplace_description || "");
    setWorkplaceAddress(r.workplace_address || "");
    setMapsLink(r.maps_link || "");
    setNotes(r.notes || "");
    setReason("");
    toast.success("השינויים בוטלו - הוחזרו הערכים המקוריים");
  };

  const isDirty =
    workDate !== r.work_date ||
    workerName !== r.worker_name ||
    passport !== r.passport_number ||
    checkIn !== r.check_in ||
    checkOut !== r.check_out ||
    wage !== String(r.hourly_wage ?? "") ||
    workplaceDesc !== (r.workplace_description || "") ||
    workplaceAddress !== (r.workplace_address || "") ||
    mapsLink !== (r.maps_link || "") ||
    notes !== (r.notes || "") ||
    clientId !== (r.assigned_client_id || "") ||
    customName !== (r.assigned_custom_workplace || "");

  const approve = async () => {
    if (!clientId && !customName.trim()) {
      return toast.error("יש לשייך ללקוח קיים או להזין מקום עבודה חדש");
    }
    let finalClientId = clientId;
    if (!finalClientId && customName.trim()) {
      // Create new client in main clients list
      const { data: newClient, error: createErr } = await supabase
        .from("clients")
        .insert({
          name: customName.trim(),
          address: workplaceAddress.trim() || null,
          google_maps_link: mapsLink.trim() || null,
          billing_type: "hourly",
          hourly_rate: 0,
          status: "active",
          client_type: "business",
        })
        .select("id")
        .single();
      if (createErr) {
        return toast.error("שגיאה ביצירת לקוח חדש: " + createErr.message);
      }
      finalClientId = newClient.id;
      toast.success(`נוצר לקוח חדש: ${customName.trim()}`);
    }
    update({
      ...buildEditedPatch(),
      status: "approved",
      assigned_client_id: finalClientId,
      assigned_custom_workplace: null,
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
      rejection_reason: null,
    });
  };

  const reject = () => update({ ...buildEditedPatch(), status: "rejected", rejection_reason: reason || null });

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(true)}>
        {selectable && (
          <TableCell onClick={(e) => e.stopPropagation()} className="w-8">
            <Checkbox checked={!!selected} onCheckedChange={() => onToggleSelect?.(r.id)} />
          </TableCell>
        )}
        <TableCell>{r.work_date}</TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(r.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
        </TableCell>
        <TableCell className="font-medium">
          <div>{r.worker_name}</div>
          {(phones?.israeli || phones?.foreign) && (
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 font-normal" dir="ltr">
              {phones?.israeli && <div>{phones.israeli}</div>}
              {phones?.foreign && <div>{phones.foreign}</div>}
            </div>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{r.passport_number}</TableCell>
        <TableCell>{r.check_in}–{r.check_out}</TableCell>
        <TableCell>{Number(r.total_hours).toFixed(2)}</TableCell>
        <TableCell className="max-w-[200px]">
          <div className="truncate">{r.workplace_description}</div>
          {resolvingCoords ? (
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
              <Loader2 className="h-3 w-3 animate-spin" /> מזהה מיקום…
            </div>
          ) : suggestion ? (
            <div className="text-[11px] inline-flex items-center gap-1 mt-0.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-muted-foreground">לכאורה:</span>
              <strong className="text-foreground truncate max-w-[140px]">{suggestion.client.name}</strong>
              <span className="text-muted-foreground">
                (~{suggestion.meters < 1000 ? `${Math.round(suggestion.meters)} מ׳` : `${(suggestion.meters / 1000).toFixed(2)} ק״מ`})
              </span>
            </div>
          ) : null}
        </TableCell>
        <TableCell>{Number(r.total_payment).toFixed(2)}</TableCell>
        <TableCell>
          <Badge variant="outline" className={statusColor[r.status]}>{r.status}</Badge>
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>דיווח של {r.worker_name} — {r.work_date}</DialogTitle>
            {(phones?.israeli || phones?.foreign) && (
              <div className="text-xs text-muted-foreground leading-tight" dir="ltr">
                {phones?.israeli && <div>📱 {phones.israeli}</div>}
                {phones?.foreign && <div>🌍 {phones.foreign}</div>}
              </div>
            )}
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>שם עובד</Label>
                <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>דרכון</Label>
                <Input value={passport} onChange={(e) => setPassport(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>תאריך</Label>
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שכר/שעה</Label>
                <Input type="number" step="0.01" value={wage} onChange={(e) => setWage(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שעת כניסה</Label>
                <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שעת יציאה</Label>
                <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              סה"כ שעות: <strong className="text-foreground">{computedHours.toFixed(2)}</strong> ·
              תשלום מחושב: <strong className="text-foreground">{computedPayment.toFixed(2)}</strong>
            </div>
            <div className="space-y-1">
              <Label>תיאור מקום העבודה</Label>
              <Input value={workplaceDesc} onChange={(e) => setWorkplaceDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>כתובת</Label>
              <Input value={workplaceAddress} onChange={(e) => setWorkplaceAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>קישור למפה</Label>
              <div className="flex gap-2">
                <Input value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="https://maps..." />
                {mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-sm whitespace-nowrap px-2">
                    <MapPin className="h-3 w-3" /> פתח <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {(mapsLink || reportCoords) && (
                <div className="text-xs rounded-md bg-muted/50 border px-2 py-1.5 mt-1">
                  {resolvingCoords ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> מזהה מיקום…
                    </span>
                  ) : !reportCoords ? (
                    <span className="text-muted-foreground">לא זוהה מיקום מהקישור</span>
                  ) : suggestion ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">לכאורה:</span>
                        <strong className="text-foreground">{suggestion.client.name}</strong>
                        <span className="text-muted-foreground">
                          (~{suggestion.meters < 1000
                            ? `${Math.round(suggestion.meters)} מ׳`
                            : `${(suggestion.meters / 1000).toFixed(2)} ק״מ`})
                        </span>
                      </span>
                      {clientId !== suggestion.client.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setClientId(suggestion.client.id)}
                        >
                          שייך
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">אין לקוחות עם מיקום מוגדר להשוואה</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="space-y-2">
                <Label>שייך ללקוח קיים</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-center text-muted-foreground">— או —</div>
              <div className="space-y-2">
                <Label>מקום עבודה חדש (לא ברשימה)</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="למשל: תחנת דלק שדרות" />
              </div>
              <div className="space-y-2">
                <Label>סיבת דחייה (אם דוחה)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={resetEdits} disabled={busy || !isDirty}>
              בטל שינויים
            </Button>
            <Button variant="secondary" onClick={saveOnly} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור שינויים"}
            </Button>
            <Button variant="outline" onClick={() => update({ ...buildEditedPatch(), status: "needs_clarification" })} disabled={busy}>
              ממתין לבירור
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>דחה</Button>
            <Button onClick={approve} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "אשר"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    (supabase.from("clients") as any)
      .select("id, name, location_lat, location_lng")
      .order("name")
      .then(({ data }: any) => {
        setClients((data as Client[]) || []);
      });
  }, []);
  return clients;
}

type PhonePair = { israeli: string | null; foreign: string | null };
let _phonesCache: Map<string, PhonePair> | null = null;
let _phonesPromise: Promise<Map<string, PhonePair>> | null = null;
const _phonesListeners = new Set<(m: Map<string, PhonePair>) => void>();
function useWorkerPhones() {
  const [map, setMap] = useState<Map<string, PhonePair>>(_phonesCache || new Map());
  useEffect(() => {
    if (_phonesCache) { setMap(_phonesCache); return; }
    _phonesListeners.add(setMap);
    if (!_phonesPromise) {
      _phonesPromise = (async () => {
        const { data } = await supabase.from("replacement_workers").select("id, phone, israeli_phone, foreign_phone" as any);
        const m = new Map<string, PhonePair>();
        (data || []).forEach((w: any) => {
          // Fallback: if israeli/foreign empty, infer from `phone`
          let il = w.israeli_phone as string | null;
          let fr = w.foreign_phone as string | null;
          if (!il && !fr && w.phone) {
            const p = String(w.phone).replace(/[\s-]/g, "");
            if (/^05\d{8}$/.test(p)) il = p;
            else if (/^\+/.test(p)) fr = p;
            else il = p;
          }
          m.set(w.id, { israeli: il, foreign: fr });
        });
        _phonesCache = m;
        _phonesListeners.forEach((fn) => fn(m));
        return m;
      })();
    }
    return () => { _phonesListeners.delete(setMap); };
  }, []);
  return map;
}

function BulkBar({ reports, selectedIds, setSelectedIds, onChanged, clients }: { reports: Report[]; selectedIds: Set<string>; setSelectedIds: (s: Set<string>) => void; onChanged: () => void; clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const count = selectedIds.size;
  if (count === 0) return null;
  const selectedReports = reports.filter((r) => selectedIds.has(r.id));

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-muted/60 border">
        <span className="text-sm font-medium">{count} נבחרו</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>נקה</Button>
          <Button size="sm" onClick={() => setOpen(true)}>פתח לעריכה ואישור / דחייה</Button>
        </div>
      </div>
      {open && (
        <BulkEditDialog
          reports={selectedReports}
          clients={clients}
          open={open}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); setSelectedIds(new Set()); onChanged(); }}
        />
      )}
    </>
  );
}

function BulkEditDialog({ reports, clients, open, onClose, onDone }: { reports: Report[]; clients: Client[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const count = reports.length;
  const [busy, setBusy] = useState(false);

  // Fields + per-section apply toggles
  const [applyDate, setApplyDate] = useState(false);
  const [workDate, setWorkDate] = useState(reports[0]?.work_date || "");
  const [applyHours, setApplyHours] = useState(false);
  const [checkIn, setCheckIn] = useState(reports[0]?.check_in || "08:00");
  const [checkOut, setCheckOut] = useState(reports[0]?.check_out || "17:00");
  const [applyWage, setApplyWage] = useState(false);
  const [wage, setWage] = useState(String(reports[0]?.hourly_wage ?? ""));
  const [applyWorkplace, setApplyWorkplace] = useState(false);
  const [workplaceDesc, setWorkplaceDesc] = useState(reports[0]?.workplace_description || "");
  const [workplaceAddress, setWorkplaceAddress] = useState(reports[0]?.workplace_address || "");
  const [mapsLink, setMapsLink] = useState(reports[0]?.maps_link || "");
  const [applyNotes, setApplyNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [applyClient, setApplyClient] = useState(false);
  const [clientId, setClientId] = useState("");
  const [customName, setCustomName] = useState("");
  const [reason, setReason] = useState("");

  const computeHours = (ci: string, co: string) => {
    const [h1, m1] = ci.split(":").map(Number);
    const [h2, m2] = co.split(":").map(Number);
    if ([h1, m1, h2, m2].some((n) => isNaN(n))) return 0;
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  };

  const buildPatchFor = (r: Report) => {
    const patch: any = {};
    if (applyDate) patch.work_date = workDate;
    const finalCheckIn = applyHours ? checkIn : r.check_in;
    const finalCheckOut = applyHours ? checkOut : r.check_out;
    const finalWage = applyWage ? (parseFloat(wage) || 0) : Number(r.hourly_wage) || 0;
    if (applyHours) {
      patch.check_in = checkIn;
      patch.check_out = checkOut;
    }
    if (applyWage) patch.hourly_wage = finalWage;
    if (applyHours || applyWage) {
      const hrs = computeHours(finalCheckIn, finalCheckOut);
      patch.total_hours = hrs;
      patch.total_payment = hrs * finalWage;
    }
    if (applyWorkplace) {
      patch.workplace_description = workplaceDesc.trim();
      patch.workplace_address = workplaceAddress.trim() || null;
      patch.maps_link = mapsLink.trim() || null;
    }
    if (applyNotes) patch.notes = notes.trim() || null;
    return patch;
  };

  const resolveClientId = async (): Promise<string | null | "skip"> => {
    if (!applyClient) return "skip";
    if (clientId) return clientId;
    if (customName.trim()) {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: customName.trim(),
          address: applyWorkplace ? (workplaceAddress.trim() || null) : null,
          google_maps_link: applyWorkplace ? (mapsLink.trim() || null) : null,
          billing_type: "hourly",
          hourly_rate: 0,
          status: "active",
          client_type: "business",
        })
        .select("id")
        .single();
      if (error) { toast.error("שגיאה ביצירת לקוח: " + error.message); return null; }
      toast.success(`נוצר לקוח חדש: ${customName.trim()}`);
      return data.id;
    }
    return "skip";
  };

  const apply = async (status?: "approved" | "rejected" | "needs_clarification") => {
    setBusy(true);
    const resolvedClient = await resolveClientId();
    if (resolvedClient === null) { setBusy(false); return; }

    if (status === "approved") {
      // Need a client on every row: either applied via bulk or pre-existing
      const willHaveClient = (r: Report) =>
        (resolvedClient && resolvedClient !== "skip") || !!r.assigned_client_id;
      const missing = reports.filter((r) => !willHaveClient(r));
      if (missing.length > 0) {
        setBusy(false);
        return toast.error(`${missing.length} דיווחים ללא לקוח - סמן "שייך ללקוח" ובחר לקוח כדי לאשר את כולם`);
      }
    }

    // Apply per-row (each may differ in calc baselines)
    for (const r of reports) {
      const patch = buildPatchFor(r);
      if (resolvedClient && resolvedClient !== "skip") {
        patch.assigned_client_id = resolvedClient;
        patch.assigned_custom_workplace = null;
      }
      if (status === "approved") {
        patch.status = "approved";
        patch.approved_at = new Date().toISOString();
        patch.approved_by = user?.id;
        patch.rejection_reason = null;
      } else if (status === "rejected") {
        patch.status = "rejected";
        patch.rejection_reason = reason.trim() || null;
      } else if (status === "needs_clarification") {
        patch.status = "needs_clarification";
      }
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabase.from("replacement_reports").update(patch).eq("id", r.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    setBusy(false);
    toast.success(
      status === "approved" ? `${count} אושרו`
      : status === "rejected" ? `${count} נדחו`
      : status === "needs_clarification" ? `${count} סומנו לבירור`
      : `${count} עודכנו`
    );
    onDone();
  };

  const Toggle = ({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(!!v)} />
      <span>{label}</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכה ואישור קבוצתי — {count} דיווחים</DialogTitle>
          <p className="text-xs text-muted-foreground">סמן רק שדות שברצונך להחיל על כל הדיווחים הנבחרים. שדות שלא מסומנים יישארו כפי שהיו בכל שורה.</p>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <section className="space-y-2 border rounded-lg p-3">
            <Toggle checked={applyDate} onCheckedChange={setApplyDate} label="החל תאריך אחיד" />
            {applyDate && <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />}
          </section>

          <section className="space-y-2 border rounded-lg p-3">
            <Toggle checked={applyHours} onCheckedChange={setApplyHours} label="החל שעות כניסה/יציאה אחידות" />
            {applyHours && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>כניסה</Label><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
                <div className="space-y-1"><Label>יציאה</Label><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
              </div>
            )}
            <Toggle checked={applyWage} onCheckedChange={setApplyWage} label="החל שכר/שעה אחיד" />
            {applyWage && <Input type="number" step="0.01" value={wage} onChange={(e) => setWage(e.target.value)} placeholder="שכר לשעה" />}
          </section>

          <section className="space-y-2 border rounded-lg p-3">
            <Toggle checked={applyWorkplace} onCheckedChange={setApplyWorkplace} label="החל פרטי מקום עבודה" />
            {applyWorkplace && (
              <div className="space-y-2">
                <Input value={workplaceDesc} onChange={(e) => setWorkplaceDesc(e.target.value)} placeholder="תיאור" />
                <Input value={workplaceAddress} onChange={(e) => setWorkplaceAddress(e.target.value)} placeholder="כתובת" />
                <Input value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="קישור למפה" />
              </div>
            )}
          </section>

          <section className="space-y-2 border rounded-lg p-3">
            <Toggle checked={applyNotes} onCheckedChange={setApplyNotes} label="החל הערות אחידות" />
            {applyNotes && <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}
          </section>

          <section className="space-y-2 border rounded-lg p-3">
            <Toggle checked={applyClient} onCheckedChange={setApplyClient} label="שייך את כולם ללקוח" />
            {applyClient && (
              <div className="space-y-2">
                <Select value={clientId} onValueChange={(v) => { setClientId(v); setCustomName(""); }}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח קיים..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-center text-muted-foreground">— או —</div>
                <Input value={customName} onChange={(e) => { setCustomName(e.target.value); setClientId(""); }} placeholder="שם לקוח חדש (ייווצר אוטומטית)" />
              </div>
            )}
          </section>

          <section className="space-y-2 border rounded-lg p-3">
            <Label className="text-xs">סיבת דחייה (אם דוחה)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </section>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={onClose} disabled={busy}>סגור</Button>
          <Button variant="secondary" onClick={() => apply()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור שינויים בלבד"}
          </Button>
          <Button variant="outline" onClick={() => apply("needs_clarification")} disabled={busy}>סמן לבירור</Button>
          <Button variant="destructive" onClick={() => apply("rejected")} disabled={busy}>דחה הכל</Button>
          <Button onClick={() => apply("approved")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "אשר הכל"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectAllHeader({ reports, selectedIds, setSelectedIds }: { reports: Report[]; selectedIds: Set<string>; setSelectedIds: (s: Set<string>) => void }) {
  const allSelected = reports.length > 0 && reports.every((r) => selectedIds.has(r.id));
  return (
    <TableHead className="w-8">
      <Checkbox
        checked={allSelected}
        onCheckedChange={(v) => {
          if (v) setSelectedIds(new Set(reports.map((r) => r.id)));
          else setSelectedIds(new Set());
        }}
      />
    </TableHead>
  );
}

function PendingTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const clients = useClients();

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("replacement_reports")
      .select("*")
      .in("status", ["pending", "needs_clarification"])
      .order("created_at", { ascending: false });
    if (dateFrom) q = q.gte("work_date", dateFrom);
    if (dateTo) q = q.lte("work_date", dateTo);
    const { data } = await q;
    setReports((data as Report[]) || []);
    setSelectedIds(new Set());
    setLoading(false);
  };
  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const toggle = (id: string) => {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedIds(n);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <CardTitle>דיווחים ממתינים לאישור ({reports.length})</CardTitle>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">מתאריך</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">עד תאריך</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>נקה</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          reports.length === 0 ? <p className="text-muted-foreground text-center py-6">אין דיווחים ממתינים</p> :
            <>
              <BulkBar reports={reports} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onChanged={load} clients={clients} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <SelectAllHeader reports={reports} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
                    <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                    <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                    <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} selectable selected={selectedIds.has(r.id)} onToggleSelect={toggle} />)}
                </TableBody>
              </Table>
            </>
        }
      </CardContent>
    </Card>
  );
}

function AllReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "work_desc" | "work_asc">("created_desc");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const clients = useClients();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const sortCol = sortBy.startsWith("created") ? "created_at" : "work_date";
    const ascending = sortBy.endsWith("asc");
    let q = supabase.from("replacement_reports").select("*").order(sortCol, { ascending });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (dateFrom) q = q.gte("work_date", dateFrom);
    if (dateTo) q = q.lte("work_date", dateTo);
    const { data } = await q;
    setReports((data as Report[]) || []);
    setSelectedIds(new Set());
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter, sortBy, dateFrom, dateTo]);

  const toggle = (id: string) => {
    const n = new Set(selectedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedIds(n);
  };

  const filtered = reports.filter((r) =>
    !search.trim() ||
    r.worker_name.toLowerCase().includes(search.toLowerCase()) ||
    r.passport_number.includes(search) ||
    r.workplace_description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end gap-3">
          <CardTitle>כל הדיווחים</CardTitle>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">מתאריך</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">עד תאריך</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>נקה</Button>
            )}
            <Input placeholder="חיפוש לפי שם / דרכון / מקום" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">דיווחים אחרונים (חדש→ישן)</SelectItem>
                <SelectItem value="created_asc">דיווחים ראשונים (ישן→חדש)</SelectItem>
                <SelectItem value="work_desc">תאריך עבודה (חדש→ישן)</SelectItem>
                <SelectItem value="work_asc">תאריך עבודה (ישן→חדש)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="approved">מאושר</SelectItem>
                <SelectItem value="rejected">נדחה</SelectItem>
                <SelectItem value="needs_clarification">בירור</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          <>
            <BulkBar reports={filtered} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onChanged={load} clients={clients} />
            <Table>
              <TableHeader>
                <TableRow>
                  <SelectAllHeader reports={filtered} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
                  <TableHead>תאריך עבודה</TableHead><TableHead>דווח בתאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} selectable selected={selectedIds.has(r.id)} onToggleSelect={toggle} />)}
              </TableBody>
            </Table>
          </>}
      </CardContent>
    </Card>
  );
}

function MonthNav({ month, setMonth }: { month: Date; setMonth: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <div className="font-medium w-40 text-center">{fmtMonth(month)}</div>
      <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmployeesTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<Worker | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [month, setMonth] = useState(monthStart(new Date()));
  const clients = useClients();

  useEffect(() => {
    supabase.from("replacement_workers").select("id, full_name, passport_number, phone").order("full_name")
      .then(({ data }) => setWorkers((data as Worker[]) || []));
  }, []);

  const load = async () => {
    if (!selected) return;
    const start = toLocalISODate(monthStart(month));
    const end = toLocalISODate(monthEnd(month));
    const { data } = await supabase
      .from("replacement_reports")
      .select("*")
      .eq("worker_id", selected.id)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date");
    setReports((data as Report[]) || []);
  };
  useEffect(() => { load(); }, [selected, month]);

  const totals = useMemo(() => ({
    hours: reports.reduce((s, r) => s + Number(r.total_hours), 0),
    pay: reports.reduce((s, r) => s + Number(r.total_payment), 0),
  }), [reports]);

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">עובדים ({workers.length})</CardTitle></CardHeader>
        <CardContent className="p-2 max-h-[600px] overflow-y-auto">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className={`w-full text-right p-2 rounded hover:bg-muted ${selected?.id === w.id ? "bg-muted" : ""}`}
            >
              <div className="font-medium text-sm">{w.full_name}</div>
              <div className="text-xs text-muted-foreground">{w.passport_number}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{selected ? selected.full_name : "בחר עובד"}</CardTitle>
            {selected && <MonthNav month={month} setMonth={setMonth} />}
          </div>
          {selected && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>סך שעות: <strong className="text-foreground">{totals.hours.toFixed(2)}</strong></span>
              <span>סך תשלום: <strong className="text-foreground">{totals.pay.toFixed(2)}</strong></span>
              <span>דיווחים: <strong className="text-foreground">{reports.length}</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selected && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientsTab() {
  const clients = useClients();
  const [selected, setSelected] = useState<Client | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [month, setMonth] = useState(monthStart(new Date()));

  const load = async () => {
    if (!selected) return;
    const start = toLocalISODate(monthStart(month));
    const end = toLocalISODate(monthEnd(month));
    const { data } = await supabase
      .from("replacement_reports")
      .select("*")
      .eq("assigned_client_id", selected.id)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date");
    setReports((data as Report[]) || []);
  };
  useEffect(() => { load(); }, [selected, month]);

  const totals = useMemo(() => ({
    hours: reports.reduce((s, r) => s + Number(r.total_hours), 0),
    pay: reports.reduce((s, r) => s + Number(r.total_payment), 0),
  }), [reports]);

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">לקוחות ({clients.length})</CardTitle></CardHeader>
        <CardContent className="p-2 max-h-[600px] overflow-y-auto">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-right p-2 rounded hover:bg-muted ${selected?.id === c.id ? "bg-muted" : ""}`}
            >
              <div className="font-medium text-sm">{c.name}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{selected ? selected.name : "בחר לקוח"}</CardTitle>
            <div className="flex items-center gap-2">
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportClientReportPdf(selected, month, reports, totals)}
                >
                  <FileDown className="h-4 w-4 mr-1" /> הורד PDF
                </Button>
              )}
              {selected && <MonthNav month={month} setMonth={setMonth} />}
            </div>
          </div>
          {selected && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>סך שעות: <strong className="text-foreground">{totals.hours.toFixed(2)}</strong></span>
              <span>סך תשלום: <strong className="text-foreground">{totals.pay.toFixed(2)}</strong></span>
              <span>דיווחים: <strong className="text-foreground">{reports.length}</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selected && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function exportClientReportPdf(
  client: Client,
  month: Date,
  reports: Report[],
  totals: { hours: number; pay: number },
) {
  const monthLabel = month.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const escape = (s: any) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rowsHtml = reports
    .map((r) => {
      const place = r.assigned_custom_workplace || r.workplace_description || "";
      return `<tr>
        <td>${escape(r.work_date)}</td>
        <td>${escape(r.worker_name)}</td>
        <td>${escape((r.check_in || "").slice(0, 5))}–${escape((r.check_out || "").slice(0, 5))}</td>
        <td>${Number(r.total_hours).toFixed(2)}</td>
        <td>${escape(place)}</td>
        <td>${escape(r.status)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
    <title>${escape(client.name)} - ${escape(monthLabel)}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      .totals { display: flex; gap: 24px; margin: 12px 0 18px; font-size: 13px; }
      .totals strong { color: #000; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
      th { background: #f3f4f6; font-weight: 600; }
      tr:nth-child(even) td { background: #fafafa; }
      @media print { body { padding: 0; } @page { size: A4; margin: 12mm; } }
    </style></head><body>
    <h1>דוח שעות מחליפים — ${escape(client.name)}</h1>
    <div class="sub">${escape(monthLabel)} · נוצר ב-${new Date().toLocaleDateString("he-IL")}</div>
    <div class="totals">
      <span>סך שעות: <strong>${totals.hours.toFixed(2)}</strong></span>
      <span>דיווחים: <strong>${reports.length}</strong></span>
    </div>
    <table>
      <thead><tr>
        <th>תאריך</th><th>עובד</th><th>שעות</th><th>סה"כ</th><th>מקום</th><th>סטטוס</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#888;padding:20px">אין דיווחים בחודש זה</td></tr>`}</tbody>
    </table>
    <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    toast.error("הדפדפן חסם את הפתיחה. אפשר חלונות קופצים ונסה שוב.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function ChangesTab() {
  const [items, setItems] = useState<ChangeReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("replacement_change_requests")
      .select("*, replacement_reports(worker_name, work_date)")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    const { data } = await q;
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("replacement_change_requests")
      .update({ status: status as any, handled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>בקשות שינוי</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">פתוחות</SelectItem>
              <SelectItem value="resolved">טופלו</SelectItem>
              <SelectItem value="dismissed">נדחו</SelectItem>
              <SelectItem value="all">הכל</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          items.length === 0 ? <p className="text-muted-foreground text-center py-6">אין בקשות</p> :
            items.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {c.replacement_reports?.worker_name} — {c.replacement_reports?.work_date}
                  </div>
                  <Badge variant="outline">{c.status}</Badge>
                </div>
                <p className="text-sm">{c.description}</p>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </div>
                {c.status === "open" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setStatus(c.id, "resolved")}>סמן כטופל</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "dismissed")}>דחה</Button>
                  </div>
                )}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
