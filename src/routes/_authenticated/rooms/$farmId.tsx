import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { RoomFormDialog } from "@/components/RoomFormDialog";
import { StatTile } from "@/components/StatTile";
import { DeltaBadge } from "@/components/DeltaBadge";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { STAGE_ORDER, STAGE_LABEL, STAGE_COLOR, type BagStage } from "@/lib/stages";
import { daysAgoISO, fmtDate, num, range, toNumber } from "@/lib/format";

type TargetRange = { name: string; min: number | null; max: number | null };


function TargetVsActual({
  label,
  unit,
  actual,
  ranges,
}: {
  label: string;
  unit: string;
  actual: number | null;
  ranges: TargetRange[];
}) {
  const bounds = ranges.flatMap((r) => [r.min, r.max]).filter((v): v is number => v !== null);
  if (actual !== null) bounds.push(actual);
  const lo = bounds.length ? Math.min(...bounds) : 0;
  const hi = bounds.length ? Math.max(...bounds) : 1;
  const padding = Math.max((hi - lo) * 0.35, 1);
  const scaleMin = lo - padding;
  const scaleMax = hi + padding;
  const pct = (value: number) =>
    Math.min(100, Math.max(0, ((value - scaleMin) / (scaleMax - scaleMin)) * 100));

  const fmtRange = (r: TargetRange) =>
    r.min === null && r.max === null ? "not set" : `${r.min ?? "≤"}–${r.max ?? ""}${unit}`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="stat-value text-xl">{actual === null ? "—" : `${num(actual)}${unit}`}</p>
      </div>

      <div className="relative mt-3 h-6 w-full">
        {ranges.map((r, index) => {
          const hasTarget = r.min !== null || r.max !== null;
          if (!hasTarget) return null;
          const bandLo = r.min ?? lo;
          const bandHi = r.max ?? hi;
          return (
            <div
              key={r.name}
              className={
                index === 0
                  ? "absolute top-0 h-2.5 rounded-full bg-primary/30"
                  : "absolute bottom-0 h-2.5 rounded-full bg-accent/40"
              }
              style={{ left: `${pct(bandLo)}%`, width: `${Math.max(2, pct(bandHi) - pct(bandLo))}%` }}
            />
          );
        })}
        {actual !== null ? (
          <div
            className="absolute inset-y-0 w-1 rounded-full bg-foreground"
            style={{ left: `calc(${pct(actual)}% - 2px)` }}
          />
        ) : null}
      </div>

      <div className="mt-2 space-y-1">
        {ranges.map((r, index) => (
          <div key={r.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className={
                  index === 0
                    ? "h-2 w-3 rounded-full bg-primary/30"
                    : "h-2 w-3 rounded-full bg-accent/40"
                }
              />
              {r.name} {fmtRange(r)}
            </span>
            <DeltaBadge actual={actual} min={r.min} max={r.max} unit={unit} />
          </div>
        ))}
      </div>
    </div>
  );
}

type TrendRow = Record<string, unknown> & { label: string };

