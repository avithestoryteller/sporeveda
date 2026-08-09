import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtDate, todayISO } from "@/lib/format";
import {
  type DateRangePreset,
  fmtMonth,
  fmtMoney,
  fmtSignedMoney,
  presetRange,
  titleCase,
} from "@/lib/money";

export const Route = createFileRoute("/_authenticated/finance/")({
  head: () => ({
    meta: [
      { title: "Financials — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Revenue, costs, break-even progress and batch profitability at a glance.",
      },
      { property: "og:title", content: "Financials — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Revenue, costs, break-even progress and batch profitability at a glance.",
      },
    ],
  }),
  component: FinanceDashboard,
});

const DONUT_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--chart-3, var(--secondary))",
  "var(--destructive)",
  "var(--muted-foreground)",
  "var(--sidebar-accent)",
];

function FinanceDashboard() {
  const orgId = useOrgId();
  const [preset, setPreset] = useState<DateRangePreset>("this_year");
  const [custom, setCustom] = useState({ from: presetRange("this_month").from, to: todayISO() });

  const range = preset === "custom" ? custom : presetRange(preset);

  const { data, isLoading, error } = useQuery({
    queryKey: ["financials", orgId, range.from, range.to],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    queryFn: async () => {
      const [monthly, cumulative, breakdown, batches] = await Promise.all([
        supabase
          .from("v_monthly_financials")
          .select("*")
          .eq("org_id", orgId)
          .order("month", { ascending: true }),
        supabase
          .from("v_cumulative_financials")
          .select("*")
          .eq("org_id", orgId)
          .order("day", { ascending: true }),
        supabase
          .from("v_cost_breakdown_by_category")
          .select("*")
          .eq("org_id", orgId)
          .gte("incurred_date", range.from)
          .lte("incurred_date", range.to),
        supabase.from("v_batch_profitability").select("*").eq("org_id", orgId),
      ]);
      if (monthly.error) throw monthly.error;
      if (cumulative.error) throw cumulative.error;
      if (breakdown.error) throw breakdown.error;
      if (batches.error) throw batches.error;
      return {
        monthly: monthly.data ?? [],
        cumulative: cumulative.data ?? [],
        breakdown: breakdown.data ?? [],
        batches: batches.data ?? [],
      };
    },
  });

  const view = useMemo(() => {
    if (!data) return null;
    const inRange = <T extends Record<string, unknown>>(rows: T[], key: keyof T) =>
      rows.filter((row) => {
        const value = String(row[key] ?? "").slice(0, 10);
        return value >= range.from && value <= range.to;
      });

    const monthly = inRange(data.monthly, "month" as never).map((row) => ({
      month: fmtMonth(String(row.month)),
      revenue: Number(row.total_revenue ?? 0),
      cost: Number(row.total_cost ?? 0),
      net: Number(row.net_profit ?? 0),
    }));

    const cumulative = inRange(data.cumulative, "day" as never).map((row) => ({
      day: String(row.day).slice(0, 10),
      revenue: Number(row.cumulative_revenue ?? 0),
      cost: Number(row.cumulative_cost ?? 0),
      net: Number(row.cumulative_net ?? 0),
    }));

    const breakdownMap = new Map<string, number>();
    for (const row of data.breakdown) {
      const key = String(row.category ?? "other");
      breakdownMap.set(key, (breakdownMap.get(key) ?? 0) + Number(row.total_amount ?? 0));
    }
    const breakdown = Array.from(breakdownMap, ([category, value]) => ({
      category: titleCase(category),
      value,
    })).sort((a, b) => b.value - a.value);

    const batches = [...data.batches]
      .map((row) => ({
        batch_id: String(row.batch_id),
        batch_code: String(row.batch_code ?? "—"),
        species: String(row.species_name ?? "—"),
        cost: Number(row.total_cost ?? 0),
        revenue: Number(row.total_revenue ?? 0),
        margin: Number(row.net_margin ?? 0),
      }))
      .sort((a, b) => a.margin - b.margin);

    const nowMonth = fmtMonth(presetRange("this_month").from);
    const thisMonth = data.monthly
      .map((row) => ({
        month: fmtMonth(String(row.month)),
        revenue: Number(row.total_revenue ?? 0),
        cost: Number(row.total_cost ?? 0),
        net: Number(row.net_profit ?? 0),
      }))
      .find((row) => row.month === nowMonth);

    const lifetimeNet = data.monthly.reduce((sum, row) => sum + Number(row.net_profit ?? 0), 0);
    const breakEven = cumulative.find((row) => row.net >= 0) ?? null;
    const latestCumulative = cumulative[cumulative.length - 1] ?? null;

    return {
      monthly,
      cumulative,
      breakdown,
      batches,
      thisMonth,
      lifetimeNet,
      breakEven,
      latestCumulative,
    };
  }, [data, range.from, range.to]);

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle="Revenue, costs and break-even progress for the whole farm."
      />

      <Card className="mb-5">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Date range</Label>
            <Select value={preset} onValueChange={(value) => setPreset(value as DateRangePreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_30">Last 30 days</SelectItem>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fin-from">From</Label>
                <Input
                  id="fin-from"
                  type="date"
                  value={custom.from}
                  onChange={(event) =>
                    setCustom((prev) => ({ ...prev, from: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-to">To</Label>
                <Input
                  id="fin-to"
                  type="date"
                  value={custom.to}
                  onChange={(event) => setCustom((prev) => ({ ...prev, to: event.target.value }))}
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 flex items-end text-sm text-muted-foreground">
              {fmtDate(range.from)} — {fmtDate(range.to)}
            </div>
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}

      {isLoading || !view ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue this month" value={fmtMoney(view.thisMonth?.revenue ?? 0)} />
            <StatCard label="Costs this month" value={fmtMoney(view.thisMonth?.cost ?? 0)} />
            <StatCard
              label="Net profit this month"
              value={fmtSignedMoney(view.thisMonth?.net ?? 0)}
              tone={(view.thisMonth?.net ?? 0) >= 0 ? "good" : "bad"}
            />
            <StatCard
              label="Net profit since inception"
              value={fmtSignedMoney(view.lifetimeNet)}
              tone={view.lifetimeNet >= 0 ? "good" : "bad"}
            />
          </div>

          <Card className="mt-5">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Cumulative revenue vs cost</CardTitle>
              <p className="text-xs text-muted-foreground">
                {view.breakEven
                  ? `Break-even reached on ${fmtDate(view.breakEven.day)}`
                  : `Not yet break-even — cumulative net ${fmtSignedMoney(
                      view.latestCumulative?.net ?? 0,
                    )}`}
              </p>
            </CardHeader>
            <CardContent className="h-72">
              {view.cumulative.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={view.cumulative} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tickFormatter={fmtDate} fontSize={11} />
                    <YAxis fontSize={11} width={70} tickFormatter={(value) => fmtMoney(value)} />
                    <RTooltip
                      formatter={(value: number) => fmtMoney(value)}
                      labelFormatter={(label) => fmtDate(String(label))}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Cumulative revenue"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost"
                      name="Cumulative cost"
                      stroke="var(--destructive)"
                      strokeWidth={2}
                      dot={false}
                    />
                    {view.breakEven ? (
                      <ReferenceDot
                        x={view.breakEven.day}
                        y={view.breakEven.revenue}
                        r={5}
                        fill="var(--primary)"
                        stroke="var(--background)"
                        label={{ value: "Break-even reached", position: "top", fontSize: 11 }}
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Revenue vs costs by month</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {view.monthly.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={view.monthly} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} width={70} tickFormatter={(value) => fmtMoney(value)} />
                      <RTooltip formatter={(value: number) => fmtMoney(value)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" name="Costs" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Cost breakdown by category</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {view.breakdown.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={view.breakdown}
                        dataKey="value"
                        nameKey="category"
                        innerRadius="52%"
                        outerRadius="80%"
                        paddingAngle={2}
                      >
                        {view.breakdown.map((entry, index) => (
                          <Cell
                            key={entry.category}
                            fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RTooltip formatter={(value: number) => fmtMoney(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                Batch profitability
                <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="About batch profitability">
                      <Info className="size-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Only costs and sales explicitly tagged with a batch appear here, so batches
                    without tagged entries are intentionally left out — nothing is broken.
                  </TooltipContent>
                </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Sorted worst margin first.</p>
            </CardHeader>
            <CardContent>
              {view.batches.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No costs or sales are tagged to a batch yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Batch</th>
                        <th className="py-2 pr-3">Species</th>
                        <th className="py-2 pr-3 text-right">Cost</th>
                        <th className="py-2 pr-3 text-right">Revenue</th>
                        <th className="py-2 text-right">Net margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.batches.map((row) => (
                        <tr key={row.batch_id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 font-medium">{row.batch_code}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{row.species}</td>
                          <td className="py-2 pr-3 text-right">{fmtMoney(row.cost)}</td>
                          <td className="py-2 pr-3 text-right">{fmtMoney(row.revenue)}</td>
                          <td
                            className={
                              row.margin >= 0
                                ? "py-2 text-right font-medium text-success"
                                : "py-2 text-right font-medium text-destructive"
                            }
                          >
                            {fmtSignedMoney(row.margin)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p
          className={
            tone === "bad"
              ? "stat-value mt-1 text-2xl text-destructive"
              : tone === "good"
                ? "stat-value mt-1 text-2xl text-success"
                : "stat-value mt-1 text-2xl"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data for this range yet.
    </div>
  );
}
