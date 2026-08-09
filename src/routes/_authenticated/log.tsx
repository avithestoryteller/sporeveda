import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, num, todayISO, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({
    meta: [
      { title: "Daily environment log — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Record daily temperature and humidity for each grow room in seconds.",
      },
      { property: "og:title", content: "Daily environment log — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Record daily temperature and humidity for each grow room in seconds.",
      },
    ],
  }),
  component: LogPage,
});

const EMPTY = {
  avgTemp: "",
  avgHum: "",
  minTemp: "",
  maxTemp: "",
  minHum: "",
  maxHum: "",
  notes: "",
};

function LogPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();
  const [farmId, setFarmId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState(EMPTY);

  const farms = useQuery({
    queryKey: ["log-farms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farms")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const recent = useQuery({
    queryKey: ["recent-readings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("environment_readings")
        .select("*, farms(name)")
        .order("reading_date", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedFarm = (farms.data ?? []).find((farm) => farm.id === farmId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!farmId) throw new Error("Pick a room");
      const numeric = (value: string) => (value.trim() === "" ? null : Number(value));
      if (form.avgTemp.trim() === "" && form.avgHum.trim() === "") {
        throw new Error("Enter at least an average temperature or humidity");
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("environment_readings").insert({
        org_id: orgId,
        farm_id: farmId,
        reading_date: date,
        avg_temp_c: numeric(form.avgTemp),
        avg_humidity_pct: numeric(form.avgHum),
        min_temp_c: numeric(form.minTemp),
        max_temp_c: numeric(form.maxTemp),
        min_humidity_pct: numeric(form.minHum),
        max_humidity_pct: numeric(form.maxHum),
        source: "manual",
        recorded_by: userData.user?.id ?? null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Reading saved");
      setForm(EMPTY);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recent-readings"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["farm"] }),
        queryClient.invalidateQueries({ queryKey: ["farms"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tempTarget = selectedFarm
    ? {
        min: toNumber(selectedFarm.target_fruiting_temp_min),
        max: toNumber(selectedFarm.target_fruiting_temp_max),
      }
    : null;
  const humTarget = selectedFarm
    ? {
        min: toNumber(selectedFarm.target_humidity_min_pct),
        max: toNumber(selectedFarm.target_humidity_max_pct),
      }
    : null;

  function outOfRange(value: string, target: { min: number | null; max: number | null } | null) {
    const parsed = toNumber(value);
    if (parsed === null || !target) return false;
    if (target.min !== null && parsed < target.min) return true;
    if (target.max !== null && parsed > target.max) return true;
    return false;
  }

  const tempWarn = outOfRange(form.avgTemp, tempTarget);
  const humWarn = outOfRange(form.avgHum, humTarget);

  const field = (
    id: string,
    label: string,
    key: keyof typeof EMPTY,
    step = "0.1",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={form[key]}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Daily log"
        subtitle="One entry per room per day. Targets come from the room settings."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">New reading</CardTitle>
          </CardHeader>
          <CardContent>
            {farms.isPending ? (
              <Skeleton className="h-64" />
            ) : (farms.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a grow room first.</p>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
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
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reading-date">Date</Label>
                    <Input
                      id="reading-date"
                      type="date"
                      value={date}
                      max={todayISO()}
                      onChange={(event) => setDate(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    {field("avg-temp", "Average temp (°C)", "avgTemp")}
                    {tempWarn ? (
                      <p className="mt-1 text-xs text-warning">
                        Outside the room's fruiting target.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    {field("avg-hum", "Average humidity (%)", "avgHum")}
                    {humWarn ? (
                      <p className="mt-1 text-xs text-warning">Outside the room's humidity target.</p>
                    ) : null}
                  </div>
                  {field("min-temp", "Min temp (°C)", "minTemp")}
                  {field("max-temp", "Max temp (°C)", "maxTemp")}
                  {field("min-hum", "Min humidity (%)", "minHum")}
                  {field("max-hum", "Max humidity (%)", "maxHum")}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reading-notes">Notes</Label>
                  <Textarea
                    id="reading-notes"
                    maxLength={500}
                    value={form.notes}
                    onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Humidifier refilled, fan speed raised"
                  />
                </div>

                <Button type="submit" disabled={mutation.isPending || !canEdit}>
                  {mutation.isPending ? "Saving…" : "Save reading"}
                </Button>
                {!canEdit ? (
                  <p className="text-xs text-muted-foreground">
                    Your role can view records but not add them.
                  </p>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Latest entries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.isPending ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (recent.data ?? []).length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No readings yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(recent.data ?? []).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {(row.farms as { name: string } | null)?.name ?? "Room"}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtDate(row.reading_date)}</p>
                    </div>
                    <p className="stat-value shrink-0 text-sm">
                      {num(row.avg_temp_c)}°C · {num(row.avg_humidity_pct)}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
