import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export type AbsenceStatus = "no_show" | "replacement" | "no_work" | "vacation" | "sick";

export const ABSENCE_LABELS: Record<AbsenceStatus, string> = {
  no_show: "לא הגיע",
  replacement: "מחליף",
  no_work: "אין עבודה",
  vacation: "חופשה",
  sick: "מחלה",
};

export const ABSENCE_COLORS: Record<AbsenceStatus, string> = {
  no_show: "destructive",
  replacement: "warning",
  no_work: "secondary",
  vacation: "info",
  sick: "info",
};

interface AbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string; // yyyy-MM-dd
  onSaved?: () => void;
}

export const AbsenceDialog = ({ open, onOpenChange, employeeId, employeeName, date, onSaved }: AbsenceDialogProps) => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AbsenceStatus>("no_show");
  const [replacementName, setReplacementName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("attendance_absences" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .eq("date", date)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setExistingId(d.id);
          setStatus(d.status);
          setReplacementName(d.replacement_name || "");
          setNotes(d.notes || "");
        } else {
          setExistingId(null);
          setStatus("no_show");
          setReplacementName("");
          setNotes("");
        }
        setLoading(false);
      });
  }, [open, employeeId, date]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        employee_id: employeeId,
        date,
        status,
        replacement_name: status === "replacement" ? replacementName.trim() || null : null,
        notes: notes.trim() || null,
        marked_by: user?.id,
      };

      let error;
      if (existingId) {
        ({ error } = await supabase.from("attendance_absences" as any).update(payload).eq("id", existingId));
      } else {
        ({ error } = await supabase.from("attendance_absences" as any).insert(payload));
      }
      if (error) throw error;

      toast.success("נשמר בהצלחה");
      qc.invalidateQueries({ queryKey: ["attendance-range"] });
      qc.invalidateQueries({ queryKey: ["attendance-absences"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existingId) return;
    setSaving(true);
    const { error } = await supabase.from("attendance_absences" as any).delete().eq("id", existingId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("נמחק");
    qc.invalidateQueries({ queryKey: ["attendance-range"] });
    qc.invalidateQueries({ queryKey: ["attendance-absences"] });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>סימון חיסור — {employeeName}</DialogTitle>
          <p className="text-xs text-muted-foreground">{date}</p>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">סטטוס</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AbsenceStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ABSENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {status === "replacement" && (
              <div className="space-y-1.5">
                <Label className="text-xs">שם המחליף</Label>
                <Input value={replacementName} onChange={(e) => setReplacementName(e.target.value)} placeholder="שם מלא" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {existingId && (
            <Button variant="ghost" size="sm" onClick={remove} disabled={saving} className="text-destructive">
              מחק
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
          <Button size="sm" onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
