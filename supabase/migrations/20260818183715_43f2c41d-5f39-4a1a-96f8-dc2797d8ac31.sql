ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';
ALTER TABLE public.costs
  DROP CONSTRAINT IF EXISTS costs_status_check;
ALTER TABLE public.costs
  ADD CONSTRAINT costs_status_check CHECK (status IN ('ordered','in_transit','received','cancelled'));

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_stock';
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_status_check;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_status_check CHECK (status IN ('in_stock','on_order','depleted','discontinued'));

CREATE OR REPLACE VIEW public.v_inventory_stock
WITH (security_invoker = true) AS
SELECT i.id AS inventory_item_id,
    i.org_id,
    i.name,
    i.category,
    i.unit,
    i.reorder_threshold,
    COALESCE(p.total_purchased_qty, 0::numeric) AS total_purchased_qty,
    COALESCE(p.total_purchase_amount, 0::numeric) AS total_purchase_amount,
    CASE
        WHEN COALESCE(p.total_purchased_qty, 0::numeric) > 0::numeric THEN round(p.total_purchase_amount / p.total_purchased_qty, 2)
        ELSE NULL::numeric
    END AS avg_unit_cost,
    COALESCE(u.total_used_qty, 0::numeric) AS total_used_qty,
    COALESCE(p.total_purchased_qty, 0::numeric) - COALESCE(u.total_used_qty, 0::numeric) AS remaining_qty,
    (COALESCE(p.total_purchased_qty, 0::numeric) - COALESCE(u.total_used_qty, 0::numeric)) *
    CASE
        WHEN COALESCE(p.total_purchased_qty, 0::numeric) > 0::numeric THEN p.total_purchase_amount / p.total_purchased_qty
        ELSE 0::numeric
    END AS remaining_value,
    i.status AS item_status,
    COALESCE(inc.incoming_qty, 0::numeric) AS incoming_qty
   FROM inventory_items i
     LEFT JOIN ( SELECT costs.inventory_item_id,
            sum(costs.quantity_purchased) AS total_purchased_qty,
            sum(costs.amount) AS total_purchase_amount
           FROM costs
          WHERE costs.inventory_item_id IS NOT NULL AND costs.status = 'received'
          GROUP BY costs.inventory_item_id) p ON p.inventory_item_id = i.id
     LEFT JOIN ( SELECT costs.inventory_item_id,
            sum(costs.quantity_purchased) AS incoming_qty
           FROM costs
          WHERE costs.inventory_item_id IS NOT NULL AND costs.status IN ('ordered','in_transit')
          GROUP BY costs.inventory_item_id) inc ON inc.inventory_item_id = i.id
     LEFT JOIN ( SELECT inventory_usage.inventory_item_id,
            sum(inventory_usage.quantity_used) AS total_used_qty
           FROM inventory_usage
          GROUP BY inventory_usage.inventory_item_id) u ON u.inventory_item_id = i.id;
