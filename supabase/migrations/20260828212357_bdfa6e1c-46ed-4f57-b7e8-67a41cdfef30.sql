ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS substrate_vendor text,
  ADD COLUMN IF NOT EXISTS spawn_vendor text;