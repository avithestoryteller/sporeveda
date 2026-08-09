import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysAgoISO, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/compare")({
  head: () => ({
    meta: [
      { title: "Compare rooms — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Side-by-side yield, contamination and climate performance across grow rooms.",
      },
      { property: "og:title", content: "Compare rooms — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Side-by-side yield, contamination and climate performance across grow rooms.",
      },
    ],
  }),
  component: ComparePage,
});

function useComparison() {
  return useQuery({
    queryKey: ["compare"],
    queryFn: async () => {
      const since = daysAgoISO(90);
      const [farms, bags, batches, harvests, contamination, readings] = await Promise.all([
        supabase.from("farms").select("id, name, is_active").order("name"),
        supabase.from("bags").select("id, farm_id, current_stage"),
        supabase.from("batches").select("id, farm_id, dry_substrate_weight_kg"),
        supabase.from("harvests").select("wet_weight_g, bag_id, bags!inner(farm_id)"),
        supabase.from("contamination_events").select("bag_id, bags!inner(farm_id)"),
        supabase
          .from("environment_readings")
          .select("farm_id, avg_temp_c, avg_humidity_pct, reading_date")
          .gte("reading_date", since),
      ]);
      const error =
        farms.error ??
        bags.error ??
        batches.error ??
        harvests.error ??
        contamination.error ??
        readings.error;
      if (error) throw error;

      return (farms.data ?? []).map((farm) => {
        const farmBags = (bags.data ?? []).filter((bag) => bag.farm_id === farm.id);
        const farmBagIds = new Set(farmBags.map((bag) => bag.id));
        const farmHarvests = (harvests.data ?? []).filter((row) => farmBagIds.has(row.bag_id));
        const totalWetG = farmHarvests.reduce(
          (sum, row) => sum + (toNumber(row.wet_weight_g) ?? 0),
          0,
        );
        const dryKg = (batches.data ?? [])
          .filter((batch) => batch.farm_id === farm.id)
          .reduce((sum, batch) => sum + (toNumber(batch.dry_substrate_weight_kg) ?? 0), 0);
        const contaminated = new Set(
          (contamination.data ?? [])
            .filter((row) => farmBagIds.has(row.bag_id))
            .map((row) => row.bag_id),
        ).size;
        const farmReadings = (readings.data ?? []).filter((row) => row.farm_id === farm.id);
        const avg = (values: (number | null)[]) => {
          const nums = values.filter((value): value is number => value !== null);
          if (nums.length === 0) return null;
          return nums.reduce((sum, value) => sum + value, 0) / nums.length;
        };

        return {
          id: farm.id,
          name: farm.name,
          isActive: farm.is_active,
          bags: farmBags.length,
          yieldKg: totalWetG / 1000,
          yieldPerBagG: farmBags.length ? totalWetG / farmBags.length : 0,
          efficiency: dryKg > 0 ? (totalWetG / (dryKg * 1000)) * 100 : null,
          contaminationRate: farmBags.length ? (contaminated / farmBags.length) * 100 : null,
          avgTemp: avg(farmReadings.map((row) => toNumber(row.avg_temp_c))),
          avgHumidity: avg(farmReadings.map((row) => toNumber(row.avg_humidity_pct))),
        };
      });
    },
  });
}

function ComparePage() {
  const { data, isPending, error } = useComparison();

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const chartData = data.map((farm) => ({
    name: farm.name,
    yieldPerBag: Number(farm.yieldPerBagG.toFixed(0)),
    contamination: Number((farm.contaminationRate ?? 0).toFixed(1)),
  }));

  return (
    <div>
      <PageHeader
        title="Compare rooms"
        subtitle="Yield per bag and contamination rate across every room, plus 90-day climate averages."
      />

      {data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Add rooms and batches to unlock comparisons.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Yield vs contamination</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} width={44} />
                    <YAxis
                      yAxisId="right"
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
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="left"
                      dataKey="yieldPerBag"
                      name="Yield per bag (g)"
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="contamination"
                      name="Contamination (%)"
                      fill="var(--color-destructive)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Room scorecard</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead className="text-right">Bags</TableHead>
                    <TableHead className="text-right">Yield (kg)</TableHead>
                    <TableHead className="text-right">Per bag (g)</TableHead>
                    <TableHead className="text-right">BE %</TableHead>
                    <TableHead className="text-right">Contam %</TableHead>
                    <TableHead className="text-right">Avg °C</TableHead>
                    <TableHead className="text-right">Avg RH %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((farm) => (
                    <TableRow key={farm.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/farms/$farmId"
                          params={{ farmId: farm.id }}
                          className="hover:underline"
                        >
                          {farm.name}
                        </Link>
                        {!farm.isActive ? (
                          <span className="ml-2 text-xs text-muted-foreground">inactive</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">{farm.bags}</TableCell>
                      <TableCell className="text-right">{farm.yieldKg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{farm.yieldPerBagG.toFixed(0)}</TableCell>
                      <TableCell className="text-right">
                        {farm.efficiency === null ? "—" : `${farm.efficiency.toFixed(1)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {farm.contaminationRate === null
                          ? "—"
                          : farm.contaminationRate.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {farm.avgTemp === null ? "—" : farm.avgTemp.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {farm.avgHumidity === null ? "—" : farm.avgHumidity.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
