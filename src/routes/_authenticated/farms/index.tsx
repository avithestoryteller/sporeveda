import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Warehouse, Boxes, ClipboardList, MapPin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/StatTile";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/farms/")({
  head: () => ({
    meta: [
      { title: "Farms — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Every farm site you operate, with its grow rooms, bags and latest climate log.",
      },
      { property: "og:title", content: "Farms — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Every farm site you operate, with its grow rooms, bags and latest climate log.",
      },
    ],
  }),
  component: FarmsPage,
});

function FarmsPage() {
  const orgId = useOrgId();
  const { org } = useOrg();

  const query = useQuery({
    queryKey: ["farm-sites", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [rooms, bags, readings] = await Promise.all([
        supabase.from("farms").select("id, name, is_active, location_notes").order("name"),
        supabase.from("bags").select("id, current_stage"),
        supabase
          .from("environment_readings")
          .select("reading_date")
          .order("reading_date", { ascending: false })
          .limit(1),
      ]);
      const error = rooms.error ?? bags.error ?? readings.error;
      if (error) throw error;
      const bagRows = bags.data ?? [];
      return {
        rooms: rooms.data ?? [],
        totalBags: bagRows.length,
        activeBags: bagRows.filter(
          (bag) => bag.current_stage !== "harvested" && bag.current_stage !== "discarded",
        ).length,
        lastLog: readings.data?.[0]?.reading_date ?? null,
      };
    },
  });

  const farmName = "Farm 1";

  return (
    <div>
      <PageHeader
        title="Farms"
        subtitle="A farm is a physical site. Each farm holds one or more grow rooms."
      />

      {query.isPending ? (
        <Skeleton className="h-56" />
      ) : query.error ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="font-display text-base">{farmName}</CardTitle>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {org?.name ?? "Main site"}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  Active
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile
                  label="Grow rooms"
                  value={query.data.rooms.length}
                  icon={<Warehouse className="size-4" />}
                />
                <StatTile
                  label="Bags"
                  value={query.data.totalBags}
                  hint={`${query.data.activeBags} active`}
                  icon={<Boxes className="size-4" />}
                />
                <StatTile
                  label="Last climate log"
                  value={query.data.lastLog ? fmtDate(query.data.lastLog) : "—"}
                  icon={<ClipboardList className="size-4" />}
                />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rooms at this farm
                </p>
                {query.data.rooms.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No grow rooms yet — add one from the Grow Rooms page.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {query.data.rooms.map((room) => (
                      <li key={room.id}>
                        <Link
                          to="/rooms/$farmId"
                          params={{ farmId: room.id }}
                          className="inline-flex items-center rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
                        >
                          {room.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button asChild size="sm" variant="outline">
                <Link to="/rooms">Manage grow rooms</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
