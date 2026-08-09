CREATE TABLE public.costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  farm_id uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL,
  cost_type text NOT NULL DEFAULT 'one_time',
  recurrence_interval text,
  incurred_date date NOT NULL DEFAULT current_date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.costs TO authenticated;
GRANT ALL ON public.costs TO service_role;
ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "costs: members can view" ON public.costs FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));
CREATE POLICY "costs: non-viewers can insert" ON public.costs FOR INSERT TO authenticated
  WITH CHECK (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role,'member'::org_role]));
CREATE POLICY "costs: non-viewers can update" ON public.costs FOR UPDATE TO authenticated
  USING (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role,'member'::org_role]));
CREATE POLICY "costs: owners/admins can delete" ON public.costs FOR DELETE TO authenticated
  USING (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role]));

CREATE INDEX costs_org_date_idx ON public.costs (org_id, incurred_date);

CREATE TABLE public.revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  farm_id uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  species_id uuid REFERENCES public.species(id) ON DELETE SET NULL,
  sale_date date NOT NULL DEFAULT current_date,
  buyer text,
  quantity_kg numeric,
  price_per_kg numeric,
  amount numeric NOT NULL,
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue TO authenticated;
GRANT ALL ON public.revenue TO service_role;
ALTER TABLE public.revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue: members can view" ON public.revenue FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));
CREATE POLICY "revenue: non-viewers can insert" ON public.revenue FOR INSERT TO authenticated
  WITH CHECK (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role,'member'::org_role]));
CREATE POLICY "revenue: non-viewers can update" ON public.revenue FOR UPDATE TO authenticated
  USING (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role,'member'::org_role]));
CREATE POLICY "revenue: owners/admins can delete" ON public.revenue FOR DELETE TO authenticated
  USING (user_role_in_org(org_id) = ANY (ARRAY['owner'::org_role,'admin'::org_role]));

CREATE INDEX revenue_org_date_idx ON public.revenue (org_id, sale_date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER costs_set_updated_at BEFORE UPDATE ON public.costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER revenue_set_updated_at BEFORE UPDATE ON public.revenue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE VIEW public.v_monthly_financials
WITH (security_invoker = true) AS
WITH months AS (
  SELECT org_id, date_trunc('month', incurred_date)::date AS month, sum(amount) AS total_cost, 0::numeric AS total_revenue
  FROM public.costs GROUP BY 1,2
  UNION ALL
  SELECT org_id, date_trunc('month', sale_date)::date AS month, 0::numeric, sum(amount)
  FROM public.revenue GROUP BY 1,2
)
SELECT org_id, month, sum(total_cost) AS total_cost, sum(total_revenue) AS total_revenue,
       sum(total_revenue) - sum(total_cost) AS net_profit
FROM months GROUP BY org_id, month;

GRANT SELECT ON public.v_monthly_financials TO authenticated;
GRANT SELECT ON public.v_monthly_financials TO service_role;

CREATE VIEW public.v_cost_breakdown_by_category
WITH (security_invoker = true) AS
SELECT org_id, category, incurred_date, sum(amount) AS total_amount, count(*) AS entry_count
FROM public.costs GROUP BY org_id, category, incurred_date;

GRANT SELECT ON public.v_cost_breakdown_by_category TO authenticated;
GRANT SELECT ON public.v_cost_breakdown_by_category TO service_role;

CREATE VIEW public.v_cumulative_financials
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT org_id, incurred_date AS day, sum(amount) AS cost, 0::numeric AS revenue
  FROM public.costs GROUP BY 1,2
  UNION ALL
  SELECT org_id, sale_date AS day, 0::numeric, sum(amount)
  FROM public.revenue GROUP BY 1,2
), rolled AS (
  SELECT org_id, day, sum(cost) AS cost, sum(revenue) AS revenue
  FROM daily GROUP BY org_id, day
)
SELECT org_id, day,
  sum(cost) OVER (PARTITION BY org_id ORDER BY day) AS cumulative_cost,
  sum(revenue) OVER (PARTITION BY org_id ORDER BY day) AS cumulative_revenue,
  sum(revenue) OVER (PARTITION BY org_id ORDER BY day)
    - sum(cost) OVER (PARTITION BY org_id ORDER BY day) AS cumulative_net
FROM rolled;

GRANT SELECT ON public.v_cumulative_financials TO authenticated;
GRANT SELECT ON public.v_cumulative_financials TO service_role;

CREATE VIEW public.v_batch_profitability
WITH (security_invoker = true) AS
SELECT b.id AS batch_id, b.org_id, b.batch_code, s.common_name AS species_name,
  COALESCE(c.total_cost, 0) AS total_cost,
  COALESCE(r.total_revenue, 0) AS total_revenue,
  COALESCE(r.total_revenue, 0) - COALESCE(c.total_cost, 0) AS net_margin
FROM public.batches b
LEFT JOIN public.species s ON s.id = b.species_id
LEFT JOIN (SELECT batch_id, sum(amount) AS total_cost FROM public.costs WHERE batch_id IS NOT NULL GROUP BY batch_id) c ON c.batch_id = b.id
LEFT JOIN (SELECT batch_id, sum(amount) AS total_revenue FROM public.revenue WHERE batch_id IS NOT NULL GROUP BY batch_id) r ON r.batch_id = b.id
WHERE c.batch_id IS NOT NULL OR r.batch_id IS NOT NULL;

GRANT SELECT ON public.v_batch_profitability TO authenticated;
GRANT SELECT ON public.v_batch_profitability TO service_role;

DO $$
DECLARE target_user uuid; target_org uuid;
BEGIN
  SELECT id INTO target_user FROM auth.users WHERE lower(email) = 'avi.thestoryteller@gmail.com' LIMIT 1;
  SELECT id INTO target_org FROM public.organizations WHERE slug LIKE 'sporeveda%' LIMIT 1;
  IF target_user IS NOT NULL AND target_org IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.memberships WHERE org_id = target_org AND user_id = target_user) THEN
      UPDATE public.memberships SET role = 'owner'::org_role WHERE org_id = target_org AND user_id = target_user;
    ELSE
      INSERT INTO public.memberships (org_id, user_id, role) VALUES (target_org, target_user, 'owner'::org_role);
    END IF;
  END IF;
END $$;