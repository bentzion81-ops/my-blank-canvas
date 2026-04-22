import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Users, Link2, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  passport_number: string | null;
  israeli_phone: string | null;
  foreign_phone: string | null;
  meckano_employee_id: string | null;
  status: string;
  created_at: string;
  employee_client_assignments?: Array<{
    is_primary: boolean;
    end_date: string | null;
    clients: { name: string } | null;
  }>;
};

type ReplacementWorker = {
  id: string;
  full_name: string;
  passport_number: string;
  phone: string | null;
  is_active: boolean;
  replacement_reports?: Array<{
    work_date: string;
    clients: { name: string } | null;
    assigned_custom_workplace: string | null;
  }>;
};

type Source = "meckano" | "manual" | "replacement";

type Candidate = {
  id: string;
  source: Source;
  display_name: string;
  passport: string | null;
  phone: string | null;
  client_name: string | null;
  raw: Employee | ReplacementWorker;
};

type DuplicateGroup = {
  key: string;
  primary: Candidate;
  matches: Array<{
    candidate: Candidate;
    reasons: string[];
  }>;
};

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizePhone = (s: string | null) => {
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  return digits.slice(-9);
};

const normalizePassport = (s: string | null) => {
  if (!s) return "";
  return s.replace(/\s+/g, "").toUpperCase();
};

const employeeToCandidate = (e: Employee): Candidate => {
  const assignments = e.employee_client_assignments ?? [];
  const active = assignments.filter((a) => a.clients && !a.end_date);
  const primary = active.find((a) => a.is_primary) ?? active[0] ?? assignments.find((a) => a.clients);
  return {
    id: e.id,
    source: e.meckano_employee_id ? "meckano" : "manual",
    display_name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
    passport: e.passport_number,
    phone: e.israeli_phone || e.foreign_phone,
    client_name: primary?.clients?.name ?? null,
    raw: e,
  };
};

const workerToCandidate = (w: ReplacementWorker): Candidate => {
  const reports = w.replacement_reports ?? [];
  const sorted = [...reports].sort((a, b) => (b.work_date || "").localeCompare(a.work_date || ""));
  const last = sorted[0];
  const clientName = last?.clients?.name ?? last?.assigned_custom_workplace ?? null;
  return {
    id: w.id,
    source: "replacement",
    display_name: w.full_name,
    passport: w.passport_number,
    phone: w.phone,
    client_name: clientName,
    raw: w,
  };
};

const sourceLabel: Record<Source, string> = {
  meckano: "מקאנו",
  manual: "ידני",
  replacement: "מחליף",
};

const sourceBadgeClass: Record<Source, string> = {
  meckano: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  manual: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30",
  replacement: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

function findDuplicates(employees: Employee[], workers: ReplacementWorker[]): DuplicateGroup[] {
  const candidates: Candidate[] = [
    ...employees.map(employeeToCandidate),
    ...workers.filter((w) => w.is_active).map(workerToCandidate),
  ];

  const seen = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (seen.has(`${a.source}:${a.id}`)) continue;
    const matches: DuplicateGroup["matches"] = [];

    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (a.source === b.source && a.id === b.id) continue;

      const reasons: string[] = [];
      const nameA = normalizeName(a.display_name);
      const nameB = normalizeName(b.display_name);
      if (nameA && nameA === nameB) reasons.push("שם זהה");

      const passA = normalizePassport(a.passport);
      const passB = normalizePassport(b.passport);
      if (passA && passA === passB) reasons.push("מספר דרכון זהה");

      const phoneA = normalizePhone(a.phone);
      const phoneB = normalizePhone(b.phone);
      if (phoneA && phoneA.length >= 7 && phoneA === phoneB) reasons.push("מספר טלפון זהה");

      if (reasons.length > 0) {
        matches.push({ candidate: b, reasons });
        seen.add(`${b.source}:${b.id}`);
      }
    }

    if (matches.length > 0) {
      seen.add(`${a.source}:${a.id}`);
      groups.push({ key: `${a.source}:${a.id}`, primary: a, matches });
    }
  }

  return groups;
}

const DISMISS_KEY = "dismissed_duplicate_groups_v1";
const getDismissed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const persistDismissed = (s: Set<string>) =>
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]));

