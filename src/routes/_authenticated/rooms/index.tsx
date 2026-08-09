import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { RoomFormDialog } from "@/components/RoomFormDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { daysSince, range } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({
    meta: [
      { title: "Grow rooms — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "All grow rooms with their target temperature and humidity bands.",
      },
      { property: "og:title", content: "Grow rooms — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "All grow rooms with their target temperature and humidity bands.",
      },
    ],
  }),
  component: FarmsPage,
});

function useFarms(orgId: string) {
  return useQuery({
    queryKey: ["farms", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [farms, bags, readings] = await Promise.all([
        supabase.from("farms").select("*").order("name"),
        supabase.from("bags").select("id, farm_id, current_stage"),
        supabase
          .from("environment_readings")
          .select("farm_id, reading_date")
          .order("reading_date", { ascending: false }),
      ]);
      const error = farms.error ?? bags.error ?? readings.error;
      if (error) throw error;

      const lastLog = new Map<string, string>();
      for (const row of readings.data ?? []) {
        if (!lastLog.has(row.farm_id)) lastLog.set(row.farm_id, row.reading_date);
      }

      return (farms.data ?? []).map((farm) => {
        const farmBags = (bags.data ?? []).filter((bag) => bag.farm_id === farm.id);
        return {
          farm,
          totalBags: farmBags.length,
          activeBags: farmBags.filter(
            (bag) => bag.current_stage !== "harvested" && bag.current_stage !== "discarded",
          ).length,
          lastLog: lastLog.get(farm.id) ?? null,
        };
      });
    },
  });
}

function FarmsPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const { data, isPending, error } = useFarms(orgId);

  return (
    <div>
      <PageHeader
        title="Grow rooms"
        subtitle="Each room carries its own target climate and bag population."
        action={
          canEdit ? (
            <RoomFormDialog
              orgId={orgId}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> New room
                </Button>
              }
            />
          ) : null
        }
      />


      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No rooms yet. Add one to start assigning batches.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map(({ farm, totalBags, activeBags, lastLog }) => {
            const gap = daysSince(lastLog);
            return (
              <Card key={farm.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate font-display text-base">
                        <Link
                          to="/rooms/$farmId"
                          params={{ farmId: farm.id }}
                          className="hover:underline"
                        >
                          {farm.name}
                        </Link>
                      </CardTitle>
                      {farm.location_notes ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {farm.location_notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!farm.is_active ? (
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          Inactive
                        </span>
                      ) : null}
                      {canEdit ? (
                        <RoomFormDialog
                          orgId={orgId}
                          farm={farm}
                          trigger={
                            <Button size="icon" variant="ghost" aria-label={`Edit ${farm.name}`}>
                              <Pencil className="size-4" />
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                  </div>

                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Bags</p>
                      <p className="stat-value text-base">{totalBags}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="stat-value text-base">{activeBags}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last log</p>
                      <p className="stat-value text-base">
                        {gap === null ? "—" : gap === 0 ? "Today" : `${gap}d`}
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt>Colonization</dt>
                      <dd className="text-foreground">
                        {range(
                          farm.target_colonization_temp_min,
                          farm.target_colonization_temp_max,
                          "°C",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Fruiting</dt>
                      <dd className="text-foreground">
                        {range(farm.target_fruiting_temp_min, farm.target_fruiting_temp_max, "°C")}
                      </dd>
                    </div>
                    <div>
                      <dt>Humidity</dt>
                      <dd className="text-foreground">
                        {range(farm.target_humidity_min_pct, farm.target_humidity_max_pct, "%")}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
