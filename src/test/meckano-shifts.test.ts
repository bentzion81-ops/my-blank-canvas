import { describe, expect, it } from "vitest";
import { aggregateDailyShifts } from "../../supabase/functions/meckano-sync/shift-segments";

const shift = (check_in: string, check_out: string | null) => ({
  employee_id: "employee", date: "2026-10-05", check_in, check_out,
  hours_worked: 0, notes: null,
});

describe("Meckano daily shifts", () => {
  it("counts the second shift, excluding the break, for Kumara on October 5", () => {
    const [day] = aggregateDailyShifts([
      shift("2026-10-05T03:30:00Z", "2026-10-05T11:37:00Z"),
      shift("2026-10-05T14:04:00Z", "2026-10-05T17:08:00Z"),
    ]);
    expect(day.hours_worked).toBe(11.18);
    expect(day.work_segments).toHaveLength(2);
  });
  it("does not count repeated or overlapping intervals twice", () => {
    const [day] = aggregateDailyShifts([
      shift("2026-10-05T03:30:00Z", "2026-10-05T11:30:00Z"),
      shift("2026-10-05T03:30:00Z", "2026-10-05T11:30:00Z"),
      shift("2026-10-05T10:30:00Z", "2026-10-05T12:30:00Z"),
    ]);
    expect(day.hours_worked).toBe(9);
    expect(day.work_segments).toHaveLength(1);
  });
  it("keeps overnight shifts and excludes incomplete punches from hours", () => {
    const [day] = aggregateDailyShifts([
      shift("2026-10-05T20:00:00Z", "2026-10-06T00:00:00Z"),
      shift("2026-10-06T02:00:00Z", null),
    ]);
    expect(day.hours_worked).toBe(4);
    expect(day.notes).toBe("Missing check-out");
  });
});