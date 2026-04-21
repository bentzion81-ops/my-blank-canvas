DO $$
BEGIN
  -- attendance_absences
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_absences_employee_id_fkey') THEN
    DELETE FROM attendance_absences WHERE employee_id NOT IN (SELECT id FROM employees);
    ALTER TABLE attendance_absences
      ADD CONSTRAINT attendance_absences_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;

  -- attendance_records
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_employee_id_fkey') THEN
    DELETE FROM attendance_records WHERE employee_id NOT IN (SELECT id FROM employees);
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_client_id_fkey') THEN
    UPDATE attendance_records SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  -- employee_client_assignments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_client_assignments_employee_id_fkey') THEN
    DELETE FROM employee_client_assignments WHERE employee_id NOT IN (SELECT id FROM employees);
    ALTER TABLE employee_client_assignments
      ADD CONSTRAINT employee_client_assignments_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_client_assignments_client_id_fkey') THEN
    UPDATE employee_client_assignments SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
    ALTER TABLE employee_client_assignments
      ADD CONSTRAINT employee_client_assignments_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  -- work_schedules
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_employee_id_fkey') THEN
    DELETE FROM work_schedules WHERE employee_id NOT IN (SELECT id FROM employees);
    ALTER TABLE work_schedules
      ADD CONSTRAINT work_schedules_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_schedules_client_id_fkey') THEN
    UPDATE work_schedules SET client_id = NULL WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM clients);
    ALTER TABLE work_schedules
      ADD CONSTRAINT work_schedules_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;

  -- employee_expected_hours
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_expected_hours_employee_id_fkey') THEN
    DELETE FROM employee_expected_hours WHERE employee_id NOT IN (SELECT id FROM employees);
    ALTER TABLE employee_expected_hours
      ADD CONSTRAINT employee_expected_hours_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_absences_employee_id ON attendance_absences(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_id ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_client_id ON attendance_records(client_id);
CREATE INDEX IF NOT EXISTS idx_employee_client_assignments_employee_id ON employee_client_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_client_assignments_client_id ON employee_client_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_employee_id ON work_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_client_id ON work_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_employee_expected_hours_employee_id ON employee_expected_hours(employee_id);