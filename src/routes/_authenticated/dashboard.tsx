import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Droplets, Sprout, Thermometer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { StageBadge } from "@/components/StageBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { STAGE_FLOW, STAGE_LABEL, type BagStage } from "@/lib/stages";
import { daysSince, fmtDateTime, num, startOfMonthISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Live view of bag stages, contamination rate and environment logging per room.",
      },
      { property: "og:title", content: "Dashboard — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Live view of bag stages, contamination rate and environment logging per room.",
      },
    ],
  }),
  component: DashboardPage,
});

type ActivityItem = {
  id: string;
  kind: "stage" | "harvest" | "contamination";
  at: string;
  bagId: string;
  bagCode: string;
  detail: string;
};

function useDashboardData(orgId: string) {
  return useQuery({
    queryKey: ["dashboard", orgId],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const monthStart = startOfMonthISO();


      const [farms, bags, contamination, readings, stageLog, harvests, contaminationFeed] =
        await Promise.all([
          supabase
            .from("farms")
            .select("id, name, is_active, location_notes")
            .eq("is_active", true)
            .order("name"),
          supabase.from("bags").select("farm_id, current_stage"),
          supabase
            .from("contamination_events")
            .select("bag_id, bags!inner(farm_id)")
            .gte("detected_at", monthStart),
          supabase
            .from("environment_readings")
            .select("farm_id, reading_date, avg_temp_c, avg_humidity_pct")
            .order("reading_date", { ascending: false })
            .limit(200),

          supabase
            .from("bag_stage_history")
            .select("id, stage, changed_at, bag_id, bags(bag_code)")
            .order("changed_at", { ascending: false })
            .limit(10),
          supabase
            .from("harvests")
            .select("id, created_at, flush_number, wet_weight_g, bag_id, bags(bag_code)")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("contamination_events")
            .select("id, created_at, severity, contaminant_type, bag_id, bags(bag_code)")
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

      const firstError =
        farms.error ??
        bags.error ??
        contamination.error ??
        readings.error ??
        stageLog.error ??
        harvests.error ??
        contaminationFeed.error;
      if (firstError) throw firstError;

      const activity: ActivityItem[] = [
        ...(stageLog.data ?? []).map((row) => ({
          id: `stage-${row.id}`,
          kind: "stage" as const,
          at: row.changed_at,
          bagId: row.bag_id,
          bagCode: row.bags?.bag_code ?? "Bag",
          detail: `moved to ${STAGE_LABEL[row.stage as BagStage]}`,
        })),
        ...(harvests.data ?? []).map((row) => ({
          id: `harvest-${row.id}`,
          kind: "harvest" as const,
          at: row.created_at,
          bagId: row.bag_id,
          bagCode: row.bags?.bag_code ?? "Bag",
          detail: `flush ${row.flush_number} harvested · ${num(row.wet_weight_g, 0)} g`,
        })),
        ...(contaminationFeed.data ?? []).map((row) => ({
          id: `contam-${row.id}`,
          kind: "contamination" as const,
          at: row.created_at,
          bagId: row.bag_id,
          bagCode: row.bags?.bag_code ?? "Bag",
          detail: `${row.severity} contamination${
            row.contaminant_type ? ` · ${row.contaminant_type}` : ""
          }`,
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10);

      const latestReadingByFarm = new Map<
        string,
        { date: string; temp: string | number | null; humidity: string | number | null }
      >();
      const avgByFarm = new Map<
        string,
        { temp: number | null; humidity: number | null }
      >();
      for (const farm of farms.data ?? []) {
        const farmReadings = (readings.data ?? []).filter((r) => r.farm_id === farm.id);
        const farmTemps = farmReadings
          .map((r) => r.avg_temp_c)
          .filter((v): v is number => v != null);
        const farmHumidities = farmReadings
          .map((r) => r.avg_humidity_pct)
          .filter((v): v is number => v != null);
        avgByFarm.set(farm.id, {
          temp: farmTemps.length
            ? farmTemps.reduce((a, b) => a + b, 0) / farmTemps.length
            : null,
          humidity: farmHumidities.length
            ? farmHumidities.reduce((a, b) => a + b, 0) / farmHumidities.length
            : null,
        });
      }
      for (const reading of readings.data ?? []) {
        if (!latestReadingByFarm.has(reading.farm_id)) {
          latestReadingByFarm.set(reading.farm_id, {
            date: reading.reading_date,
            temp: reading.avg_temp_c,
            humidity: reading.avg_humidity_pct,
          });
        }
      }

      const allTemps = (readings.data ?? [])
        .map((r) => r.avg_temp_c)
        .filter((v): v is number => v != null);
      const allHumidities = (readings.data ?? [])
        .map((r) => r.avg_humidity_pct)
        .filter((v): v is number => v != null);
      const overallAvgTemp = allTemps.length
        ? allTemps.reduce((a, b) => a + b, 0) / allTemps.length
        : null;
      const overallAvgHumidity = allHumidities.length
        ? allHumidities.reduce((a, b) => a + b, 0) / allHumidities.length
        : null;

      const contaminatedBagIdsByFarm = new Map<string, Set<string>>();
      for (const event of contamination.data ?? []) {
        const farmId = (event.bags as { farm_id: string } | null)?.farm_id;
        if (!farmId) continue;
        const set = contaminatedBagIdsByFarm.get(farmId) ?? new Set<string>();
        set.add(event.bag_id);
        contaminatedBagIdsByFarm.set(farmId, set);
      }

      const farmCards = (farms.data ?? []).map((farm) => {
        const farmBags = (bags.data ?? []).filter((bag) => bag.farm_id === farm.id);
        const stageCounts = STAGE_FLOW.reduce<Record<string, number>>((acc, stage) => {
          acc[stage] = farmBags.filter((bag) => bag.current_stage === stage).length;
          return acc;
        }, {});
        const discarded = farmBags.filter((bag) => bag.current_stage === "discarded").length;
        const contaminatedThisMonth = contaminatedBagIdsByFarm.get(farm.id)?.size ?? 0;
        const latest = latestReadingByFarm.get(farm.id);
        const averages = avgByFarm.get(farm.id);

        return {
          id: farm.id,
          name: farm.name,
          locationNotes: farm.location_notes,
          totalBags: farmBags.length,
          stageCounts,
          discarded,
          contaminatedThisMonth,
          contaminationRate: farmBags.length
            ? (contaminatedThisMonth / farmBags.length) * 100
            : null,
          daysSinceReading: latest ? daysSince(latest.date) : null,
          lastTemp: latest?.temp ?? null,
          lastHumidity: latest?.humidity ?? null,
          overallAvgTemp: averages?.temp ?? null,
          overallAvgHumidity: averages?.humidity ?? null,
        };
      });

      const totals = {
        farms: farmCards.length,
        activeBags: (bags.data ?? []).filter(
          (bag) => bag.current_stage !== "discarded" && bag.current_stage !== "harvested",
        ).length,
        contaminationThisMonth: new Set((contamination.data ?? []).map((row) => row.bag_id)).size,
        staleRooms: farmCards.filter(
          (farm) => farm.daysSinceReading === null || farm.daysSinceReading >= 2,
        ).length,
        overallAvgTemp,
        overallAvgHumidity,
      };

      return { farmCards, activity, totals };
    },
  });
}

function DashboardPage() {
  const orgId = useOrgId();
  const { data, isPending, error } = useDashboardData(orgId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-52" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  const { farmCards, activity, totals } = data;

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle="Room status, contamination and logging gaps at a glance."
        action={
          <Button asChild size="sm">
            <Link to="/log">Log environment</Link>
          </Button>
        }
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Active rooms"
          value={totals.farms}
          icon={<Sprout className="size-5" />}
        />
        <StatTile label="Bags in progress" value={totals.activeBags} />
        <StatTile
          label="Contaminated this month"
          value={totals.contaminationThisMonth}
          tone={totals.contaminationThisMonth > 0 ? "warning" : "default"}
          icon={<AlertTriangle className="size-5" />}
        />
        <StatTile
          label="Rooms needing a log"
          value={totals.staleRooms}
          tone={totals.staleRooms > 0 ? "destructive" : "success"}
          icon={<Thermometer className="size-5" />}
        />
        <StatTile
          label="Avg temp (all time)"
          value={
            <span className="flex items-center gap-1">
              {num(totals.overallAvgTemp)}
              <span className="text-sm font-normal text-muted-foreground">°C</span>
            </span>
          }
          icon={<Thermometer className="size-5" />}
        />
        <StatTile
          label="Avg humidity (all time)"
          value={
            <span className="flex items-center gap-1">
              {num(totals.overallAvgHumidity)}
              <span className="text-sm font-normal text-muted-foreground">%</span>
            </span>
          }
          icon={<Droplets className="size-5" />}
        />
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Rooms</h2>
      {farmCards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              No active rooms yet. Add your first grow room to start tracking batches.
            </p>
            <Button asChild size="sm">
              <Link to="/rooms">Add a room</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {farmCards.map((farm) => (
            <Card key={farm.id}>
              <CardHeader className="pb-3">
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
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {farm.totalBags} bags tracked
                    </p>
                  </div>
                  <span
                    className={
                      farm.daysSinceReading === null || farm.daysSinceReading >= 2
                        ? "rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive"
                        : "rounded-full bg-success/10 px-2 py-1 text-[11px] font-medium text-success"
                    }
                  >
                    {farm.daysSinceReading === null
                      ? "Never logged"
                      : farm.daysSinceReading === 0
                        ? "Logged today"
                        : `${farm.daysSinceReading}d since log`}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {STAGE_FLOW.map((stage) => {
                    const count = farm.stageCounts[stage] ?? 0;
                    if (!count) return null;
                    return (
                      <span key={stage} className="inline-flex items-center gap-1.5">
                        <StageBadge stage={stage} size="sm" />
                        <span className="stat-value text-sm">{count}</span>
                      </span>
                    );
                  })}
                  {farm.discarded > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <StageBadge stage="discarded" size="sm" />
                      <span className="stat-value text-sm">{farm.discarded}</span>
                    </span>
                  ) : null}
                  {farm.totalBags === 0 ? (
                    <span className="text-xs text-muted-foreground">No bags yet</span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Contamination (month)</p>
                    <p className="stat-value text-base">
                      {farm.contaminationRate === null
                        ? "—"
                        : `${farm.contaminationRate.toFixed(1)}%`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last avg temp</p>
                    <p className="stat-value flex items-center gap-1 text-base">
                      <Thermometer className="size-3.5 text-muted-foreground" />
                      {num(farm.lastTemp)}
                      <span className="text-xs font-normal text-muted-foreground">°C</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Overall avg temp</p>
                    <p className="stat-value flex items-center gap-1 text-base">
                      <Thermometer className="size-3.5 text-muted-foreground" />
                      {num(farm.overallAvgTemp)}
                      <span className="text-xs font-normal text-muted-foreground">°C</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last avg humidity</p>
                    <p className="stat-value flex items-center gap-1 text-base">
                      <Droplets className="size-3.5 text-muted-foreground" />
                      {num(farm.lastHumidity)}
                      <span className="text-xs font-normal text-muted-foreground">%</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Overall avg humidity</p>
                    <p className="stat-value flex items-center gap-1 text-base">
                      <Droplets className="size-3.5 text-muted-foreground" />
                      {num(farm.overallAvgHumidity)}
                      <span className="text-xs font-normal text-muted-foreground">%</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Recent activity</h2>
      <Card>
        <CardContent className="p-0">
          {activity.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={
                      item.kind === "contamination"
                        ? "size-2 shrink-0 rounded-full bg-destructive"
                        : item.kind === "harvest"
                          ? "size-2 shrink-0 rounded-full bg-accent"
                          : "size-2 shrink-0 rounded-full bg-primary"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <Link
                        to="/bags/$bagId"
                        params={{ bagId: item.bagId }}
                        className="font-medium hover:underline"
                      >
                        {item.bagCode}
                      </Link>{" "}
                      <span className="text-muted-foreground">{item.detail}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDateTime(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
