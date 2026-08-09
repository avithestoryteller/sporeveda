import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, num } from "@/lib/format";
import {
  parseHygrometerCsv,
  SPARSE_READING_THRESHOLD,
  type DailyAggregate,
} from "@/lib/hygrometer-csv";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import environment log — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Bulk-load hygrometer CSV exports into daily temperature and humidity records per grow room.",
      },
      { property: "og:title", content: "Import environment log — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content:
          "Bulk-load hygrometer CSV exports into daily temperature and humidity records per grow room.",
      },
    ],
  }),
  component: ImportPage,
});

type ExistingRow = {
  id: string;
  reading_date: string;
  avg_temp_c: number | string | null;
  avg_humidity_pct: number | string | null;
  source: string;
};

type Decision = "overwrite" | "keep";

function ImportPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();

  const [farmId, setFarmId] = useState("");
  const [fileName, setFileName] = useState("");
  const [days, setDays] = useState<DailyAggregate[]>([]);
  const [parseInfo, setParseInfo] = useState<{ total: number; skipped: number } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [summary, setSummary] = useState<string | null>(null);

  const farms = useQuery({
    queryKey: ["import-farms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farms")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const dateList = useMemo(() => days.map((day) => day.date), [days]);

  const existing = useQuery({
    queryKey: ["import-existing", farmId, dateList.join(",")],
    enabled: Boolean(farmId) && dateList.length > 0,
    queryFn: async (): Promise<ExistingRow[]> => {
      const { data, error } = await supabase
        .from("environment_readings")
        .select("id, reading_date, avg_temp_c, avg_humidity_pct, source")
        .eq("farm_id", farmId)
        .in("reading_date", dateList);
      if (error) throw error;
      return (data ?? []) as ExistingRow[];
    },
  });

  const existingByDate = useMemo(() => {
    const map = new Map<string, ExistingRow>();
    for (const row of existing.data ?? []) map.set(row.reading_date, row);
    return map;
  }, [existing.data]);

  async function handleFile(file: File | undefined) {
    setSummary(null);
    if (!file) return;
    const text = await file.text();
    const result = parseHygrometerCsv(text);
    if (result.days.length === 0) {
      toast.error("No readings found in that CSV");
      return;
    }
    setFileName(file.name);
    setDays(result.days);
    setParseInfo({ total: result.totalRows, skipped: result.skippedRows });
    setDecisions({});
  }

  const commit = useMutation({
    mutationFn: async () => {
      if (!farmId) throw new Error("Pick a room first");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      const inserts: Record<string, unknown>[] = [];

      for (const day of days) {
        const conflict = existingByDate.get(day.date);
        const payload = {
          org_id: orgId,
          farm_id: farmId,
          reading_date: day.date,
          avg_temp_c: day.avgTemp,
          avg_humidity_pct: day.avgHum,
          min_temp_c: day.minTemp,
          max_temp_c: day.maxTemp,
          min_humidity_pct: day.minHum,
          max_humidity_pct: day.maxHum,
          source: "sensor_import",
          recorded_by: userId,
          notes: `Imported from hygrometer CSV, ${day.count} readings averaged`,
        };

        if (!conflict) {
          inserts.push(payload);
          imported += 1;
          continue;
        }
        if ((decisions[day.date] ?? "keep") !== "overwrite") {
          skipped += 1;
          continue;
        }
        const { error } = await supabase
          .from("environment_readings")
          .update(payload)
          .eq("id", conflict.id);
        if (error) throw error;
        updated += 1;
      }

      if (inserts.length > 0) {
        const { error } = await supabase.from("environment_readings").insert(inserts as never);
        if (error) throw error;
      }

      return { imported, updated, skipped };
    },
    onSuccess: async (result) => {
      setSummary(
        `${result.imported} day${result.imported === 1 ? "" : "s"} imported, ${result.skipped} skipped, ${result.updated} updated`,
      );
      toast.success("Import complete");
      setDays([]);
      setParseInfo(null);
      setDecisions({});
      setFileName("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-readings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["farm"] }),
        queryClient.invalidateQueries({ queryKey: ["import-existing"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const conflicts = days.filter((day) => existingByDate.has(day.date));

  return (
    <div>
      <PageHeader
        title="Import environment log"
        subtitle="Upload a hygrometer CSV export and turn raw readings into one daily record per room."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">1. Upload & assign</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select value={farmId} onValueChange={setFarmId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {(farms.data ?? []).map((farm) => (
                    <SelectItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The CSV doesn't say which room the sensor was in — pick it here.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              {fileName ? (
                <p className="text-xs text-muted-foreground">
                  {fileName}
                  {parseInfo
                    ? ` · ${parseInfo.total} readings parsed${parseInfo.skipped ? `, ${parseInfo.skipped} rows ignored` : ""}`
                    : ""}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {summary ? (
          <Card className="border-success/40">
            <CardContent className="p-4 text-sm">{summary}</CardContent>
          </Card>
        ) : null}

        {days.length > 0 ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">2. Preview by date</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Readings</TableHead>
                        <TableHead className="text-right">Avg temp</TableHead>
                        <TableHead className="text-right">Min/Max temp</TableHead>
                        <TableHead className="text-right">Avg RH</TableHead>
                        <TableHead className="text-right">Min/Max RH</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {days.map((day) => {
                        const sparse = day.count < SPARSE_READING_THRESHOLD;
                        return (
                          <TableRow key={day.date}>
                            <TableCell className="whitespace-nowrap font-medium">
                              {fmtDate(day.date)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="stat-value">{day.count}</span>
                              {sparse ? (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs text-warning">
                                  <AlertTriangle className="h-3 w-3" /> sparse
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="stat-value text-right">
                              {num(day.avgTemp)}°C
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {num(day.minTemp)} / {num(day.maxTemp)}
                            </TableCell>
                            <TableCell className="stat-value text-right">
                              {num(day.avgHum)}%
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {num(day.minHum)} / {num(day.maxHum)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">3. Conflicts</CardTitle>
              </CardHeader>
              <CardContent>
                {!farmId ? (
                  <p className="text-sm text-muted-foreground">Pick a room to check for conflicts.</p>
                ) : existing.isPending ? (
                  <p className="text-sm text-muted-foreground">Checking existing entries…</p>
                ) : conflicts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No existing entries on these dates — everything will import.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {conflicts.map((day) => {
                      const row = existingByDate.get(day.date)!;
                      const decision = decisions[day.date] ?? "keep";
                      return (
                        <li
                          key={day.date}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                        >
                          <div className="text-sm">
                            <p className="font-medium">{fmtDate(day.date)}</p>
                            <p className="text-xs text-muted-foreground">
                              Existing ({row.source === "sensor_import" ? "imported" : "manual"}):{" "}
                              {num(row.avg_temp_c)}°C · {num(row.avg_humidity_pct)}% → CSV:{" "}
                              {num(day.avgTemp)}°C · {num(day.avgHum)}%
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={decision === "keep" ? "default" : "outline"}
                              onClick={() =>
                                setDecisions((prev) => ({ ...prev, [day.date]: "keep" }))
                              }
                            >
                              Keep existing
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={decision === "overwrite" ? "default" : "outline"}
                              onClick={() =>
                                setDecisions((prev) => ({ ...prev, [day.date]: "overwrite" }))
                              }
                            >
                              Overwrite
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => commit.mutate()}
                disabled={!farmId || !canEdit || commit.isPending || existing.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {commit.isPending ? "Importing…" : "Import readings"}
              </Button>
              <Badge variant="outline">Written as sensor_import</Badge>
              {!canEdit ? (
                <p className="text-xs text-muted-foreground">
                  Your role can view records but not add them.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
