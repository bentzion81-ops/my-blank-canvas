# Architecture rules

- Meckano attendance retains one employee/date row with explicit work segments; sum non-overlapping intervals in both sync and the database trigger so additional shifts count without counting breaks.
- Attendance resync supports an optional internal employee ID and retains unmatched existing records; use scoped resyncs for individual corrections to avoid changing unrelated payroll data.