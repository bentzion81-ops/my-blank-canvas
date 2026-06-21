import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LANGS, Lang, dirFor, t } from "@/lib/replacementI18n";
import { Loader2, MapPin, Plus, ArrowLeft, LogOut } from "lucide-react";
import urbanLinkLogo from "@/assets/urbanlink-logo.jpeg";
import { parseCoordsFromUrl, findNearestClient, type ClientLoc } from "@/lib/geo";

type Worker = {
  id: string;
  full_name: string;
  passport_number: string;
  phone: string | null;
  preferred_language: Lang;
};

type Report = {
  id: string;
  work_date: string;
  check_in: string;
  check_out: string;
  total_hours: number;
  total_payment: number;
  workplace_description: string;
  workplace_address: string | null;
  maps_link: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: string;
  hourly_wage: number;
};

type Step = "lang" | "passport" | "register" | "home" | "form" | "list";

const STORAGE_KEY = "replacement_worker_id";

export default function ReplacementPortal() {
  const [lang, setLang] = useState<Lang | null>(null);
  const [step, setStep] = useState<Step>("lang");
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(false);
  const [passport, setPassport] = useState("");

  useEffect(() => {
    const wid = localStorage.getItem(STORAGE_KEY);
    if (wid) {
      supabase
        .from("replacement_workers")
        .select("*")
        .eq("id", wid)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setWorker(data as Worker);
            setLang(data.preferred_language as Lang);
            setStep("home");
          }
        });
    }
  }, []);

  const dir = useMemo(() => (lang ? dirFor(lang) : "ltr"), [lang]);

  if (!lang || step === "lang") {
    return <LangPicker onPick={(l) => { setLang(l); setStep("passport"); }} />;
  }

  return (
    <div dir={dir} className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <Header
          lang={lang}
          worker={worker}
          onLogout={() => {
            localStorage.removeItem(STORAGE_KEY);
            setWorker(null);
            setStep("lang");
          }}
          onChangeLang={() => setStep("lang")}
        />

        {step === "passport" && (
          <PassportStep
            lang={lang}
            loading={loading}
            value={passport}
            onChange={setPassport}
            onSubmit={async () => {
              const trimmed = passport.trim();
              if (!trimmed) return;
              if (trimmed.length < 8) {
                toast.error(t("passportMinLen", lang));
                return;
              }
              setLoading(true);
              const { data } = await supabase
                .from("replacement_workers")
                .select("*")
                .eq("passport_number", trimmed)
                .maybeSingle();
              setLoading(false);
              if (data) {
                setWorker(data as Worker);
                localStorage.setItem(STORAGE_KEY, data.id);
                setLang(data.preferred_language as Lang);
                setStep("home");
              } else {
                setStep("register");
              }
            }}
          />
        )}

        {step === "register" && (
          <RegisterStep
            lang={lang}
            passport={passport}
            onRegistered={(w) => {
              setWorker(w);
              localStorage.setItem(STORAGE_KEY, w.id);
              setLang(w.preferred_language);
              setStep("home");
            }}
          />
        )}

        {step === "home" && worker && (
          <HomeStep
            lang={lang}
            onNew={() => setStep("form")}
            onList={() => setStep("list")}
          />
        )}

        {step === "form" && worker && (
          <ReportForm
            lang={lang}
            worker={worker}
            onDone={() => setStep("list")}
            onBack={() => setStep("home")}
          />
        )}

        {step === "list" && worker && (
          <ReportsList lang={lang} worker={worker} onBack={() => setStep("home")} />
        )}
      </div>
    </div>
  );
}

