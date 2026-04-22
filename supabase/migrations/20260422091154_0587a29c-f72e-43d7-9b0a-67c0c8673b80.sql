ALTER TABLE public.employees ALTER COLUMN meckano_synced SET DEFAULT true;
UPDATE public.employees SET meckano_synced = true WHERE meckano_synced = false;