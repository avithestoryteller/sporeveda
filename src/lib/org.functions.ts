import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Creating an organization needs privileged access: the org row and the
 * caller's owner membership must be written together, and RLS (correctly)
 * refuses an insert from a user who is not yet a member of anything.
 */
export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
        displayName: z.string().trim().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "farm";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug })
      .select("id, name, slug")
      .single();

    if (error || !org) throw new Error(error?.message ?? "Could not create the organization");

    const { error: membershipError } = await supabaseAdmin
      .from("memberships")
      .insert({ org_id: org.id, user_id: context.userId, role: "owner" });

    if (membershipError) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      throw new Error(membershipError.message);
    }

    if (data.displayName) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: context.userId, display_name: data.displayName });
    }

    return org;
  });
