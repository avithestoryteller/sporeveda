import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { StatTile } from "@/components/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { STAGE_ORDER, STAGE_LABEL, STAGE_COLOR, type BagStage } from "@/lib/stages";
import { daysAgoISO, fmtDate, num, range, toNumber } from "@/lib/format";

function TargetVsActual({
  label,
  unit,
  actual,
  min,
  max,
}: {
  label: string;
  unit: string;
  actual: number | null;
  min: number | null;
  max: number | null;
}) {
  const hasTarget = min !== null || max !== null;
  const status =
    actual === null || !hasTarget
      ? "unknown"
      : (min !== null && actual < min) || (max !== null && actual > max)
        ? "out"
        : "in";

  const lo = min ?? (actual !== null ? Math.min(actual, max ?? actual) : 0);
  const hi = max ?? (actual !== null ? Math.max(actual, min ?? actual) : 1);
  const padding = Math.max((hi - lo) * 0.6, 1);
  const scaleMin = lo - padding;
  const scaleMax = hi + padding;
  const pct = (value: number) =>
    Math.min(100, Math.max(0, ((value - scaleMin) / (scaleMax - scaleMin)) * 100));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span
          className={
            status === "out"
              ? "rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
              : status === "in"
                ? "rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
                : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          }
        >
          {status === "out" ? "Out of range" : status === "in" ? "In range" : "No data"}
        </span>
      </div>
      <p className="stat-value mt-1 text-xl">
        {actual === null ? "—" : `${num(actual)}${unit}`}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          target {min === null && max === null ? "not set" : `${min ?? "≤"}–${max ?? ""}${unit}`}
        </span>
      </p>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        {hasTarget ? (
          <div
            className="absolute inset-y-0 rounded-full bg-primary/25"
            style={{ left: `${pct(lo)}%`, width: `${Math.max(2, pct(hi) - pct(lo))}%` }}
          />
        ) : null}
        {actual !== null ? (
          <div
            className={
              status === "out"
                ? "absolute inset-y-0 w-1 rounded-full bg-destructive"
                : "absolute inset-y-0 w-1 rounded-full bg-foreground"
            }
            style={{ left: `calc(${pct(actual)}% - 2px)` }}
          />
        ) : null}
      </div>
    </div>
  );
}


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
    staleTime: 60_000,
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

  const batchLabel = new Map(batches.map((batch) => [batch.id, batch.batch_code]));
  const stackData = Array.from(
    bags.reduce((acc, bag) => {
      const key = batchLabel.get(bag.batch_id) ?? "Other";
      const row = acc.get(key) ?? { batch: key };
      const label = STAGE_LABEL[bag.current_stage as BagStage];
      row[label] = ((row[label] as number | undefined) ?? 0) + 1;
      acc.set(key, row);
      return acc;
    }, new Map<string, Record<string, string | number>>()),
  ).map(([, row]) => row);

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Bags in room" value={bags.length} />
        <StatTile label="Active bags" value={activeBags} />
        <StatTile
          label="Discarded"
          value={discarded}
          tone={discarded > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Last avg temp"
          value={latest ? `${num(latest.temp)}°C` : "—"}
          hint={latest ? fmtDate(latest.date) : "No logs yet"}
        />
        <StatTile
          label="Last avg humidity"
          value={latest ? `${num(latest.humidity)}%` : "—"}
          hint={latest ? fmtDate(latest.date) : "No logs yet"}
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
            <CardTitle className="font-display text-base">Target vs actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TargetVsActual
              label="Temperature (fruiting target)"
              unit="°C"
              actual={latest?.temp ?? null}
              min={fruitMin}
              max={fruitMax}
            />
            <TargetVsActual
              label="Humidity"
              unit="%"
              actual={latest?.humidity ?? null}
              min={humMin}
              max={humMax}
            />
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {latest ? `Latest reading ${fmtDate(latest.date)}` : "No readings logged yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base">Bags per batch by stage</CardTitle>
        </CardHeader>
        <CardContent>
          {stackData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No bags assigned to this room.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="batch" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} width={38} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {STAGE_ORDER.map((stage, index) => (
                    <Bar
                      key={stage}
                      dataKey={STAGE_LABEL[stage as BagStage]}
                      stackId="stages"
                      fill={STAGE_COLOR[stage as BagStage]}
                      radius={index === STAGE_ORDER.length - 1 ? [4, 4, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>



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
