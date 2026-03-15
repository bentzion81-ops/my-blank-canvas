import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "success" | "warning" | "destructive" | "info" | "default";

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  className?: string;
}

const statusMap: Record<string, StatusType> = {
  active: "success",
  arrived: "success",
  paid: "success",
  ready: "success",
  sent: "info",
  partial: "warning",
  partially_paid: "warning",
  paused: "warning",
  late: "warning",
  draft: "default",
  "not reported": "destructive",
  overdue: "destructive",
  ended: "destructive",
  inactive: "destructive",
  missing: "destructive",
};

const typeStyles: Record<StatusType, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  default: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const resolvedType = type || statusMap[status.toLowerCase()] || "default";
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize font-medium text-[11px]",
        typeStyles[resolvedType],
        className
      )}
    >
      {status}
    </Badge>
  );
}
