ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS vendor text;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Members create org notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Members update org notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()))
  WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Members delete org notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX notifications_org_created_idx ON public.notifications (org_id, created_at DESC);