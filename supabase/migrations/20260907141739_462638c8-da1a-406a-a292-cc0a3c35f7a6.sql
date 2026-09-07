CREATE OR REPLACE FUNCTION public.compute_replacement_report_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  mins numeric;
BEGIN
  IF NEW.check_in IS NOT NULL AND NEW.check_out IS NOT NULL THEN
    mins := EXTRACT(EPOCH FROM (NEW.check_out - NEW.check_in)) / 60.0;
    IF mins < 0 THEN
      mins := mins + 1440;
    END IF;
    -- Only auto-fill when hours are missing/zero, so manual adjustments are preserved.
    IF NEW.total_hours IS NULL OR NEW.total_hours = 0 THEN
      NEW.total_hours := ROUND((mins / 60.0)::numeric, 2);
      IF NEW.hourly_wage IS NOT NULL THEN
        NEW.total_payment := ROUND((NEW.total_hours * NEW.hourly_wage)::numeric, 2);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_replacement_report_hours ON public.replacement_reports;
CREATE TRIGGER trg_compute_replacement_report_hours
BEFORE INSERT OR UPDATE ON public.replacement_reports
FOR EACH ROW EXECUTE FUNCTION public.compute_replacement_report_hours();