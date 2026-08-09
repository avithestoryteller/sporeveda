import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { StageBadge } from "@/components/StageBadge";
import { StatTile } from "@/components/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { STAGE_ORDER, STAGE_LABEL, type BagStage } from "@/lib/stages";
import { daysAgoISO, fmtDate, num, range, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rooms/$farmId")({
  head: () => ({
    meta: [
      { title: "Room detail — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Climate history, bag population and contamination for a single grow room.",
      },
      { property: "og:title", content: "Room detail — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Climate history, bag population and contamination for a single grow room.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Room not found.</p>,
  component: FarmDetailPage,
});

function useFarmDetail(farmId: string) {
  return useQuery({
    queryKey: ["farm", farmId],
    queryFn: async () => {
      const since = daysAgoISO(30);
      const [farm, bags, readings, batches, contamination] = await Promise.all([
        supabase.from("farms").select("*").eq("id", farmId).maybeSingle(),
        supabase.from("bags").select("id, bag_code, current_stage, batch_id").eq("farm_id", farmId),
        supabase
          .from("environment_readings")
          .select("*")
          .eq("farm_id", farmId)
          .gte("reading_date", since)
          .order("reading_date"),
        supabase
          .from("batches")
          .select("id, batch_code, inoculation_date, substrate_type")
          .eq("farm_id", farmId)
          .order("inoculation_date", { ascending: false })
          .limit(10),
        supabase
          .from("contamination_events")
          .select("id, detected_at, severity, contaminant_type, bag_id, bags!inner(bag_code, farm_id)")
          .eq("bags.farm_id", farmId)
          .order("detected_at", { ascending: false })
          .limit(8),
      ]);

      const error =
        farm.error ?? bags.error ?? readings.error ?? batches.error ?? contamination.error;
      if (error) throw error;
      if (!farm.data) throw notFound();

      return {
        farm: farm.data,
        bags: bags.data ?? [],
        readings: (readings.data ?? []).map((row) => ({
          date: row.reading_date,
          label: fmtDate(row.reading_date).slice(0, 6),
          temp: toNumber(row.avg_temp_c),
          humidity: toNumber(row.avg_humidity_pct),
        })),
        batches: batches.data ?? [],
        contamination: contamination.data ?? [],
      };
    },
  });
}

function FarmDetailPage() {
  const { farmId } = Route.useParams();
  const { data, isPending, error } = useFarmDetail(farmId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const { farm, bags, readings, batches, contamination } = data;
  const activeBags = bags.filter(
    (bag) => bag.current_stage !== "harvested" && bag.current_stage !== "discarded",
  ).length;
  const discarded = bags.filter((bag) => bag.current_stage === "discarded").length;
  const latest = readings[readings.length - 1];

  const humMin = toNumber(farm.target_humidity_min_pct);
  const humMax = toNumber(farm.target_humidity_max_pct);
  const fruitMin = toNumber(farm.target_fruiting_temp_min);
  const fruitMax = toNumber(farm.target_fruiting_temp_max);

  return (
    <div>
      <PageHeader
        title={farm.name}
        subtitle={farm.location_notes ?? "Grow room"}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/log">Log a reading</Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Bags in room" value={bags.length} />
        <StatTile label="Active bags" value={activeBags} />
        <StatTile
          label="Discarded"
          value={discarded}
          tone={discarded > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Last reading"
          value={latest ? `${num(latest.temp)}°C` : "—"}
          hint={latest ? `${num(latest.humidity)}% RH · ${fmtDate(latest.date)}` : "No logs yet"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Climate — last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {readings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No environment readings logged in the last 30 days.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={readings} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    {fruitMin !== null && fruitMax !== null ? (
                      <ReferenceArea
                        y1={fruitMin}
                        y2={fruitMax}
                        yAxisId="temp"
                        fill="var(--color-primary)"
                        fillOpacity={0.08}
                      />
                    ) : null}
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="temp" tick={{ fontSize: 11 }} tickLine={false} width={38} />
                    <YAxis
                      yAxisId="hum"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      width={38}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-card)",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="temp"
                      name="Temp °C"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="hum"
                      type="monotone"
                      dataKey="humidity"
                      name="Humidity %"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <div>
                <dt>Colonization target</dt>
                <dd className="text-foreground">
                  {range(farm.target_colonization_temp_min, farm.target_colonization_temp_max, "°C")}
                </dd>
              </div>
              <div>
                <dt>Fruiting target</dt>
                <dd className="text-foreground">
                  {range(farm.target_fruiting_temp_min, farm.target_fruiting_temp_max, "°C")}
                </dd>
              </div>
              <div>
                <dt>Humidity target</dt>
                <dd className="text-foreground">
                  {humMin === null && humMax === null ? "Not set" : `${humMin ?? "≤"}–${humMax ?? ""}%`}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Bags by stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {STAGE_ORDER.map((stage) => {
              const count = bags.filter((bag) => bag.current_stage === stage).length;
              const pct = bags.length ? (count / bags.length) * 100 : 0;
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between text-sm">
                    <StageBadge stage={stage as BagStage} size="sm" />
                    <span className="stat-value">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {bags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bags assigned to this room.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Recent batches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {batches.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No batches in this room yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {batches.map((batch) => (
                  <li key={batch.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        to="/batches/$batchId"
                        params={{ batchId: batch.id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {batch.batch_code}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {batch.substrate_type ?? "Substrate not set"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(batch.inoculation_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Recent contamination</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {contamination.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">Nothing flagged. Clean room.</p>
            ) : (
              <ul className="divide-y divide-border">
                {contamination.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        to="/bags/$bagId"
                        params={{ bagId: event.bag_id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {(event.bags as { bag_code: string } | null)?.bag_code ?? "Bag"}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {event.severity}
                        {event.contaminant_type ? ` · ${event.contaminant_type}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(event.detected_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="sr-only">{STAGE_LABEL.prep}</p>
    </div>
  );
}
