export type WorkSegment = { check_in: string; check_out: string };

type ShiftRow = {
  employee_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  hours_worked: number;
  notes: string | null;
  work_segments?: WorkSegment[] | null;
};

// Keep one daily row, but count every actual interval, never the gaps.
export function aggregateDailyShifts<T extends ShiftRow>(rows: T[]): Array<T & { work_segments: WorkSegment[] | null }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.employee_id}|${row.date}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => {
    group.sort((a, b) => a.check_in.localeCompare(b.check_in));
    const first = group[0];
    const segments: WorkSegment[] = [];
    for (const row of group) {
      if (!row.check_out || Date.parse(row.check_out) <= Date.parse(row.check_in)) continue;
      const previous = segments[segments.length - 1];
      if (previous && Date.parse(row.check_in) <= Date.parse(previous.check_out)) {
        if (Date.parse(row.check_out) > Date.parse(previous.check_out)) previous.check_out = row.check_out;
      } else {
        segments.push({ check_in: row.check_in, check_out: row.check_out });
      }
    }
    const hours = segments.reduce((total, s) => total + (Date.parse(s.check_out) - Date.parse(s.check_in)) / 3600000, 0);
    return {
      ...first,
      check_in: segments[0]?.check_in ?? first.check_in,
      check_out: segments[segments.length - 1]?.check_out ?? null,
      hours_worked: Number(hours.toFixed(2)),
      work_segments: segments.length ? segments : null,
      notes: group.some((row) => !row.check_out) ? "Missing check-out" : null,
    };
  });
}