function ClimateTrendChart({
  data,
  dataKey,
  rangeKey,
  name,
  unit,
  color,
  bands,
  average,
}: {
  data: TrendRow[];
  dataKey: string;
  rangeKey: string;
  name: string;
  unit: string;
  color: string;
  bands: TargetRange[];
  average: number | null;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          {bands.map((band, index) =>
            band.min !== null && band.max !== null ? (
              <ReferenceArea
                key={band.name}
                y1={band.min}
                y2={band.max}
                fill={index === 0 ? "var(--color-primary)" : "var(--color-accent)"}
                fillOpacity={0.08}
              />
            ) : null,
          )}
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={56}
            tickCount={6}
            domain={([min, max]: [number, number]) => {
              if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
              const pad = Math.max((max - min) * 0.1, 1);
              return [Math.floor(min - pad), Math.ceil(max + pad)];
            }}
            tickFormatter={(value: number) => `${Math.round(value * 10) / 10}${unit}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-card)",
              fontSize: 12,
            }}
          />
          <Area
            dataKey={rangeKey}
            name="Min–max"
            stroke="none"
            fill={color}
            fillOpacity={0.12}
            connectNulls
          />
          {average !== null ? (
            <ReferenceLine
              y={average}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
            />
          ) : null}
          <Line
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
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
        readings: (readings.data ?? []).map((row) => {
          const minTemp = toNumber(row.min_temp_c);
          const maxTemp = toNumber(row.max_temp_c);
          const minHum = toNumber(row.min_humidity_pct);
          const maxHum = toNumber(row.max_humidity_pct);
          return {
            date: row.reading_date,
            label: fmtDate(row.reading_date).slice(0, 6),
            temp: toNumber(row.avg_temp_c),
            humidity: toNumber(row.avg_humidity_pct),
            tempRange: minTemp !== null && maxTemp !== null ? [minTemp, maxTemp] : null,
            humidityRange: minHum !== null && maxHum !== null ? [minHum, maxHum] : null,
          };
        }),
        batches: batches.data ?? [],
        contamination: contamination.data ?? [],
      };
    },
  });
}

function FarmDetailPage() {
  const { farmId } = Route.useParams();
  const orgId = useOrgId();
  const { canEdit } = useOrg();
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

  const humMin =
    toNumber(farm.target_fruiting_humidity_min_pct) ?? toNumber(farm.target_humidity_min_pct);
  const humMax =
    toNumber(farm.target_fruiting_humidity_max_pct) ?? toNumber(farm.target_humidity_max_pct);

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

  const temps = readings.map((r) => r.temp).filter((v): v is number => v != null);
  const humidities = readings.map((r) => r.humidity).filter((v): v is number => v != null);
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const avgHumidity = humidities.length
    ? humidities.reduce((a, b) => a + b, 0) / humidities.length
    : null;

  return (
    <div>
      <PageHeader
        title={farm.name}
        subtitle={farm.location_notes ?? "Grow room"}
        action={
          <div className="flex items-center gap-2">
            {canEdit ? (
              <RoomFormDialog
                orgId={orgId}
                farm={farm}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="size-4" /> Edit room
                  </Button>
                }
              />
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link to="/log">Log a reading</Link>
            </Button>
          </div>
        }

      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
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
          hint={
            <span className="flex flex-wrap items-center gap-1">
              <DeltaBadge
                actual={latest?.temp ?? null}
                min={fruitMin}
                max={fruitMax}
                unit="°C"
                label="Fruiting"
              />
              {latest ? fmtDate(latest.date) : "No logs yet"}
            </span>
          }
        />
        <StatTile
          label="Avg temp (30d)"
          value={avgTemp !== null ? `${num(avgTemp)}°C` : "—"}
          hint={readings.length ? `${readings.length} readings` : "No logs yet"}
        />
        <StatTile
          label="Last avg humidity"
          value={latest ? `${num(latest.humidity)}%` : "—"}
          hint={
            <span className="flex flex-wrap items-center gap-1">
              <DeltaBadge
                actual={latest?.humidity ?? null}
                min={humMin}
                max={humMax}
                unit="%"
                label="Fruiting"
              />
              {latest ? fmtDate(latest.date) : "No logs yet"}
            </span>
          }
        />

        <StatTile
          label="Avg humidity (30d)"
          value={avgHumidity !== null ? `${num(avgHumidity)}%` : "—"}
          hint={readings.length ? `${readings.length} readings` : "No logs yet"}
        />
      </div>


      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">
              Actual climate trend — last 30 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {readings.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No environment readings logged in the last 30 days.
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Temperature (°C)
                  </p>
                  <ClimateTrendChart
                    data={readings}
                    dataKey="temp"
                    rangeKey="tempRange"
                    name="Avg temp °C"
                    unit="°C"
                    color="var(--color-primary)"
                    average={avgTemp}
                    bands={[
                      {
                        name: "Colonisation",
                        min: toNumber(farm.target_colonization_temp_min),
                        max: toNumber(farm.target_colonization_temp_max),
                      },
                      { name: "Fruiting", min: fruitMin, max: fruitMax },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Humidity (%)
                  </p>
                  <ClimateTrendChart
                    data={readings}
                    dataKey="humidity"
                    rangeKey="humidityRange"
                    name="Avg humidity %"
                    unit="%"
                    color="var(--color-accent)"
                    average={avgHumidity}
                    bands={[
                      {
                        name: "Colonisation",
                        min: toNumber(farm.target_colonization_humidity_min_pct),
                        max: toNumber(farm.target_colonization_humidity_max_pct),
                      },
                      { name: "Fruiting", min: humMin, max: humMax },
                    ]}
                  />
                </div>
              </div>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-4">
              <div>
                <dt>Colonization temp</dt>
                <dd className="text-foreground">
                  {range(farm.target_colonization_temp_min, farm.target_colonization_temp_max, "°C")}
                </dd>
              </div>
              <div>
                <dt>Colonization humidity</dt>
                <dd className="text-foreground">
                  {range(
                    farm.target_colonization_humidity_min_pct,
                    farm.target_colonization_humidity_max_pct,
                    "%",
                  )}
                </dd>
              </div>
              <div>
                <dt>Fruiting temp</dt>
                <dd className="text-foreground">
                  {range(farm.target_fruiting_temp_min, farm.target_fruiting_temp_max, "°C")}
                </dd>
              </div>
              <div>
                <dt>Fruiting humidity</dt>
                <dd className="text-foreground">
                  {range(
                    farm.target_fruiting_humidity_min_pct ?? farm.target_humidity_min_pct,
                    farm.target_fruiting_humidity_max_pct ?? farm.target_humidity_max_pct,
                    "%",
                  )}
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
              label="Temperature"
              unit="°C"
              actual={latest?.temp ?? null}
              ranges={[
                {
                  name: "Colonisation",
                  min: toNumber(farm.target_colonization_temp_min),
                  max: toNumber(farm.target_colonization_temp_max),
                },
                { name: "Fruiting", min: fruitMin, max: fruitMax },
              ]}
            />
            <TargetVsActual
              label="Humidity"
              unit="%"
              actual={latest?.humidity ?? null}
              ranges={[
                {
                  name: "Colonisation",
                  min: toNumber(farm.target_colonization_humidity_min_pct),
                  max: toNumber(farm.target_colonization_humidity_max_pct),
                },
                { name: "Fruiting", min: humMin, max: humMax },
              ]}
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
