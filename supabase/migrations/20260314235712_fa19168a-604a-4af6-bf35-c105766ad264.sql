
-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'manager', 'accountant', 'office_staff', 'viewer', 'custom');
CREATE TYPE public.employee_type AS ENUM ('permanent', 'temporary');
CREATE TYPE public.employee_status AS ENUM ('active', 'inactive');
CREATE TYPE public.client_type AS ENUM ('institution', 'business', 'factory', 'other');
CREATE TYPE public.client_status AS ENUM ('active', 'paused', 'ended');
CREATE TYPE public.contact_role AS ENUM ('owner', 'manager', 'supervisor', 'other');
CREATE TYPE public.attendance_source AS ENUM ('meckano', 'manual', 'corrected');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue');
CREATE TYPE public.payment_method AS ENUM ('cash', 'check', 'bank_transfer', 'credit_card', 'other');
CREATE TYPE public.payroll_status AS ENUM ('draft', 'ready', 'partially_paid', 'paid');
CREATE TYPE public.document_type AS ENUM ('passport', 'visa', 'contract', 'agreement', 'invoice', 'receipt', 'other');
CREATE TYPE public.notification_type AS ENUM ('missing_attendance', 'late_attendance', 'expiring_passport', 'expiring_visa', 'overdue_invoice', 'low_completion', 'payroll_anomaly', 'unprofitable_client');
CREATE TYPE public.billing_type AS ENUM ('fixed', 'hourly');
CREATE TYPE public.day_of_week AS ENUM ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- 1. PROFILES (linked to auth.users)
-- =============================================

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. USER ROLES (separate table per security rules)
-- =============================================

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$$;

-- =============================================
-- 3. PERMISSIONS
-- =============================================

CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT granted FROM public.permissions WHERE user_id = _user_id AND permission_key = _permission),
    public.is_admin_or_owner(_user_id)
  )
$$;

-- =============================================
-- 4. CLIENTS
-- =============================================

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_type client_type NOT NULL DEFAULT 'business',
  company_id TEXT,
  address TEXT,
  city TEXT,
  google_maps_link TEXT,
  billing_type billing_type NOT NULL DEFAULT 'fixed',
  monthly_payment NUMERIC(12,2) DEFAULT 0,
  hourly_rate NUMERIC(8,2) DEFAULT 0,
  daily_planned_hours NUMERIC(5,2) DEFAULT 0,
  include_friday BOOLEAN NOT NULL DEFAULT false,
  include_saturday BOOLEAN NOT NULL DEFAULT false,
  status client_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clients_status ON public.clients(status);
CREATE INDEX idx_clients_name ON public.clients(name);

-- =============================================
-- 5. CLIENT CONTACTS
-- =============================================

CREATE TABLE public.client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role contact_role NOT NULL DEFAULT 'other',
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_client_contacts_client ON public.client_contacts(client_id);

-- =============================================
-- 6. CLIENT WORKING DAYS
-- =============================================

CREATE TABLE public.client_working_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  day day_of_week NOT NULL,
  UNIQUE(client_id, day)
);

ALTER TABLE public.client_working_days ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 7. EMPLOYEES
-- =============================================

CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  israeli_phone TEXT,
  foreign_phone TEXT,
  citizenship TEXT,
  passport_number TEXT,
  passport_expiration DATE,
  visa_expiration DATE,
  photo_url TEXT,
  employee_type employee_type NOT NULL DEFAULT 'permanent',
  status employee_status NOT NULL DEFAULT 'active',
  target_monthly_hours NUMERIC(6,2) DEFAULT 0,
  hourly_wage NUMERIC(8,2) NOT NULL DEFAULT 0,
  transportation NUMERIC(8,2) DEFAULT 0,
  medical_insurance NUMERIC(8,2) DEFAULT 0,
  food NUMERIC(8,2) DEFAULT 0,
  other_expenses NUMERIC(8,2) DEFAULT 0,
  rent_deduction NUMERIC(8,2) DEFAULT 0,
  loan_deduction NUMERIC(8,2) DEFAULT 0,
  equipment_deduction NUMERIC(8,2) DEFAULT 0,
  other_deductions NUMERIC(8,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_employees_status ON public.employees(status);
CREATE INDEX idx_employees_name ON public.employees(last_name, first_name);
CREATE INDEX idx_employees_passport_exp ON public.employees(passport_expiration);
CREATE INDEX idx_employees_visa_exp ON public.employees(visa_expiration);

-- =============================================
-- 8. EMPLOYEE-CLIENT ASSIGNMENTS
-- =============================================

CREATE TABLE public.employee_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  custom_location TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_client_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_eca_employee ON public.employee_client_assignments(employee_id);
CREATE INDEX idx_eca_client ON public.employee_client_assignments(client_id);

-- =============================================
-- 9. WORK SCHEDULES
-- =============================================

CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  day_of_week day_of_week NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_schedules_employee ON public.work_schedules(employee_id);
CREATE INDEX idx_schedules_client ON public.work_schedules(client_id);

-- =============================================
-- 10. HOLIDAYS
-- =============================================

CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL UNIQUE,
  is_full_day BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_holidays_date ON public.holidays(date);

-- =============================================
-- 11. ATTENDANCE IMPORT BATCHES
-- =============================================

CREATE TABLE public.attendance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'meckano',
  imported_by UUID REFERENCES auth.users(id),
  file_name TEXT,
  record_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_import_batches ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 12. ATTENDANCE RECORDS
-- =============================================

CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  hours_worked NUMERIC(5,2) DEFAULT 0,
  source attendance_source NOT NULL DEFAULT 'manual',
  batch_id UUID REFERENCES public.attendance_import_batches(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_employee ON public.attendance_records(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance_records(date);
CREATE INDEX idx_attendance_client ON public.attendance_records(client_id);
CREATE INDEX idx_attendance_employee_date ON public.attendance_records(employee_id, date);

-- =============================================
-- 13. CLIENT MONTHLY METRICS
-- =============================================

CREATE TABLE public.client_monthly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  planned_hours NUMERIC(8,2) DEFAULT 0,
  actual_hours NUMERIC(8,2) DEFAULT 0,
  completion_pct NUMERIC(5,2) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  employee_cost NUMERIC(12,2) DEFAULT 0,
  profit NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, month)
);

ALTER TABLE public.client_monthly_metrics ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cmm_client_month ON public.client_monthly_metrics(client_id, month);

-- =============================================
-- 14. EMPLOYEE MONTHLY METRICS
-- =============================================

CREATE TABLE public.employee_monthly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  month DATE NOT NULL,
  target_hours NUMERIC(8,2) DEFAULT 0,
  actual_hours NUMERIC(8,2) DEFAULT 0,
  work_days INTEGER DEFAULT 0,
  completion_pct NUMERIC(5,2) DEFAULT 0,
  gross_salary NUMERIC(12,2) DEFAULT 0,
  employer_expenses NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  net_payment NUMERIC(12,2) DEFAULT 0,
  employer_cost NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, month)
);

ALTER TABLE public.employee_monthly_metrics ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_emm_employee_month ON public.employee_monthly_metrics(employee_id, month);

-- =============================================
-- 15. INVOICES
-- =============================================

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  month DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status invoice_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoices_client ON public.invoices(client_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_month ON public.invoices(month);

-- =============================================
-- 16. INVOICE PAYMENTS
-- =============================================

CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);

-- =============================================
-- 17. PAYROLL RUNS
-- =============================================

CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL UNIQUE,
  total_hours NUMERIC(10,2) DEFAULT 0,
  total_gross NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  total_employer_cost NUMERIC(12,2) DEFAULT 0,
  total_paid NUMERIC(12,2) DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMPTZ,
  status payroll_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 18. PAYROLL ITEMS
