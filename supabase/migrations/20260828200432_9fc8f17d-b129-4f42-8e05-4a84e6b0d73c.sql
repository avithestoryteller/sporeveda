ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS target_avg_temp_c numeric,
  ADD COLUMN IF NOT EXISTS target_avg_humidity_pct numeric;