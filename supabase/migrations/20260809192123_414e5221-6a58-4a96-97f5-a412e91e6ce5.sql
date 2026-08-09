ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS target_colonization_humidity_min_pct numeric,
  ADD COLUMN IF NOT EXISTS target_colonization_humidity_max_pct numeric,
  ADD COLUMN IF NOT EXISTS target_fruiting_humidity_min_pct numeric,
  ADD COLUMN IF NOT EXISTS target_fruiting_humidity_max_pct numeric;

UPDATE public.farms
SET target_fruiting_humidity_min_pct = COALESCE(target_fruiting_humidity_min_pct, target_humidity_min_pct),
    target_fruiting_humidity_max_pct = COALESCE(target_fruiting_humidity_max_pct, target_humidity_max_pct);