-- =============================================

CREATE TABLE public.payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  hours_worked NUMERIC(8,2) DEFAULT 0,
  hourly_wage NUMERIC(8,2) DEFAULT 0,
  gross_salary NUMERIC(12,2) DEFAULT 0,
  employer_expenses NUMERIC(12,2) DEFAULT 0,
  deductions NUMERIC(12,2) DEFAULT 0,
  net_payment NUMERIC(12,2) DEFAULT 0,
  employer_cost NUMERIC(12,2) DEFAULT 0,
  status payroll_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payroll_items_run ON public.payroll_items(payroll_run_id);
CREATE INDEX idx_payroll_items_employee ON public.payroll_items(employee_id);

-- =============================================
-- 19. PAYROLL ADJUSTMENTS
-- =============================================

CREATE TABLE public.payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id UUID NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payroll_adj_item ON public.payroll_adjustments(payroll_item_id);

-- =============================================
-- 20. PAYROLL PAYMENTS
-- =============================================

CREATE TABLE public.payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id UUID NOT NULL REFERENCES public.payroll_items(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method payment_method NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_payroll_payments_item ON public.payroll_payments(payroll_item_id);

-- =============================================
-- 21. DOCUMENTS
-- =============================================

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  document_type document_type NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  expiration_date DATE,
  uploaded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_documents_entity ON public.documents(entity_type, entity_id);
CREATE INDEX idx_documents_expiration ON public.documents(expiration_date);

-- =============================================
-- 22. NOTIFICATIONS
-- =============================================

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read);

-- =============================================
-- 23. AUDIT LOGS
-- =============================================

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);

-- =============================================
-- 24. CHANGE SNAPSHOTS (for undo/restore)
-- =============================================

CREATE TABLE public.change_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_log_id UUID REFERENCES public.audit_logs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.change_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_snapshots_entity ON public.change_snapshots(entity_type, entity_id);

-- =============================================
-- 25. SETTINGS
-- =============================================

CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 26. WHATSAPP MESSAGE LOGS
-- =============================================

CREATE TABLE public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_whatsapp_employee ON public.whatsapp_message_logs(employee_id);

-- =============================================
-- STORAGE BUCKET FOR DOCUMENTS
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- =============================================
-- TRIGGERS FOR updated_at
-- =============================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_permissions_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_contacts_updated_at BEFORE UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_eca_updated_at BEFORE UPDATE ON public.employee_client_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.work_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cmm_updated_at BEFORE UPDATE ON public.client_monthly_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_emm_updated_at BEFORE UPDATE ON public.employee_monthly_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payroll_items_updated_at BEFORE UPDATE ON public.payroll_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Auto-insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin_or_owner(auth.uid()));

-- Permissions
CREATE POLICY "Users can view own permissions" ON public.permissions FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins manage permissions" ON public.permissions FOR ALL TO authenticated USING (public.is_admin_or_owner(auth.uid()));

-- Business data tables - authenticated read, permission-gated write
CREATE POLICY "Auth read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Update clients" ON public.clients FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Delete clients" ON public.clients FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));

CREATE POLICY "Auth read client_contacts" ON public.client_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage client_contacts" ON public.client_contacts FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Update client_contacts" ON public.client_contacts FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Delete client_contacts" ON public.client_contacts FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));

CREATE POLICY "Auth read client_working_days" ON public.client_working_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage client_working_days" ON public.client_working_days FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Update client_working_days" ON public.client_working_days FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "Delete client_working_days" ON public.client_working_days FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));

CREATE POLICY "Auth read employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Update employees" ON public.employees FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Delete employees" ON public.employees FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));

CREATE POLICY "Auth read assignments" ON public.employee_client_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage assignments" ON public.employee_client_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Update assignments" ON public.employee_client_assignments FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Delete assignments" ON public.employee_client_assignments FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));

