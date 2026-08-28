import { supabase } from "@/integrations/supabase/client";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Inserts an in-app notification for the org. Failures are non-fatal by design. */
export async function pushNotification(params: {
  orgId: string;
  title: string;
  body?: string | null;
  link?: string | null;
  kind?: string;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const { error } = await supabase.from("notifications").insert({
    org_id: params.orgId,
    kind: params.kind ?? "info",
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
  });
  if (error) console.warn("[notifications] insert failed", error.message);
}

export const NOTIFICATIONS_QUERY_KEY = "notifications";
