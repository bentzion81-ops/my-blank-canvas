ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS tax_withholding_pct numeric NOT NULL DEFAULT 0;