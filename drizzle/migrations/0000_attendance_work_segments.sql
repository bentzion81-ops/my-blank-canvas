ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS work_segments jsonb;
COMMENT ON COLUMN public.attendance_records.work_segments IS 'Actual non-overlapping Meckano shift intervals; hours exclude gaps between shifts. NULL retains legacy single-shift calculation.';
CREATE OR REPLACE FUNCTION public.compute_attendance_hours()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE ci timestamptz; co timestamptz; diff_h numeric; segment jsonb; previous_end timestamptz;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.work_segments IS NOT DISTINCT FROM OLD.work_segments AND (NEW.check_in IS DISTINCT FROM OLD.check_in OR NEW.check_out IS DISTINCT FROM OLD.check_out) THEN NEW.work_segments := NULL; END IF;
 END IF;
 IF NEW.work_segments IS NOT NULL THEN
  IF jsonb_typeof(NEW.work_segments) <> 'array' OR jsonb_array_length(NEW.work_segments)=0 THEN RAISE EXCEPTION 'Work segments must be a non-empty array'; END IF;
  diff_h := 0;
  FOR segment IN SELECT value FROM jsonb_array_elements(NEW.work_segments) ORDER BY (value->>'check_in')::timestamptz LOOP
   ci := (segment->>'check_in')::timestamptz; co := (segment->>'check_out')::timestamptz;
   IF ci IS NULL OR co IS NULL OR co <= ci OR co-ci > interval '22 hours' THEN RAISE EXCEPTION 'Invalid work segment'; END IF;
   IF previous_end IS NOT NULL AND ci < previous_end THEN RAISE EXCEPTION 'Work segments overlap'; END IF;
   diff_h := diff_h + extract(epoch from (co-ci))/3600.0; previous_end := co;
  END LOOP;
  NEW.hours_worked := round(diff_h,2); RETURN NEW;
 END IF;
 ci:=NEW.check_in; co:=NEW.check_out;
 IF ci IS NOT NULL AND co IS NOT NULL THEN
  IF co=ci THEN NEW.hours_worked:=coalesce(NEW.hours_worked,0); RETURN NEW; END IF;
  IF co<=ci THEN co:=co+interval '1 day'; NEW.check_out:=co; END IF;
  diff_h:=extract(epoch from (co-ci))/3600.0;
  IF diff_h>24 THEN diff_h:=24; END IF;
  NEW.hours_worked:=round(diff_h,2);
 END IF;
 RETURN NEW;
END;
$function$;