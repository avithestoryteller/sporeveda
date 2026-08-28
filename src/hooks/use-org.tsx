import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export type OrgMembership = {
  org_id: string;
  role: OrgRole;
  name: string;
  slug: string;
};

type OrgContextValue = {
  org: OrgMembership | null;
  memberships: OrgMembership[];
  role: OrgRole | null;
  canEdit: boolean;
  isAdmin: boolean;
};

const OrgContext = createContext<OrgContextValue | null>(null);

const MEMBERSHIPS_CACHE_KEY = "sporeveda.memberships.v1";

function readCachedMemberships(): OrgMembership[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(MEMBERSHIPS_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OrgMembership[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedMemberships(rows: OrgMembership[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MEMBERSHIPS_CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota errors */
  }
}

export const membershipsQueryOptions = {
  queryKey: ["memberships"] as const,
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  queryFn: async (): Promise<OrgMembership[]> => {
    const { data, error } = await supabase
      .from("memberships")
      .select("org_id, role, organizations(name, slug)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []).map((row) => ({
      org_id: row.org_id,
      role: row.role,
      name: row.organizations?.name ?? "Organization",
      slug: row.organizations?.slug ?? "",
    }));
    writeCachedMemberships(rows);
    return rows;
  },
};

export function useOrgMembershipsQuery() {
  return useQuery({
    ...membershipsQueryOptions,
    // Render instantly from the last known workspace so page queries can fire
    // without waiting for the membership round-trip.
    initialData: readCachedMemberships(),
    initialDataUpdatedAt: 0,
  });
}

function _unusedLegacy() {
  return useQuery({
    queryKey: ["memberships-legacy"],
    enabled: false,
    queryFn: async (): Promise<OrgMembership[]> => {
      const { data, error } = await supabase
        .from("memberships")
        .select("org_id, role, organizations(name, slug)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        org_id: row.org_id,
        role: row.role,
        name: row.organizations?.name ?? "Organization",
        slug: row.organizations?.slug ?? "",
      }));
    },
  });
}

export function OrgProvider({
  memberships,
  children,
}: {
  memberships: OrgMembership[];
  children: ReactNode;
}) {
  const value = useMemo<OrgContextValue>(() => {
    const org = memberships[0] ?? null;
    const role = org?.role ?? null;
    return {
      org,
      memberships,
      role,
      canEdit: role === "owner" || role === "admin" || role === "member",
      isAdmin: role === "owner" || role === "admin",
    };
  }, [memberships]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) throw new Error("useOrg must be used inside OrgProvider");
  return context;
}

/** Convenience: the current org id, guaranteed non-null inside the app shell. */
export function useOrgId() {
  const { org } = useOrg();
  return org?.org_id ?? "";
}
