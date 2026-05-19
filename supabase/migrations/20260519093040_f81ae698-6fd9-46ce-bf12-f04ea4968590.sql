CREATE OR REPLACE VIEW public.work_logs_unified AS
SELECT ar.id,
   'attendance'::text AS source_table,
   CASE WHEN ar.source::text = 'meckano'::text THEN 'meckano'::text ELSE 'manual'::text END AS source,
   ar.employee_id,
   (e.first_name || ' '::text) || e.last_name AS employee_name,
   COALESCE(ar.client_id, eca.client_id) AS client_id,
   COALESCE(c.name, c_eca.name, eca.custom_location) AS client_name,
   CASE WHEN ar.client_id IS NULL AND eca.client_id IS NULL THEN eca.custom_location ELSE NULL END AS custom_workplace,
   ar.date AS work_date,
   ar.check_in,
   ar.check_out,
   COALESCE(ar.hours_worked, 0::numeric) AS hours_worked,
   0::numeric AS payment_amount,
   'approved'::text AS status,
   ar.notes,
   NULL::uuid AS created_by,
   ar.created_at,
   ar.updated_at
FROM attendance_records ar
   LEFT JOIN employees e ON e.id = ar.employee_id
   LEFT JOIN clients c ON c.id = ar.client_id
   LEFT JOIN LATERAL (
     SELECT eca2.client_id, eca2.custom_location
     FROM employee_client_assignments eca2
     WHERE eca2.employee_id = ar.employee_id
       AND (eca2.start_date IS NULL OR eca2.start_date <= ar.date)
       AND (eca2.end_date IS NULL OR eca2.end_date >= ar.date)
     ORDER BY eca2.is_primary DESC, eca2.start_date DESC NULLS LAST
     LIMIT 1
   ) eca ON ar.client_id IS NULL
   LEFT JOIN clients c_eca ON c_eca.id = eca.client_id
UNION ALL
SELECT rr.id,
   'replacement_report'::text AS source_table,
   'worker_form'::text AS source,
   emp.id AS employee_id,
   COALESCE((emp.first_name || ' '::text) || emp.last_name, rr.worker_name) AS employee_name,
   rr.assigned_client_id AS client_id,
   c2.name AS client_name,
   COALESCE(rr.assigned_custom_workplace, rr.workplace_description) AS custom_workplace,
   rr.work_date,
   ((rr.work_date::text || ' '::text) || rr.check_in::text)::timestamp with time zone AS check_in,
   ((rr.work_date::text || ' '::text) || rr.check_out::text)::timestamp with time zone AS check_out,
   COALESCE(rr.total_hours, 0::numeric) AS hours_worked,
   COALESCE(rr.total_payment, 0::numeric) AS payment_amount,
   rr.status::text AS status,
   rr.notes,
   rr.approved_by AS created_by,
   rr.created_at,
   rr.updated_at
FROM replacement_reports rr
   LEFT JOIN clients c2 ON c2.id = rr.assigned_client_id
   LEFT JOIN employees emp ON emp.passport_number = rr.passport_number
UNION ALL
SELECT aa.id,
   'absence'::text AS source_table,
   'absence'::text AS source,
   aa.employee_id,
   (e3.first_name || ' '::text) || e3.last_name AS employee_name,
   NULL::uuid AS client_id,
   NULL::text AS client_name,
   NULL::text AS custom_workplace,
   aa.date AS work_date,
   NULL::timestamp with time zone AS check_in,
   NULL::timestamp with time zone AS check_out,
   0::numeric AS hours_worked,
   0::numeric AS payment_amount,
   aa.status::text AS status,
   aa.notes,
   aa.marked_by AS created_by,
   aa.created_at,
   aa.updated_at
FROM attendance_absences aa
   LEFT JOIN employees e3 ON e3.id = aa.employee_id;

ALTER VIEW public.work_logs_unified SET (security_invoker = true);
GRANT SELECT ON public.work_logs_unified TO authenticated;