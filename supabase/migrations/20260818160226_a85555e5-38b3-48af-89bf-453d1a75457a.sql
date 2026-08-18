drop view if exists public.v_batch_profitability;
create view public.v_batch_profitability
with (security_invoker = true) as
select
  b.id as batch_id,
  b.org_id,
  b.batch_code,
  b.species_id,
  sp.common_name as species_name,
  coalesce(m.total_material_cost, 0) as material_cost,
  coalesce(c.other_tagged_cost, 0) as other_tagged_cost,
  coalesce(m.total_material_cost, 0) + coalesce(c.other_tagged_cost, 0) as total_cost,
  coalesce(r.total_revenue, 0) as total_revenue,
  coalesce(r.total_revenue, 0) - coalesce(m.total_material_cost, 0) - coalesce(c.other_tagged_cost, 0) as net_margin
from public.batches b
left join public.species sp on sp.id = b.species_id
left join public.v_batch_material_cost m on m.batch_id = b.id
left join (
  select batch_id, sum(amount) as other_tagged_cost
  from public.costs where batch_id is not null and inventory_item_id is null group by batch_id
) c on c.batch_id = b.id
left join (
  select batch_id, sum(amount) as total_revenue from public.revenue where batch_id is not null group by batch_id
) r on r.batch_id = b.id;
grant select on public.v_batch_profitability to authenticated;