function LangPicker({ onPick }: { onPick: (l: Lang) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-4">
          <img
            src={urbanLinkLogo}
            alt="Urban Link Manpower"
            className="h-32 w-32 rounded-2xl object-cover shadow-md"
          />
          <CardTitle className="text-center">Choose language / בחר שפה</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {LANGS.map((l) => (
            <Button key={l.code} size="lg" variant="outline" className="h-14 text-lg" onClick={() => onPick(l.code)}>
              {l.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Header({
  lang,
  worker,
  onLogout,
  onChangeLang,
}: {
  lang: Lang;
  worker: Worker | null;
  onLogout: () => void;
  onChangeLang: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {worker && (
          <div className="text-sm">
            <span className="text-muted-foreground">{t("hello", lang)}, </span>
            <span className="font-semibold">{worker.full_name}</span>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onChangeLang}>
          🌐
        </Button>
        {worker && (
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PassportStep({
  lang,
  value,
  onChange,
  onSubmit,
  loading,
}: {
  lang: Lang;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("enterPassport", lang)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-base">{t("passportNumber", lang)}</Label>
          <Input
            className="h-12 text-lg"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            minLength={8}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t("passportMinLen", lang)}</p>
        </div>
        <Button className="w-full h-12 text-base" onClick={onSubmit} disabled={loading || value.trim().length < 8}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("identify", lang)}
        </Button>
      </CardContent>
    </Card>
  );
}

function RegisterStep({
  lang,
  passport,
  onRegistered,
}: {
  lang: Lang;
  passport: string;
  onRegistered: (w: Worker) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [israeliPhone, setIsraeliPhone] = useState("");
  const [foreignPhone, setForeignPhone] = useState("");
  const [pref, setPref] = useState<Lang>(lang);
  const [loading, setLoading] = useState(false);

  // English letters, spaces, hyphens, apostrophes only
  const englishOnlyRegex = /^[A-Za-z\s'-]+$/;
  const sanitizeEnglish = (v: string) => v.replace(/[^A-Za-z\s'-]/g, "");

  const israeliValid = (v: string) => /^05\d{8}$/.test(v);
  const foreignValid = (v: string) => /^\+[0-9\s-]{6,}$/.test(v);

  const submit = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const ilPh = israeliPhone.trim().replace(/[\s-]/g, "");
    const frPh = foreignPhone.trim();
    if (!fn || !ln) return toast.error(t("required", lang));
    if (!englishOnlyRegex.test(fn) || !englishOnlyRegex.test(ln)) {
      return toast.error(t("englishOnly", lang));
    }
    if (!ilPh && !frPh) return toast.error(t("phoneAtLeastOne", lang));
    if (ilPh && !israeliValid(ilPh)) return toast.error(t("invalidIsraeliPhone", lang));
    if (frPh && !foreignValid(frPh)) return toast.error(t("invalidForeignPhone", lang));
    if (passport.trim().length < 8) return toast.error(t("passportMinLen", lang));
    setLoading(true);
    const primaryPhone = ilPh || frPh;
    const { data, error } = await supabase
      .from("replacement_workers")
      .insert({
        full_name: `${fn} ${ln}`,
        passport_number: passport.trim(),
        phone: primaryPhone,
        israeli_phone: ilPh || null,
        foreign_phone: frPh || null,
        preferred_language: pref,
      } as any)
      .select()
      .single();
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    // Also add to the main employees list (if not already present by passport)
    const { data: existingEmp } = await supabase
      .from("employees")
      .select("id")
      .eq("passport_number", passport.trim())
      .maybeSingle();

    if (!existingEmp) {
      await supabase.from("employees").insert({
        first_name: fn,
        last_name: ln,
        passport_number: passport.trim(),
        israeli_phone: ilPh || null,
        foreign_phone: frPh || null,
        employee_type: "temporary",
        status: "active",
        meckano_synced: false,
        source: "replacement_link",
      } as any);
    }

    setLoading(false);
    onRegistered(data as Worker);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("newWorkerTitle", lang)}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("newWorkerHelp", lang)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("passportNumber", lang)}</Label>
          <Input value={passport} disabled className="h-12" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("firstName", lang)} *</Label>
            <Input
              className="h-12 text-lg"
              dir="ltr"
              value={firstName}
              onChange={(e) => setFirstName(sanitizeEnglish(e.target.value))}
              placeholder="John"
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("lastName", lang)} *</Label>
            <Input
              className="h-12 text-lg"
              dir="ltr"
              value={lastName}
              onChange={(e) => setLastName(sanitizeEnglish(e.target.value))}
              placeholder="Doe"
              autoComplete="family-name"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("englishOnly", lang)}</p>
        <div className="space-y-2">
          <Label>{t("israeliPhone", lang)}</Label>
          <Input
            className="h-12 text-lg"
            type="tel"
            inputMode="numeric"
            dir="ltr"
            placeholder="05XXXXXXXX"
            maxLength={10}
            value={israeliPhone}
            onChange={(e) => setIsraeliPhone(e.target.value.replace(/[^\d]/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("foreignPhone", lang)}</Label>
          <Input
            className="h-12 text-lg"
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="+..."
            value={foreignPhone}
            onChange={(e) => setForeignPhone(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("phoneAtLeastOne", lang)}</p>
        <div className="space-y-2">
          <Label>{t("language", lang)}</Label>
          <Select value={pref} onValueChange={(v) => setPref(v as Lang)}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="w-full h-12"
          onClick={submit}
          disabled={loading || !firstName.trim() || !lastName.trim() || (!israeliPhone.trim() && !foreignPhone.trim())}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("register", lang)}
        </Button>
      </CardContent>
    </Card>
  );
}

function HomeStep({
  lang,
  onNew,
  onList,
}: {
  lang: Lang;
  onNew: () => void;
  onList: () => void;
}) {
  return (
    <div className="grid gap-3">
      <Button className="h-20 text-lg" onClick={onNew}>
        <Plus className="h-5 w-5" /> {t("newReport", lang)}
      </Button>
      <Button variant="outline" className="h-20 text-lg" onClick={onList}>
        {t("myReports", lang)}
      </Button>
    </div>
  );
}

function ReportForm({
  lang,
  worker,
  onDone,
  onBack,
}: {
  lang: Lang;
  worker: Worker;
  onDone: () => void;
  onBack: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkIn, setCheckIn] = useState("08:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [desc, setDesc] = useState("");
  const [address, setAddress] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [wage, setWage] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const totalHours = useMemo(() => {
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    const mins = h2 * 60 + m2 - (h1 * 60 + m1);
    return Math.max(0, mins / 60);
  }, [checkIn, checkOut]);

  const wageNum = parseFloat(wage) || 0;
  const totalPay = totalHours * wageNum;

  const submit = async () => {
    if (!desc.trim()) return toast.error(t("required", lang));
    if (!wage.trim() || wageNum <= 0) return toast.error(t("required", lang));
    if (!address.trim() && !mapsLink.trim()) return toast.error(t("locationRequired", lang));
    setLoading(true);
    // Try to resolve coordinates from the maps link so the office can auto-suggest a client.
    let lat: number | null = null;
    let lng: number | null = null;
    if (mapsLink.trim()) {
      try {
        const { resolveMapsCoords } = await import("@/lib/geo");
        const coords = await resolveMapsCoords(mapsLink.trim());
        if (coords) { lat = coords.lat; lng = coords.lng; }
      } catch { /* non-blocking */ }
    }
    const { error } = await supabase.from("replacement_reports").insert({
      worker_id: worker.id,
      passport_number: worker.passport_number,
      worker_name: worker.full_name,
      work_date: date,
      check_in: checkIn,
      check_out: checkOut,
      total_hours: totalHours,
      hourly_wage: wageNum,
      total_payment: totalPay,
      workplace_description: desc.trim(),
      workplace_address: address.trim() || null,
      maps_link: mapsLink.trim() || null,
      location_lat: lat,
      location_lng: lng,
      notes: notes.trim() || null,
    } as any);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(t("submitted", lang));
    onDone();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("newReport", lang)}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("workDate", lang)}</Label>
          <Input type="date" className="h-12" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t("checkIn", lang)}</Label>
            <Input type="time" className="h-12" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("checkOut", lang)}</Label>
            <Input type="time" className="h-12" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("totalHours", lang)}: <span className="font-semibold">{totalHours.toFixed(2)}</span>
        </div>
        <div className="space-y-2">
          <Label>{t("workplaceDesc", lang)} *</Label>
          <Input
            className="h-12 text-lg"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t("workplaceDescHelp", lang)}
          />
        </div>
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">{t("locationSection", lang)} *</p>
          <p className="text-xs text-muted-foreground">{t("locationHelp", lang)}</p>
          <div className="space-y-2">
            <Label>{t("address", lang)}</Label>
            <Input className="h-12" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("addressPlaceholder", lang)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {t("mapsLink", lang)}</Label>
            <Input className="h-12" value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="https://maps.google.com/..." inputMode="url" />
            <a
              href="https://www.google.com/maps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline"
            >
              <MapPin className="h-3 w-3" /> {t("openMaps", lang)}
            </a>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("hourlyWage", lang)} *</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-12" value={wage} onChange={(e) => setWage(e.target.value)} required />
        </div>
        {wageNum > 0 && (
          <div className="text-sm text-muted-foreground">
            {t("totalPayment", lang)}: <span className="font-semibold">{totalPay.toFixed(2)}</span>
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("notes", lang)}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button className="w-full h-12 text-base" onClick={submit} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("submit", lang)}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReportsList({ lang, worker, onBack }: { lang: Lang; worker: Worker; onBack: () => void }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [clients, setClients] = useState<ClientLoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeFor, setChangeFor] = useState<Report | null>(null);
  const [changeText, setChangeText] = useState("");

  const load = async () => {
    setLoading(true);
    const [reportsRes, clientsRes] = await Promise.all([
      supabase
        .from("replacement_reports")
        .select("*")
        .eq("worker_id", worker.id)
        .order("work_date", { ascending: false }),
      (supabase.rpc("get_active_client_locations") as any),
    ]);
    setReports((reportsRes.data as Report[]) || []);
    const clientRows = (clientsRes.data || []) as { id: string; name: string; location_lat: number | null; location_lng: number | null }[];
    setClients(
      clientRows
        .filter((c) => c.location_lat != null && c.location_lng != null)
        .map((c) => ({ id: c.id, name: c.name, lat: Number(c.location_lat), lng: Number(c.location_lng) }))
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const likelyClientFor = (r: Report) => {
    let point: { lat: number; lng: number } | null = null;
    if (r.location_lat != null && r.location_lng != null) {
      point = { lat: Number(r.location_lat), lng: Number(r.location_lng) };
    } else if (r.maps_link) {
      point = parseCoordsFromUrl(r.maps_link);
    }
    if (!point || clients.length === 0) return null;
    return findNearestClient(point, clients);
  };

  const formatDistance = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  };

  const sendChange = async () => {
    if (!changeFor || !changeText.trim()) return;
    const { error } = await supabase.from("replacement_change_requests").insert({
      report_id: changeFor.id,
      worker_id: worker.id,
      description: changeText.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success(t("changeRequested", lang));
    setChangeFor(null);
    setChangeText("");
  };

  const statusColor: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    rejected: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    needs_clarification: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("myReports", lang)}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : reports.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">{t("noReports", lang)}</p>
        ) : (
          reports.map((r) => {
            const suggestion = likelyClientFor(r);
            return (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{r.work_date}</div>
                  <Badge variant="outline" className={statusColor[r.status]}>{t(r.status as any, lang)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {r.check_in} → {r.check_out} · {Number(r.total_hours).toFixed(2)}h
                </div>
                <div className="text-sm">{r.workplace_description}</div>
                {suggestion && (
                  <div className="text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-md px-2 py-1 inline-block">
                    {t("likelyClient", lang).replace("{client}", suggestion.client.name).replace("{distance}", formatDistance(suggestion.meters))}
                  </div>
                )}
                {r.workplace_address && <div className="text-xs text-muted-foreground">{r.workplace_address}</div>}
                {Number(r.total_payment) > 0 && (
                  <div className="text-sm font-medium">{t("totalPayment", lang)}: {Number(r.total_payment).toFixed(2)}</div>
                )}
                <Button variant="outline" size="sm" onClick={() => setChangeFor(r)}>
                  {t("requestChange", lang)}
                </Button>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={!!changeFor} onOpenChange={(o) => !o && setChangeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("requestChange", lang)}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={changeText}
            onChange={(e) => setChangeText(e.target.value)}
            placeholder={t("changeDescription", lang)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChangeFor(null)}>{t("cancel", lang)}</Button>
            <Button onClick={sendChange}>{t("send", lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
