import { describe, expect, it } from "vitest";
import { buildAttendanceComparison, comparisonCsv, israelDayRange } from "@/lib/attendance-comparison";

const input = {
  employees: [
    { id: "a", first_name: "Linked", last_name: "Worker", passport_number: "P1", meckano_employee_id: "101" },
    { id: "b", first_name: "Unlinked", last_name: "Worker", passport_number: null, meckano_employee_id: null },
  ],
  clients: [{ id: "c", name: "Client" }, { id: "d", name: "Other client" }],
  attendance: [
    { employee_id: "a", client_id: "c", hours_worked: 10 },
    { employee_id: "b", client_id: "c", hours_worked: 3 },
  ],
  replacements: [], dailyRecords: [], rawEvents: [],
};

describe("Meckano reference-month comparison", () => {
  it("distinguishes no report from no Meckano linkage", () => {
    expect(buildAttendanceComparison(input).map((row) => row.status)).toEqual(["not_reported", "not_linked"]);
  });
  it("recognizes a raw report by Meckano ID even without a completed shift or internal ID", () => {
    const rows = buildAttendanceComparison({ ...input, rawEvents: [{ employee_id: null, meckano_employee_id: "101" }] });
    expect(rows[0].status).toBe("reported");
  });
  it("keeps October client grouping and identifies reporting at a different client", () => {
    const rows = buildAttendanceComparison({ ...input,
      dailyRecords: [{ employee_id: "a", client_id: "d", check_in: "2026-11-19T07:00:00Z", check_out: null }],
    });
    expect(rows[0].clientName).toBe("Client");
    expect(rows[0].reportedClients).toBe("Other client");
    expect(rows[0].status).toBe("reported");
  });
  it("deduplicates repeated days and replacement reports for the same employee and client", () => {
    const rows = buildAttendanceComparison({ ...input, attendance: [...input.attendance, input.attendance[0]],
      replacements: [{ worker_id: "external", worker_name: "Linked Worker", passport_number: " P1 ",
        assigned_client_id: "c", assigned_custom_workplace: null, workplace_description: "Client", total_hours: 3 }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.employeeId === "a")).toHaveLength(1);
  });
  it("uses Israel midnight boundaries for 19 November and summer dates", () => {
    expect(israelDayRange("2026-11-19")).toEqual({ from: "2026-11-18T22:00:00.000Z", to: "2026-11-19T22:00:00.000Z" });
    expect(israelDayRange("2026-08-19").from).toBe("2026-08-18T21:00:00.000Z");
  });
  it("retains the 25-hour Israel day when daylight saving time ends", () => {
    expect(israelDayRange("2026-10-25")).toEqual({
      from: "2026-10-24T21:00:00.000Z", to: "2026-10-25T22:00:00.000Z",
    });
  });
  it("exports both categories as different values and protects spreadsheet formula inputs", () => {
    const rows = buildAttendanceComparison(input);
    rows[0].clientName = '=HYPERLINK("x")';
    const csv = comparisonCsv(rows, "2026-10", "2026-11-19");
    expect(csv).toContain('"לא נמצא דיווח"');
    expect(csv).toContain('"ללא שיוך למקאנו"');
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});