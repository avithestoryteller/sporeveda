alter table public.inventory_items drop constraint if exists inventory_items_org_id_name_key;
create unique index if not exists inventory_items_org_name_vendor_key
  on public.inventory_items (org_id, name, coalesce(vendor, ''));