import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATASETS, downloadCsv } from "@/lib/csv-export";
import { todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({
    meta: [
      { title: "Export data — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Download bags, batches, harvests, readings and finance records as filtered CSV files.",
      },
      { property: "og:title", content: "Export data — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content:
          "Download bags, batches, harvests, readings and finance records as filtered CSV files.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportPage,
});

const ALL = "__all__";

function ExportPage() {
  const orgId = useOrgId();
  const [datasetKey, setDatasetKey] = useState(DATASETS[0]!.key);
  const [useDateRange, setUseDateRange] = useState(false);
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(todayISO());
  const [farmId, setFarmId] = useState(ALL);
  const [speciesId, setSpeciesId] = useState(ALL);
  const [busy, setBusy] = useState(false);

  const dataset = useMemo(
    () => DATASETS.find((item) => item.key === datasetKey)!,
    [datasetKey],
  );

  const { data: refs } = useQuery({
    queryKey: ["export-refs", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [farms, species] = await Promise.all([
        supabase.from("farms").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("species").select("id, common_name").order("common_name"),
      ]);
      if (farms.error) throw farms.error;
      if (species.error) throw species.error;
      return { farms: farms.data ?? [], species: species.data ?? [] };
    },
  });

  async function handleExport() {
    if (!orgId) return;
    setBusy(true);
    try {
      let query = supabase.from(dataset.table as never).select(dataset.select).eq("org_id", orgId);
      if (useDateRange && dataset.dateColumn) {
        const isTimestamp = dataset.dateColumn.endsWith("_at");
        query = query
          .gte(dataset.dateColumn, isTimestamp ? `${from}T00:00:00Z` : from)
          .lte(dataset.dateColumn, isTimestamp ? `${to}T23:59:59Z` : to);
      }
      if (farmId !== ALL && dataset.farmColumn) query = query.eq(dataset.farmColumn, farmId);
      if (speciesId !== ALL && dataset.speciesColumn)
        query = query.eq(dataset.speciesColumn, speciesId);
      if (dataset.dateColumn) query = query.order(dataset.dateColumn, { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(dataset.map);
      if (rows.length === 0) {
        toast.error("No rows match these filters");
        return;
      }
      downloadCsv(rows, dataset.key);
      toast.success(`Exported ${rows.length} rows`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Export data"
        subtitle="Download any table as CSV, with readable names instead of internal IDs."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base">Build your export</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Data type</Label>
            <Select value={datasetKey} onValueChange={(value) => setDatasetKey(value as never)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATASETS.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dataset.dateColumn ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Date range ({dataset.dateColumn.replace(/_/g, " ")})</Label>
              <Select
                value={useDateRange ? "range" : "all"}
                onValueChange={(value) => setUseDateRange(value === "range")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All dates</SelectItem>
                  <SelectItem value="range">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {useDateRange && dataset.dateColumn ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="export-from">From</Label>
                <Input
                  id="export-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="export-to">To</Label>
                <Input
                  id="export-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {dataset.farmColumn ? (
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={farmId} onValueChange={setFarmId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All rooms</SelectItem>
                  {(refs?.farms ?? []).map((farm) => (
                    <SelectItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {dataset.speciesColumn ? (
            <div className="space-y-1.5">
              <Label>Species</Label>
              <Select value={speciesId} onValueChange={setSpeciesId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All species</SelectItem>
                  {(refs?.species ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.common_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <Button onClick={handleExport} disabled={busy} className="w-full sm:w-auto">
              <Download className="size-4" /> {busy ? "Preparing…" : "Download CSV"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              File is saved as {dataset.key}_export_{todayISO()}.csv
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
