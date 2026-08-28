import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { DeltaBadge } from "@/components/DeltaBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toNumber } from "@/lib/format";

type RangeKey = "7" | "14" | "30" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7d" },
  { key: "14", label: "14d" },
  { key: "30", label: "30d" },
  { key: "all", label: "Since start" },
];

function niceStep(rawStep: number) {
  const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1e-9))));
  const frac = rawStep / pow10;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow10;
}

function niceTicks(minValue: number, maxValue: number, targetCount = 5) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { domain: [0, 1] as [number, number], ticks: [0, 0.5, 1] };
  }
  if (minValue === maxValue) {
    return {
      domain: [minValue - 1, maxValue + 1] as [number, number],
      ticks: [minValue - 1, minValue, maxValue + 1],
    };
  }
  const span = maxValue - minValue;
  const pad = Math.max(span * 0.08, 0.5);
  let min = minValue - pad;
  let max = maxValue + pad;
  const step = niceStep((max - min) / targetCount);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return { domain: [min, max] as [number, number], ticks };
}

function TrendChart({
  data,
  dataKey,
  name,
  unit,
  color,
  target,
  average,
}: {
  data: { label: string; temp: number | null; humidity: number | null }[];
  dataKey: "temp" | "humidity";
  name: string;
  unit: string;
  color: string;
  target: number | null;
  average: number | null;
}) {
  const { domain, ticks } = useMemo(() => {
    const values: number[] = [];
    for (const row of data) {
      const value = row[dataKey];
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
    if (target !== null) values.push(target);
    if (average !== null) values.push(average);
    if (!values.length) return { domain: [0, 1] as [number, number], ticks: [0, 0.5, 1] };
    return niceTicks(Math.min(...values), Math.max(...values));
  }, [data, dataKey, target, average]);

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={80}
            domain={domain}
            ticks={ticks}
            tickFormatter={(value: number) => `${Math.round(value * 10) / 10}${unit}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-card)",
              fontSize: 12,
            }}
            formatter={(value: number) => [`${Math.round(value * 10) / 10}${unit}`, name]}
          />
          {target !== null ? (
            <ReferenceLine
              y={target}
              stroke="var(--color-primary)"
              strokeDasharray="6 4"
              label={{ value: "Target", position: "insideTopRight", fontSize: 10 }}
            />
          ) : null}
          {average !== null ? (
            <ReferenceLine y={average} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" />
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

export function BatchClimateCard({
  farmId,
  farmName,
  startDate,
  targetTemp,
  targetHumidity,
}: {
  farmId: string | null | undefined;
  farmName?: string | null;
  startDate?: string | null;
  targetTemp: number | null;
  targetHumidity: number | null;
}) {
  const [range, setRange] = useState<RangeKey>("30");

  const fromDate = useMemo(() => {
    if (range === "all") return startDate ?? null;
    const days = Number(range);
    const d = new Date();
    d.setDate(d.getDate() - days + 1);
    return d.toISOString().slice(0, 10);
  }, [range, startDate]);

  const { data, isPending } = useQuery({
    queryKey: ["batch-climate", farmId, fromDate],
    enabled: Boolean(farmId),
    queryFn: async () => {
      let query = supabase
        .from("environment_readings")
        .select("reading_date, avg_temp_c, avg_humidity_pct")
        .eq("farm_id", farmId!)
        .order("reading_date");
      if (fromDate) query = query.gte("reading_date", fromDate);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(
    () =>
      (data ?? []).map((row) => ({
        label: new Date(`${row.reading_date}T00:00:00`).toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
        }),
        temp: toNumber(row.avg_temp_c),
        humidity: toNumber(row.avg_humidity_pct),
      })),
    [data],
  );

  const avg = (key: "temp" | "humidity") => {
    const values = rows.map((row) => row[key]).filter((v): v is number => v != null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };
  const avgTemp = avg("temp");
  const avgHumidity = avg("humidity");

  const hasTargets = targetTemp !== null || targetHumidity !== null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="font-display text-base">Climate vs batch targets</CardTitle>
          <p className="text-xs text-muted-foreground">
            {farmName ? `Readings from ${farmName}` : "Room readings"}
            {range === "all" && startDate ? ` since ${startDate}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={range === option.key ? "default" : "outline"}
              onClick={() => setRange(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!hasTargets ? (
          <p className="text-xs text-muted-foreground">
            No climate targets set for this batch yet — edit the batch to add target average
            temperature and humidity.
          </p>
        ) : null}

        {isPending ? (
          <Skeleton className="h-52" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No readings logged in this range.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Avg temperature</span>
                  <span className="stat-value text-lg">
                    {avgTemp === null ? "—" : `${avgTemp.toFixed(1)}°C`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    target {targetTemp === null ? "—" : `${targetTemp}°C`}
                  </span>
                  <DeltaBadge actual={avgTemp} min={targetTemp} max={targetTemp} unit="°C" />
                </div>
                <TrendChart
                  data={rows}
                  dataKey="temp"
                  name="Avg temp"
                  unit="°C"
                  color="var(--color-primary)"
                  target={targetTemp}
                  average={avgTemp}
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Avg humidity</span>
                  <span className="stat-value text-lg">
                    {avgHumidity === null ? "—" : `${avgHumidity.toFixed(1)}%`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    target {targetHumidity === null ? "—" : `${targetHumidity}%`}
                  </span>
                  <DeltaBadge
                    actual={avgHumidity}
                    min={targetHumidity}
                    max={targetHumidity}
                    unit="%"
                  />
                </div>
                <TrendChart
                  data={rows}
                  dataKey="humidity"
                  name="Avg humidity"
                  unit="%"
                  color="var(--color-accent)"
                  target={targetHumidity}
                  average={avgHumidity}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Solid line: daily average · dashed primary line: batch target · dashed grey line:
              period average across {rows.length} day{rows.length === 1 ? "" : "s"}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
