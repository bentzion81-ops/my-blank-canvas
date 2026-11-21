export type ComparisonStatus = "reported" | "not_reported" | "not_linked";

export const comparisonStatusLabels: Record<ComparisonStatus, string> = {
  reported: "דיווח במקאנו",
  not_reported: "לא נמצא דיווח",
  not_linked: "ללא שיוך למקאנו",
};

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  passport_number: string | null;
  meckano_employee_id: string | null;
}
interface Attendance {
  employee_id: string;
  client_id: string | null;
  hours_worked: number | null;
}
interface Replacement {
  worker_id: string;
  worker_name: string;
  passport_number: string;
  assigned_client_id: string | null;
  assigned_custom_workplace: string | null;
  workplace_description: string;
  total_hours: number;
}
interface DailyRecord {
  employee_id: string;
  client_id: string | null;
  check_in: string | null;
  check_out: string | null;
}
interface RawEvent {
  employee_id: string | null;
  meckano_employee_id: string;
}
export interface ComparisonRow {
  employeeId: string;
  employeeName: string;
  clientKey: string;
  clientName: string;
  status: ComparisonStatus;
  linked: boolean;
  reportedClients: string;
}

// Use local Israel calendar days, including the offset on either side of DST changes.
export function israelDayRange(day: string): { from: string; to: string } {
  const start = new Date(`${day}T00:00:00Z`);
  const next = new Date(start.getTime() + 86400000);
  const midnight = (date: Date) => {
    let candidate = new Date(date.getTime() - 3 * 3600000);
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      }).formatToParts(candidate);
      const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
      const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
      const offset = local - candidate.getTime();
      candidate = new Date(date.getTime() - offset);
    }
    return candidate.toISOString();
  };
  return { from: midnight(start), to: midnight(next) };
}

export function buildAttendanceComparison(input: {
  employees: Employee[];
  clients: { id: string; name: string }[];
  attendance: Attendance[];
  replacements: Replacement[];
  dailyRecords: DailyRecord[];
  rawEvents: RawEvent[];
}): ComparisonRow[] {
  const employees = new Map(input.employees.map((employee) => [employee.id, employee]));
  const passports = new Map<string, Employee>();
  for (const employee of input.employees) {
    const passport = employee.passport_number?.trim();
    if (passport && !passports.has(passport)) passports.set(passport, employee);
  }
  const clients = new Map(input.clients.map((client) => [client.id, client.name]));
  const reportedIds = new Set(input.rawEvents.map((event) => event.employee_id).filter(Boolean));
  const reportedMeckanoIds = new Set(input.rawEvents.map((event) => event.meckano_employee_id));
  const reportedClients = new Map<string, Set<string>>();
  for (const record of input.dailyRecords) {
    if (!record.check_in && !record.check_out) continue;
    reportedIds.add(record.employee_id);
    const names = reportedClients.get(record.employee_id) ?? new Set<string>();
    names.add(clients.get(record.client_id ?? "") ?? "ללא שיוך ללקוח");
    reportedClients.set(record.employee_id, names);
  }
  const result = new Map<string, ComparisonRow>();
  const add = (id: string, name: string, clientId: string | null, custom?: string | null) => {
    if (name.trim() === "כללי כללי") return;
    const employee = employees.get(id);
    const meckanoId = employee?.meckano_employee_id?.trim();
    const reported = reportedIds.has(id) || Boolean(meckanoId && reportedMeckanoIds.has(meckanoId));
    const clientKey = clientId ?? `custom:${custom || "ללא שיוך ללקוח"}`;
    result.set(JSON.stringify([id, clientKey]), {
      employeeId: id,
      employeeName: name,
      clientKey,
      clientName: clients.get(clientId ?? "") ?? custom ?? "ללא שיוך ללקוח",
      status: reported ? "reported" : meckanoId ? "not_reported" : "not_linked",
      linked: Boolean(meckanoId),
      reportedClients: [...(reportedClients.get(id) ?? [])].sort().join(" | "),
    });
  };
  for (const record of input.attendance) {
    const employee = employees.get(record.employee_id);
    if (!employee || Number(record.hours_worked) <= 0) continue;
    add(employee.id, `${employee.first_name} ${employee.last_name}`.trim(), record.client_id);
  }
  for (const report of input.replacements) {
    if (Number(report.total_hours) <= 0) continue;
    const employee = passports.get(report.passport_number.trim());
    add(employee?.id ?? report.worker_id,
      employee ? `${employee.first_name} ${employee.last_name}`.trim() : report.worker_name,
      report.assigned_client_id, report.assigned_custom_workplace || report.workplace_description);
  }
  return [...result.values()].sort((a, b) =>
    a.clientName.localeCompare(b.clientName, "he") || a.employeeName.localeCompare(b.employeeName));
}

export function comparisonCsv(rows: ComparisonRow[], month: string, checkDate: string): string {
  const safe = (value: string) => {
    const text = /^[\s]*[=+@\-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const data = [
    ["לקוח בחודש הבסיס", "עובד", "חודש בסיס", "תאריך בדיקה", "סטטוס דיווח", "שיוך למקאנו", "לקוחות דיווח ביום הבדיקה"],
    ...rows.map((row) => [row.clientName, row.employeeName, month, checkDate,
      comparisonStatusLabels[row.status], row.linked ? "כן" : "לא", row.reportedClients]),
  ];
  return "\uFEFF" + data.map((row) => row.map(safe).join(",")).join("\r\n");
}