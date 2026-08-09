import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { daysSince, range } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/farms/")({
  head: () => ({
    meta: [
      { title: "Grow rooms — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "All grow rooms with their target temperature and humidity bands.",
      },
      { property: "og:title", content: "Grow rooms — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "All grow rooms with their target temperature and humidity bands.",
      },
    ],
  }),
  component: FarmsPage,
});

function useFarms(orgId: string) {
  return useQuery({
    queryKey: ["farms", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [farms, bags, readings] = await Promise.all([
        supabase.from("farms").select("*").order("name"),
        supabase.from("bags").select("id, farm_id, current_stage"),
        supabase
          .from("environment_readings")
          .select("farm_id, reading_date")
          .order("reading_date", { ascending: false }),
      ]);
      const error = farms.error ?? bags.error ?? readings.error;
      if (error) throw error;

      const lastLog = new Map<string, string>();
      for (const row of readings.data ?? []) {
        if (!lastLog.has(row.farm_id)) lastLog.set(row.farm_id, row.reading_date);
      }

      return (farms.data ?? []).map((farm) => {
        const farmBags = (bags.data ?? []).filter((bag) => bag.farm_id === farm.id);
        return {
          farm,
          totalBags: farmBags.length,
          activeBags: farmBags.filter(
            (bag) => bag.current_stage !== "harvested" && bag.current_stage !== "discarded",
          ).length,
          lastLog: lastLog.get(farm.id) ?? null,
        };
      });
    },
  });
}

function NewFarmDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    location_notes: "",
    colMin: "",
    colMax: "",
    fruitMin: "",
    fruitMax: "",
    humMin: "",
    humMax: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const numeric = (value: string) => (value.trim() === "" ? null : Number(value));
      const { error } = await supabase.from("farms").insert({
        org_id: orgId,
        name: form.name.trim(),
        location_notes: form.location_notes.trim() || null,
        target_colonization_temp_min: numeric(form.colMin),
        target_colonization_temp_max: numeric(form.colMax),
        target_fruiting_temp_min: numeric(form.fruitMin),
        target_fruiting_temp_max: numeric(form.fruitMax),
        target_humidity_min_pct: numeric(form.humMin),
        target_humidity_max_pct: numeric(form.humMax),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Room added");
      setOpen(false);
      setForm({
        name: "",
        location_notes: "",
        colMin: "",
        colMax: "",
        fruitMin: "",
        fruitMax: "",
        humMin: "",
        humMax: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["farms"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pair = (
    label: string,
    minKey: keyof typeof form,
    maxKey: keyof typeof form,
    unit: string,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          placeholder={`Min ${unit}`}
          value={form[minKey]}
          onChange={(event) => setForm((prev) => ({ ...prev, [minKey]: event.target.value }))}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          step="0.1"
          placeholder={`Max ${unit}`}
          value={form[maxKey]}
          onChange={(event) => setForm((prev) => ({ ...prev, [maxKey]: event.target.value }))}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Add a grow room</DialogTitle>
          <DialogDescription>
            Target ranges are optional — they drive the in-range checks on environment logs.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.name.trim().length < 2) {
              toast.error("Give the room a name");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="farm-name">Room name</Label>
            <Input
              id="farm-name"
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Fruiting room A"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-notes">Location notes</Label>
            <Textarea
              id="farm-notes"
              value={form.location_notes}
              maxLength={500}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location_notes: event.target.value }))
              }
              placeholder="North shed, shelf racks 1–4"
            />
          </div>
          {pair("Colonization temp", "colMin", "colMax", "°C")}
          {pair("Fruiting temp", "fruitMin", "fruitMax", "°C")}
          {pair("Humidity", "humMin", "humMax", "%")}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FarmsPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const { data, isPending, error } = useFarms(orgId);

  return (
    <div>
      <PageHeader
        title="Grow rooms"
        subtitle="Each room carries its own target climate and bag population."
        action={canEdit ? <NewFarmDialog orgId={orgId} /> : null}
      />

      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No rooms yet. Add one to start assigning batches.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map(({ farm, totalBags, activeBags, lastLog }) => {
            const gap = daysSince(lastLog);
            return (
              <Card key={farm.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate font-display text-base">
                        <Link
                          to="/farms/$farmId"
                          params={{ farmId: farm.id }}
                          className="hover:underline"
                        >
                          {farm.name}
                        </Link>
                      </CardTitle>
                      {farm.location_notes ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {farm.location_notes}
                        </p>
                      ) : null}
                    </div>
                    {!farm.is_active ? (
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Bags</p>
                      <p className="stat-value text-base">{totalBags}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active</p>
                      <p className="stat-value text-base">{activeBags}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Last log</p>
                      <p className="stat-value text-base">
                        {gap === null ? "—" : gap === 0 ? "Today" : `${gap}d`}
                      </p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <dt>Colonization</dt>
                      <dd className="text-foreground">
                        {range(
                          farm.target_colonization_temp_min,
                          farm.target_colonization_temp_max,
                          "°C",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Fruiting</dt>
                      <dd className="text-foreground">
                        {range(farm.target_fruiting_temp_min, farm.target_fruiting_temp_max, "°C")}
                      </dd>
                    </div>
                    <div>
                      <dt>Humidity</dt>
                      <dd className="text-foreground">
                        {range(farm.target_humidity_min_pct, farm.target_humidity_max_pct, "%")}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
