export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      attendance_import_batches: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          imported_by: string | null
          notes: string | null
          record_count: number | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          record_count?: number | null
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          record_count?: number | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          batch_id: string | null
          check_in: string | null
          check_out: string | null
          client_id: string | null
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          check_in?: string | null
          check_out?: string | null
          client_id?: string | null
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          check_in?: string | null
          check_out?: string | null
          client_id?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "attendance_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          field_changed: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      change_snapshots: {
        Row: {
          audit_log_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          snapshot_data: Json
        }
        Insert: {
          audit_log_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          snapshot_data: Json
        }
        Update: {
          audit_log_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          snapshot_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "change_snapshots_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_additional_charges: {
        Row: {
          client_id: string
          created_at: string
          id: string
          month: string
          name: string
          notes: string | null
          profit: number | null
          quantity: number
          total_charge: number | null
          total_cost: number | null
          unit_charge: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          month: string
          name: string
          notes?: string | null
          profit?: number | null
          quantity?: number
          total_charge?: number | null
          total_cost?: number | null
          unit_charge?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          month?: string
          name?: string
          notes?: string | null
          profit?: number | null
          quantity?: number
          total_charge?: number | null
          total_cost?: number | null
          unit_charge?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_additional_charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["contact_role"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["contact_role"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["contact_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_monthly_metrics: {
        Row: {
          actual_hours: number | null
          client_id: string
          completion_pct: number | null
          created_at: string
          employee_cost: number | null
          id: string
          month: string
          planned_hours: number | null
          profit: number | null
          revenue: number | null
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          client_id: string
          completion_pct?: number | null
          created_at?: string
          employee_cost?: number | null
          id?: string
          month: string
          planned_hours?: number | null
          profit?: number | null
          revenue?: number | null
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          client_id?: string
          completion_pct?: number | null
          created_at?: string
          employee_cost?: number | null
          id?: string
          month?: string
          planned_hours?: number | null
          profit?: number | null
          revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_monthly_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_working_days: {
        Row: {
          client_id: string
          day: Database["public"]["Enums"]["day_of_week"]
          id: string
        }
        Insert: {
          client_id: string
          day: Database["public"]["Enums"]["day_of_week"]
          id?: string
        }
        Update: {
          client_id?: string
          day?: Database["public"]["Enums"]["day_of_week"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_working_days_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_type: Database["public"]["Enums"]["billing_type"]
          city: string | null
          client_type: Database["public"]["Enums"]["client_type"]
          company_id: string | null
          created_at: string
          daily_planned_hours: number | null
          friday_hours: number | null
          google_maps_link: string | null
          hourly_rate: number | null
          id: string
          include_friday: boolean
          include_saturday: boolean
          monthly_payment: number | null
          name: string
          notes: string | null
          saturday_hours: number | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company_id?: string | null
          created_at?: string
          daily_planned_hours?: number | null
          friday_hours?: number | null
          google_maps_link?: string | null
          hourly_rate?: number | null
          id?: string
          include_friday?: boolean
          include_saturday?: boolean
          monthly_payment?: number | null
          name: string
          notes?: string | null
          saturday_hours?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          company_id?: string | null
          created_at?: string
          daily_planned_hours?: number | null
          friday_hours?: number | null
          google_maps_link?: string | null
          hourly_rate?: number | null
          id?: string
          include_friday?: boolean
          include_saturday?: boolean
          monthly_payment?: number | null
          name?: string
          notes?: string | null
          saturday_hours?: number | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          entity_id: string
          entity_type: string
          expiration_date: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          entity_id: string
          entity_type: string
          expiration_date?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          entity_id?: string
          entity_type?: string
          expiration_date?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      employee_client_assignments: {
        Row: {
          client_id: string | null
          created_at: string
          custom_location: string | null
          employee_id: string
          end_date: string | null
          id: string
          is_primary: boolean
          start_date: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          custom_location?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          start_date?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          custom_location?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_client_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_monthly_metrics: {
        Row: {
          actual_hours: number | null
          client_id: string | null
          completion_pct: number | null
          created_at: string
          deductions: number | null
          employee_id: string
          employer_cost: number | null
          employer_expenses: number | null
          gross_salary: number | null
          id: string
          month: string
          net_payment: number | null
          target_hours: number | null
          updated_at: string
          work_days: number | null
        }
        Insert: {
          actual_hours?: number | null
          client_id?: string | null
          completion_pct?: number | null
          created_at?: string
          deductions?: number | null
          employee_id: string
          employer_cost?: number | null
          employer_expenses?: number | null
          gross_salary?: number | null
          id?: string
          month: string
          net_payment?: number | null
          target_hours?: number | null
          updated_at?: string
          work_days?: number | null
        }
        Update: {
          actual_hours?: number | null
          client_id?: string | null
          completion_pct?: number | null
          created_at?: string
          deductions?: number | null
          employee_id?: string
          employer_cost?: number | null
          employer_expenses?: number | null
          gross_salary?: number | null
          id?: string
          month?: string
          net_payment?: number | null
          target_hours?: number | null
          updated_at?: string
          work_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_monthly_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_monthly_metrics_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          citizenship: string | null
          created_at: string
          employee_type: Database["public"]["Enums"]["employee_type"]
          equipment_deduction: number | null
          first_name: string
          food: number | null
          foreign_phone: string | null
          hourly_wage: number
          id: string
          israeli_phone: string | null
          last_name: string
          loan_deduction: number | null
          medical_insurance: number | null
          notes: string | null
          other_deductions: number | null
          other_expenses: number | null
          passport_expiration: string | null
          passport_number: string | null
          photo_url: string | null
          rent_deduction: number | null
          status: Database["public"]["Enums"]["employee_status"]
          target_monthly_hours: number | null
          transportation: number | null
          updated_at: string
          visa_expiration: string | null
        }
        Insert: {
          citizenship?: string | null
          created_at?: string
          employee_type?: Database["public"]["Enums"]["employee_type"]
          equipment_deduction?: number | null
          first_name: string
          food?: number | null
          foreign_phone?: string | null
          hourly_wage?: number
          id?: string
          israeli_phone?: string | null
          last_name: string
          loan_deduction?: number | null
          medical_insurance?: number | null
          notes?: string | null
          other_deductions?: number | null
          other_expenses?: number | null
          passport_expiration?: string | null
          passport_number?: string | null
          photo_url?: string | null
          rent_deduction?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          target_monthly_hours?: number | null
          transportation?: number | null
          updated_at?: string
          visa_expiration?: string | null
        }
        Update: {
          citizenship?: string | null
          created_at?: string
          employee_type?: Database["public"]["Enums"]["employee_type"]
          equipment_deduction?: number | null
          first_name?: string
          food?: number | null
          foreign_phone?: string | null
          hourly_wage?: number
          id?: string
          israeli_phone?: string | null
          last_name?: string
          loan_deduction?: number | null
          medical_insurance?: number | null
          notes?: string | null
          other_deductions?: number | null
          other_expenses?: number | null
          passport_expiration?: string | null
          passport_number?: string | null
          photo_url?: string | null
          rent_deduction?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          target_monthly_hours?: number | null
          transportation?: number | null
          updated_at?: string
          visa_expiration?: string | null
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_full_day: boolean
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_full_day?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_full_day?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          balance: number
          client_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          month: string
          notes: string | null
          paid_amount: number
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          balance?: number
          client_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          month: string
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          client_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          month?: string
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string | null
        }
        Relationships: []
      }
      payroll_adjustments: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          payroll_item_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          payroll_item_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          payroll_item_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_adjustments_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          client_id: string | null
          created_at: string
          deductions: number | null
          employee_id: string
          employer_cost: number | null
          employer_expenses: number | null
          gross_salary: number | null
          hourly_wage: number | null
          hours_worked: number | null
          id: string
          net_payment: number | null
          payroll_run_id: string
          status: Database["public"]["Enums"]["payroll_status"]
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deductions?: number | null
          employee_id: string
          employer_cost?: number | null
          employer_expenses?: number | null
          gross_salary?: number | null
          hourly_wage?: number | null
          hours_worked?: number | null
          id?: string
          net_payment?: number | null
          payroll_run_id: string
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deductions?: number | null
          employee_id?: string
          employer_cost?: number | null
          employer_expenses?: number | null
          gross_salary?: number | null
          hourly_wage?: number | null
          hours_worked?: number | null
          id?: string
          net_payment?: number | null
          payroll_run_id?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payroll_item_id: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payroll_item_id: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payroll_item_id?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          month: string
          notes: string | null
          status: Database["public"]["Enums"]["payroll_status"]
          total_deductions: number | null
          total_employer_cost: number | null
          total_gross: number | null
          total_hours: number | null
          total_paid: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          month: string
          notes?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number | null
          total_employer_cost?: number | null
          total_gross?: number | null
          total_hours?: number | null
          total_paid?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          month?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number | null
          total_employer_cost?: number | null
          total_gross?: number | null
          total_hours?: number | null
          total_paid?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          last_login: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_message_logs: {
        Row: {
          client_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          message: string
          phone_number: string
          sent_by: string | null
          status: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          message: string
          phone_number: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          message?: string
          phone_number?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          client_id: string | null
          created_at: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          employee_id: string
          end_time: string
          id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          employee_id: string
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          employee_id?: string
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "manager"
        | "accountant"
        | "office_staff"
        | "viewer"
        | "custom"
      attendance_source: "meckano" | "manual" | "corrected"
      billing_type: "fixed" | "hourly"
      client_status: "active" | "paused" | "ended"
      client_type: "institution" | "business" | "factory" | "other"
      contact_role: "owner" | "manager" | "supervisor" | "other"
      day_of_week:
        | "sunday"
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
      document_type:
        | "passport"
        | "visa"
        | "contract"
        | "agreement"
        | "invoice"
        | "receipt"
        | "other"
      employee_status: "active" | "inactive"
      employee_type: "permanent" | "temporary"
      invoice_status: "draft" | "sent" | "partial" | "paid" | "overdue"
      notification_type:
        | "missing_attendance"
        | "late_attendance"
        | "expiring_passport"
        | "expiring_visa"
        | "overdue_invoice"
        | "low_completion"
        | "payroll_anomaly"
        | "unprofitable_client"
      payment_method:
        | "cash"
        | "check"
        | "bank_transfer"
        | "credit_card"
        | "other"
      payroll_status: "draft" | "ready" | "partially_paid" | "paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "owner",
        "admin",
        "manager",
        "accountant",
        "office_staff",
        "viewer",
        "custom",
      ],
      attendance_source: ["meckano", "manual", "corrected"],
      billing_type: ["fixed", "hourly"],
      client_status: ["active", "paused", "ended"],
      client_type: ["institution", "business", "factory", "other"],
      contact_role: ["owner", "manager", "supervisor", "other"],
      day_of_week: [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ],
      document_type: [
        "passport",
        "visa",
        "contract",
        "agreement",
        "invoice",
        "receipt",
        "other",
      ],
      employee_status: ["active", "inactive"],
      employee_type: ["permanent", "temporary"],
      invoice_status: ["draft", "sent", "partial", "paid", "overdue"],
      notification_type: [
        "missing_attendance",
        "late_attendance",
        "expiring_passport",
        "expiring_visa",
        "overdue_invoice",
        "low_completion",
        "payroll_anomaly",
        "unprofitable_client",
      ],
      payment_method: [
        "cash",
        "check",
        "bank_transfer",
        "credit_card",
        "other",
      ],
      payroll_status: ["draft", "ready", "partially_paid", "paid"],
    },
  },
} as const