export function DuplicateEmployeesPanel() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed());
  const [merging, setMerging] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["dup-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id, first_name, last_name, passport_number, israeli_phone, foreign_phone, meckano_employee_id, status, created_at",
        );
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["dup-replacement-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_workers")
        .select("id, full_name, passport_number, phone, is_active");
      if (error) throw error;
      return (data ?? []) as ReplacementWorker[];
    },
  });

  const allGroups = useMemo(
    () => findDuplicates(employees, workers),
    [employees, workers],
  );
  const groups = useMemo(
    () => allGroups.filter((g) => !dismissed.has(g.key)),
    [allGroups, dismissed],
  );

  const dismissGroup = (key: string) => {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    persistDismissed(next);
    toast.success("ההצעה נדחתה");
  };

  const mergeWorkerIntoEmployee = async (workerId: string, employeeId: string) => {
    setMerging(workerId);
    try {
      const { error: e1 } = await supabase
        .from("replacement_workers")
        .update({
          is_active: false,
          notes: `מאוחד לעובד ${employeeId} בתאריך ${new Date().toISOString().slice(0, 10)}`,
        })
        .eq("id", workerId);
      if (e1) throw e1;
      toast.success("העובד המחליף אוחד לעובד הקיים");
      queryClient.invalidateQueries({ queryKey: ["dup-employees"] });
      queryClient.invalidateQueries({ queryKey: ["dup-replacement-workers"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "האיחוד נכשל");
    } finally {
      setMerging(null);
    }
  };

  const mergeEmployeeIntoEmployee = async (fromId: string, intoId: string) => {
    setMerging(fromId);
    try {
      const moves = [
        supabase.from("attendance_records").update({ employee_id: intoId }).eq("employee_id", fromId),
        supabase.from("attendance_absences").update({ employee_id: intoId }).eq("employee_id", fromId),
        supabase.from("employee_client_assignments").update({ employee_id: intoId }).eq("employee_id", fromId),
        supabase.from("employee_expected_hours").update({ employee_id: intoId }).eq("employee_id", fromId),
      ];
      const results = await Promise.all(moves);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;

      const { error: e2 } = await supabase
        .from("employees")
        .update({
          status: "inactive",
          notes: `מאוחד לעובד ${intoId} בתאריך ${new Date().toISOString().slice(0, 10)}`,
        })
        .eq("id", fromId);
      if (e2) throw e2;

      toast.success("העובדים אוחדו בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["dup-employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "האיחוד נכשל");
    } finally {
      setMerging(null);
    }
  };

  if (groups.length === 0) return null;

  return (
    <>
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-900 dark:text-amber-200">
          זוהו {groups.length} כפילויות אפשריות בעובדים
        </AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">
            המערכת מצאה עובדים שייתכן ומופיעים יותר מפעם אחת (מקאנו / ידני / מחליף) לפי שם, דרכון או טלפון.
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>
            סקור ואחד <ChevronRight className="h-4 w-4 mr-1" />
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> איחוד כפילויות עובדים
            </DialogTitle>
            <DialogDescription>
              עבור כל קבוצת התאמה, בחר את הרשומה הראשית. הרשומה השנייה תאוחד אליה.
              נתונים היסטוריים (נוכחות, שיבוצים) יועברו לרשומה שנשארת.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              {groups.map((group) => (
                <Card key={group.key} className="p-3 space-y-3">
                  <CandidateRow candidate={group.primary} primary />
                  {group.matches.map((m) => (
                    <div key={`${m.candidate.source}:${m.candidate.id}`} className="space-y-2">
                      <CandidateRow candidate={m.candidate} reasons={m.reasons} />
                      <div className="flex items-center gap-2 flex-wrap pr-4">
                        {m.candidate.source === "replacement" && group.primary.source !== "replacement" && (
                          <Button
                            size="sm"
                            disabled={merging === m.candidate.id}
                            onClick={() => mergeWorkerIntoEmployee(m.candidate.id, group.primary.id)}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                            אחד את המחליף לתוך עובד #{group.primary.display_name}
                          </Button>
                        )}
                        {group.primary.source === "replacement" && m.candidate.source !== "replacement" && (
                          <Button
                            size="sm"
                            disabled={merging === group.primary.id}
                            onClick={() => mergeWorkerIntoEmployee(group.primary.id, m.candidate.id)}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                            אחד את המחליף לתוך עובד #{m.candidate.display_name}
                          </Button>
                        )}
                        {group.primary.source !== "replacement" && m.candidate.source !== "replacement" && (
                          <>
                            <Button
                              size="sm"
                              disabled={merging === m.candidate.id}
                              onClick={() => mergeEmployeeIntoEmployee(m.candidate.id, group.primary.id)}
                            >
                              <Link2 className="h-3.5 w-3.5 mr-1" />
                              השאר את הראשון, אחד אליו את השני
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={merging === group.primary.id}
                              onClick={() => mergeEmployeeIntoEmployee(group.primary.id, m.candidate.id)}
                            >
                              השאר את השני
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => dismissGroup(group.key)}>
                      <X className="h-3.5 w-3.5 mr-1" /> זו לא כפילות
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CandidateRow({
  candidate,
  reasons,
  primary,
}: {
  candidate: Candidate;
  reasons?: string[];
  primary?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-md p-2 ${primary ? "bg-muted/50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{candidate.display_name || "—"}</span>
          <Badge variant="outline" className={sourceBadgeClass[candidate.source]}>
            {sourceLabel[candidate.source]}
          </Badge>
          {primary && <Badge variant="secondary">ראשי</Badge>}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {candidate.passport && <span>דרכון: {candidate.passport}</span>}
          {candidate.phone && <span>טלפון: {candidate.phone}</span>}
        </div>
        {reasons && reasons.length > 0 && (
          <div className="mt-1 flex gap-1 flex-wrap">
            {reasons.map((r) => (
              <Badge key={r} variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">
                {r}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
