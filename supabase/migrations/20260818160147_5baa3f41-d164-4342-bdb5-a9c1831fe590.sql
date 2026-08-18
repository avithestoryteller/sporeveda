create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null,
  unit text not null,
  reorder_threshold numeric(10,3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create index idx_inventory_items_org on public.inventory_items(org_id);
grant select, insert, update, delete on public.inventory_items to authenticated;
grant all on public.inventory_items to service_role;
alter table public.inventory_items enable row level security;
create policy "inventory_items: owners/admins can view" on public.inventory_items for select to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_items: owners/admins can insert" on public.inventory_items for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_items: owners/admins can update" on public.inventory_items for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_items: owners/admins can delete" on public.inventory_items for delete to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));
create trigger inventory_items_set_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();

create table public.inventory_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete set null,
  quantity_used numeric(10,3) not null,
  used_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_inventory_usage_org on public.inventory_usage(org_id);
create index idx_inventory_usage_item on public.inventory_usage(inventory_item_id);
create index idx_inventory_usage_batch on public.inventory_usage(batch_id);
grant select, insert, update, delete on public.inventory_usage to authenticated;
grant all on public.inventory_usage to service_role;
alter table public.inventory_usage enable row level security;
create policy "inventory_usage: owners/admins can view" on public.inventory_usage for select to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_usage: owners/admins can insert" on public.inventory_usage for insert to authenticated with check (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_usage: owners/admins can update" on public.inventory_usage for update to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));
create policy "inventory_usage: owners/admins can delete" on public.inventory_usage for delete to authenticated using (public.user_role_in_org(org_id) in ('owner','admin'));

alter table public.costs
  add column inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column quantity_purchased numeric(10,3);
create index idx_costs_inventory_item on public.costs(inventory_item_id);

create or replace view public.v_inventory_stock
with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.org_id,
  i.name,
  i.category,
  i.unit,
  i.reorder_threshold,
  coalesce(p.total_purchased_qty, 0) as total_purchased_qty,
  coalesce(p.total_purchase_amount, 0) as total_purchase_amount,
  case when coalesce(p.total_purchased_qty, 0) > 0
    then round(p.total_purchase_amount / p.total_purchased_qty, 2) else null end as avg_unit_cost,
  coalesce(u.total_used_qty, 0) as total_used_qty,
  coalesce(p.total_purchased_qty, 0) - coalesce(u.total_used_qty, 0) as remaining_qty,
  (coalesce(p.total_purchased_qty, 0) - coalesce(u.total_used_qty, 0))
    * case when coalesce(p.total_purchased_qty, 0) > 0
        then p.total_purchase_amount / p.total_purchased_qty else 0 end as remaining_value
from public.inventory_items i
left join (
  select inventory_item_id, sum(quantity_purchased) as total_purchased_qty, sum(amount) as total_purchase_amount
  from public.costs where inventory_item_id is not null group by inventory_item_id
) p on p.inventory_item_id = i.id
left join (
  select inventory_item_id, sum(quantity_used) as total_used_qty
  from public.inventory_usage group by inventory_item_id
) u on u.inventory_item_id = i.id;

create or replace view public.v_batch_material_cost
with (security_invoker = true) as
select
  b.id as batch_id,
  b.org_id,
  b.batch_code,
  sum(us.quantity_used * s.avg_unit_cost) filter (where s.category = 'spawn') as spawn_cost,
  sum(us.quantity_used * s.avg_unit_cost) filter (where s.category = 'substrate') as substrate_cost,
  sum(us.quantity_used * s.avg_unit_cost) as total_material_cost,
  (select count(*) from public.bags where bags.batch_id = b.id) as bag_count,
  round(sum(us.quantity_used * s.avg_unit_cost) / nullif((select count(*) from public.bags where bags.batch_id = b.id), 0), 2) as material_cost_per_bag
from public.batches b
join public.inventory_usage us on us.batch_id = b.id
join public.v_inventory_stock s on s.inventory_item_id = us.inventory_item_id
group by b.id, b.org_id, b.batch_code;

drop view if exists public.v_batch_profitability;
create view public.v_batch_profitability
with (security_invoker = true) as
select
  b.id as batch_id,
  b.org_id,
  b.batch_code,
  b.species_id,
  coalesce(m.total_material_cost, 0) as material_cost,
  coalesce(c.other_tagged_cost, 0) as other_tagged_cost,
  coalesce(m.total_material_cost, 0) + coalesce(c.other_tagged_cost, 0) as total_cost,
  coalesce(r.total_revenue, 0) as total_revenue,
  coalesce(r.total_revenue, 0) - coalesce(m.total_material_cost, 0) - coalesce(c.other_tagged_cost, 0) as net_margin
from public.batches b
left join public.v_batch_material_cost m on m.batch_id = b.id
left join (
  select batch_id, sum(amount) as other_tagged_cost
  from public.costs where batch_id is not null and inventory_item_id is null group by batch_id
) c on c.batch_id = b.id
left join (
  select batch_id, sum(amount) as total_revenue from public.revenue where batch_id is not null group by batch_id
) r on r.batch_id = b.id;

grant select on public.v_inventory_stock to authenticated;
grant select on public.v_batch_material_cost to authenticated;
grant select on public.v_batch_profitability to authenticated;