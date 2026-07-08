
-- 1) Delete duplicate Meckano rows, keep the one with highest hours_worked (then latest updated_at)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY employee_id, date
           ORDER BY COALESCE(hours_worked,0) DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM attendance_records
  WHERE source = 'meckano'
)
DELETE FROM attendance_records
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Unique index preventing future duplicates per employee/date for Meckano source
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_meckano_emp_date_uniq
ON public.attendance_records (employee_id, date)
WHERE source = 'meckano';
