ALTER TABLE public.bags
  ADD COLUMN IF NOT EXISTS dry_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS spawn_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS inoculation_date date,
  ADD COLUMN IF NOT EXISTS notes text;