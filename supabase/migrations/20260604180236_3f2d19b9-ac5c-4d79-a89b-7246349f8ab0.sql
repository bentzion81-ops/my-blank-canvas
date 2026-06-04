
CREATE OR REPLACE FUNCTION public.compute_attendance_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ci timestamptz;
  co timestamptz;
  diff_h numeric;
BEGIN
  ci := NEW.check_in;
  co := NEW.check_out;

  IF ci IS NOT NULL AND co IS NOT NULL THEN
    -- Same timestamp = single punch, leave 0
    IF co = ci THEN
      NEW.hours_worked := COALESCE(NEW.hours_worked, 0);
      RETURN NEW;
    END IF;

    -- Overnight: if check_out is before/equal check_in, push to next day
    IF co <= ci THEN
      co := co + INTERVAL '1 day';
      NEW.check_out := co;
    END IF;

    diff_h := EXTRACT(EPOCH FROM (co - ci)) / 3600.0;
    -- Sanity cap at 24h
    IF diff_h > 24 THEN diff_h := 24; END IF;
    NEW.hours_worked := ROUND(diff_h::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_attendance_hours ON public.attendance_records;
CREATE TRIGGER trg_compute_attendance_hours
BEFORE INSERT OR UPDATE OF check_in, check_out ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.compute_attendance_hours();

-- Backfill: records with both punches, different times, but hours = 0
UPDATE public.attendance_records
SET check_out = CASE WHEN check_out <= check_in THEN check_out + INTERVAL '1 day' ELSE check_out END
WHERE check_in IS NOT NULL AND check_out IS NOT NULL
  AND check_out <= check_in
  AND check_out <> check_in;

UPDATE public.attendance_records
SET hours_worked = ROUND(LEAST(EXTRACT(EPOCH FROM (check_out - check_in))/3600.0, 24)::numeric, 2)
WHERE check_in IS NOT NULL AND check_out IS NOT NULL
  AND check_out > check_in
  AND COALESCE(hours_worked,0) = 0;