CREATE POLICY "Auth read schedules" ON public.work_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage schedules" ON public.work_schedules FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Update schedules" ON public.work_schedules FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Delete schedules" ON public.work_schedules FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));

CREATE POLICY "Auth read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage holidays" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Update holidays" ON public.holidays FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Delete holidays" ON public.holidays FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Auth read attendance_batches" ON public.attendance_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage attendance_batches" ON public.attendance_import_batches FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Update attendance_batches" ON public.attendance_import_batches FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Delete attendance_batches" ON public.attendance_import_batches FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Auth read attendance" ON public.attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage attendance" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Update attendance" ON public.attendance_records FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Delete attendance" ON public.attendance_records FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Auth read client_metrics" ON public.client_monthly_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage client_metrics" ON public.client_monthly_metrics FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Update client_metrics" ON public.client_monthly_metrics FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Delete client_metrics" ON public.client_monthly_metrics FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Auth read employee_metrics" ON public.employee_monthly_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage employee_metrics" ON public.employee_monthly_metrics FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Update employee_metrics" ON public.employee_monthly_metrics FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Delete employee_metrics" ON public.employee_monthly_metrics FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Auth read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_billing'));
CREATE POLICY "Update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_billing'));
CREATE POLICY "Delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_billing'));

CREATE POLICY "Auth read invoice_payments" ON public.invoice_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage invoice_payments" ON public.invoice_payments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'add_payments'));
CREATE POLICY "Delete invoice_payments" ON public.invoice_payments FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'add_payments'));

CREATE POLICY "Auth read payroll_runs" ON public.payroll_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll_runs" ON public.payroll_runs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Update payroll_runs" ON public.payroll_runs FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Delete payroll_runs" ON public.payroll_runs FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE POLICY "Auth read payroll_items" ON public.payroll_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll_items" ON public.payroll_items FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Update payroll_items" ON public.payroll_items FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Delete payroll_items" ON public.payroll_items FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE POLICY "Auth read payroll_adjustments" ON public.payroll_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll_adjustments" ON public.payroll_adjustments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Delete payroll_adjustments" ON public.payroll_adjustments FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE POLICY "Auth read payroll_payments" ON public.payroll_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll_payments" ON public.payroll_payments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Delete payroll_payments" ON public.payroll_payments FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE POLICY "Auth read documents" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents'));
CREATE POLICY "Update documents" ON public.documents FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents'));
CREATE POLICY "Delete documents" ON public.documents FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents'));

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Update notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete notifications" ON public.notifications FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins read audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins read snapshots" ON public.change_snapshots FOR SELECT TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Insert snapshots" ON public.change_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth read settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins update settings" ON public.settings FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "Admins delete settings" ON public.settings FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Auth read whatsapp_logs" ON public.whatsapp_message_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage whatsapp_logs" ON public.whatsapp_message_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_employees'));

-- Storage policies for documents bucket
CREATE POLICY "Auth view documents storage" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Auth upload documents storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents')));
CREATE POLICY "Auth update documents storage" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents')));
CREATE POLICY "Auth delete documents storage" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'upload_documents')));

-- =============================================
-- DEFAULT SETTINGS
-- =============================================

INSERT INTO public.settings (key, value, category) VALUES
  ('company_name', '"Service Company"', 'general'),
  ('currency', '"ILS"', 'general'),
  ('timezone', '"Asia/Jerusalem"', 'general'),
  ('invoice_numbering_prefix', '"INV-"', 'billing'),
  ('overtime_multiplier', '1.25', 'payroll'),
  ('auto_sync_frequency', '"daily"', 'attendance'),
  ('missing_attendance_alert', 'true', 'notifications'),
  ('late_attendance_alert', 'true', 'notifications'),
  ('expiring_document_alert_days', '30', 'notifications'),
  ('overdue_invoice_alert', 'true', 'notifications');
