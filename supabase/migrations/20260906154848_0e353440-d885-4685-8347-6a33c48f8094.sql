ALTER TABLE public.cash_flow_installments
  ADD COLUMN IF NOT EXISTS paid_amount numeric,
  ADD COLUMN IF NOT EXISTS direction text;

CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_installments_item_month_uniq
  ON public.cash_flow_installments (item_id, due_month);