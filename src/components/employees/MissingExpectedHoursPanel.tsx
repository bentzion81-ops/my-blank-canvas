import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, ChevronRight } from "lucide-react";

export const MissingExpectedHoursPanel = () => {
  const navigate = useNavigate();

  const { data: missing = [] } = useQuery({
    queryKey: ["employees-missing-expected-hours"],
    queryFn: async () => {
      const [{ data: employees, error: e1 }, { data: hours, error: e2 }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .order("first_name"),
        supabase.from("employee_expected_hours" as any).select("employee_id, is_working_day"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      // An employee is "configured" if they have ANY expected_hours rows saved.
      const configured = new Set<string>((hours as any[] | null ?? []).map((h: any) => h.employee_id));
      return (employees ?? []).filter((emp: any) => !configured.has(emp.id));
    },
  });

  if (missing.length === 0) return null;

  return (
    <Alert className="border-warning/40 bg-warning/5">
      <Clock className="h-4 w-4 text-warning" />
      <AlertTitle className="text-sm font-semibold">
        Missing expected working hours ({missing.length})
      </AlertTitle>
      <AlertDescription>
        <p className="text-xs text-muted-foreground mb-2">
          The following active employees don't have expected working hours configured. Without
          these, late check-in/out alerts cannot be triggered.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {missing.slice(0, 12).map((emp: any) => (
            <Button
              key={emp.id}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate(`/employees/${emp.id}`)}
            >
              {emp.first_name} {emp.last_name}
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          ))}
          {missing.length > 12 && (
            <span className="text-xs text-muted-foreground self-center">
              +{missing.length - 12} more
            </span>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};
