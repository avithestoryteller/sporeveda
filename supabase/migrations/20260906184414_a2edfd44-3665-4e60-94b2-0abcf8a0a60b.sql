ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS species_id uuid REFERENCES public.species(id);
ALTER TABLE public.revenue ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES public.inventory_items(id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_species ON public.inventory_items(species_id);
CREATE INDEX IF NOT EXISTS idx_revenue_inventory_item ON public.revenue(inventory_item_id);