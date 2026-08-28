import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { OrgSetup } from "@/components/OrgSetup";
import { OrgProvider, membershipsQueryOptions, useOrgMembershipsQuery } from "@/hooks/use-org";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // Read the locally cached session first: getUser() hits the auth server on
    // every navigation, which added a network round-trip before each screen.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (session?.user) {
      // Warm the workspace query in parallel with route module loading so page
      // data isn't blocked behind a late membership round-trip.
      void context.queryClient.prefetchQuery(membershipsQueryOptions);
      return { user: session.user };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    void context.queryClient.prefetchQuery(membershipsQueryOptions);
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const memberships = useOrgMembershipsQuery();

  if (memberships.isPending && !memberships.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (memberships.error && !memberships.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-lg font-semibold">Couldn't load your workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">{memberships.error?.message}</p>
      </div>
    );
  }

  if (!memberships.data || memberships.data.length === 0) {
    return <OrgSetup />;
  }

  return (
    <OrgProvider memberships={memberships.data}>
      <AppShell />
    </OrgProvider>
  );
}
