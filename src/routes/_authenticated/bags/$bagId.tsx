import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Ban } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { StageBadge } from "@/components/StageBadge";
import { StatTile } from "@/components/StatTile";
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
import {
  ACTION_LABEL,
  SEVERITY_LABEL,
  STAGE_LABEL,
  nextStage,
  type BagStage,
  type ContaminationAction,
  type ContaminationSeverity,
} from "@/lib/stages";
import { fmtDate, fmtDateTime, num, toNumber, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bags/$bagId")({
  head: () => ({
    meta: [
      { title: "Bag detail — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Stage history, contamination events and flush harvests for a single grow bag.",
      },
      { property: "og:title", content: "Bag detail — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Stage history, contamination events and flush harvests for a single grow bag.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Bag not found.</p>,
  component: BagDetailPage,
});

function useBagDetail(bagId: string) {
  return useQuery({
    queryKey: ["bag", bagId],
    queryFn: async () => {
      const bag = await supabase
        .from("bags")
        .select(
          "*, farms(id, name), species(common_name), batches(id, batch_code, inoculation_date, dry_substrate_weight_kg)",
        )
        .eq("id", bagId)
        .maybeSingle();
      if (bag.error) throw bag.error;
      if (!bag.data) throw notFound();

      const [history, harvests, contamination] = await Promise.all([
        supabase
          .from("bag_stage_history")
          .select("*")
          .eq("bag_id", bagId)
          .order("changed_at", { ascending: false }),
        supabase
          .from("harvests")
          .select("*")
          .eq("bag_id", bagId)
          .order("flush_number", { ascending: false }),
        supabase
          .from("contamination_events")
          .select("*")
          .eq("bag_id", bagId)
          .order("detected_at", { ascending: false }),
      ]);
      const error = history.error ?? harvests.error ?? contamination.error;
      if (error) throw error;

      return {
        bag: bag.data,
        history: history.data ?? [],
        harvests: harvests.data ?? [],
        contamination: contamination.data ?? [],
      };
    },
  });
}

function BagDetailPage() {
  const { bagId } = Route.useParams();
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useBagDetail(bagId);

  const [harvestForm, setHarvestForm] = useState({
    date: todayISO(),
    weight: "",
    notes: "",
  });
  const [contamForm, setContamForm] = useState<{
    severity: ContaminationSeverity;
    action: ContaminationAction;
    type: string;
    notes: string;
  }>({ severity: "minor", action: "monitoring", type: "", notes: "" });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bag", bagId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["batch"] }),
    ]);
  };

  const stageMutation = useMutation({
    mutationFn: async (stage: BagStage) => {
      const { error: updateError } = await supabase
        .from("bags")
        .update({
          current_stage: stage,
          is_discarded: stage === "discarded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bagId);
      if (updateError) throw updateError;
    },
    onSuccess: async (_result, stage) => {
      toast.success(`Moved to ${STAGE_LABEL[stage]}`);
      await refresh();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const harvestMutation = useMutation({
    mutationFn: async (flushNumber: number) => {
      const weight = Number(harvestForm.weight);
      if (!Number.isFinite(weight) || weight <= 0) throw new Error("Enter a harvest weight in grams");
      const { error: insertError } = await supabase.from("harvests").insert({
        org_id: orgId,
        bag_id: bagId,
        flush_number: flushNumber,
        harvest_date: harvestForm.date,
        wet_weight_g: weight,
        notes: harvestForm.notes.trim() || null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      toast.success("Harvest logged");
      setHarvestForm({ date: todayISO(), weight: "", notes: "" });
      await refresh();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const contamMutation = useMutation({
    mutationFn: async () => {
      const { error: insertError } = await supabase.from("contamination_events").insert({
        org_id: orgId,
        bag_id: bagId,
        severity: contamForm.severity,
        action_taken: contamForm.action,
        contaminant_type: contamForm.type.trim() || null,
        notes: contamForm.notes.trim() || null,
      });
      if (insertError) throw insertError;
      if (contamForm.action === "discarded") {
        const { error: updateError } = await supabase
          .from("bags")
          .update({ current_stage: "discarded", is_discarded: true })
          .eq("id", bagId);
        if (updateError) throw updateError;
      }
    },
    onSuccess: async () => {
      toast.success("Contamination recorded");
      setContamForm({ severity: "minor", action: "monitoring", type: "", notes: "" });
      await refresh();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const { bag, history, harvests, contamination } = data;
  const stage = bag.current_stage as BagStage;
  const upcoming = nextStage(stage);
  const totalWetG = harvests.reduce((sum, row) => sum + (toNumber(row.wet_weight_g) ?? 0), 0);
  const netKg = toNumber(bag.net_weight_kg);
  const bagEfficiency = netKg && netKg > 0 ? (totalWetG / (netKg * 1000)) * 100 : null;
  const nextFlush = harvests.reduce((max, row) => Math.max(max, row.flush_number), 0) + 1;

  return (
    <div>
      <PageHeader
        title={bag.bag_code}
        subtitle={
          <>
            {bag.species?.common_name ?? "Species"} ·{" "}
            {bag.batches ? (
              <Link
                to="/batches/$batchId"
                params={{ batchId: bag.batches.id }}
                className="underline-offset-2 hover:underline"
              >
                {bag.batches.batch_code}
              </Link>
            ) : (
              "Batch"
            )}{" "}
            ·{" "}
            {bag.farms ? (
              <Link
                to="/rooms/$farmId"
                params={{ farmId: bag.farms.id }}
                className="underline-offset-2 hover:underline"
              >
                {bag.farms.name}
              </Link>
            ) : (
              "Room"
            )}
          </>
        }
        action={<StageBadge stage={stage} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Flushes" value={harvests.length} />
        <StatTile label="Total yield" value={`${(totalWetG / 1000).toFixed(2)} kg`} />
        <StatTile
          label="Bag efficiency"
          value={bagEfficiency === null ? "—" : `${bagEfficiency.toFixed(1)}%`}
          hint={netKg ? `${num(netKg, 2)} kg net weight` : "Net weight not set"}
        />
        <StatTile
          label="Contamination events"
          value={contamination.length}
          tone={contamination.length > 0 ? "warning" : "default"}
        />
      </div>

      {canEdit ? (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Stage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {upcoming ? (
              <Button
                onClick={() => stageMutation.mutate(upcoming)}
                disabled={stageMutation.isPending}
              >
                Move to {STAGE_LABEL[upcoming]} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {stage === "discarded"
                  ? "This bag was discarded."
                  : "This bag has completed its cycle."}
              </p>
            )}
            {stage !== "discarded" ? (
              <Button
                variant="outline"
                onClick={() => stageMutation.mutate("discarded")}
                disabled={stageMutation.isPending}
              >
                <Ban className="size-4" /> Discard bag
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {canEdit ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Log a harvest</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  harvestMutation.mutate(nextFlush);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="harvest-date">Harvest date</Label>
                    <Input
                      id="harvest-date"
                      type="date"
                      value={harvestForm.date}
                      onChange={(event) =>
                        setHarvestForm((prev) => ({ ...prev, date: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="harvest-weight">Wet weight (g) — flush {nextFlush}</Label>
                    <Input
                      id="harvest-weight"
                      type="number"
                      min="1"
                      step="1"
                      value={harvestForm.weight}
                      onChange={(event) =>
                        setHarvestForm((prev) => ({ ...prev, weight: event.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="harvest-notes">Notes</Label>
                  <Textarea
                    id="harvest-notes"
                    maxLength={500}
                    value={harvestForm.notes}
                    onChange={(event) =>
                      setHarvestForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <Button type="submit" disabled={harvestMutation.isPending}>
                  {harvestMutation.isPending ? "Saving…" : "Log harvest"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {canEdit ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Report contamination</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  contamMutation.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Severity</Label>
                    <Select
                      value={contamForm.severity}
                      onValueChange={(value) =>
                        setContamForm((prev) => ({
                          ...prev,
                          severity: value as ContaminationSeverity,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SEVERITY_LABEL) as ContaminationSeverity[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {SEVERITY_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Action taken</Label>
                    <Select
                      value={contamForm.action}
                      onValueChange={(value) =>
                        setContamForm((prev) => ({ ...prev, action: value as ContaminationAction }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABEL) as ContaminationAction[]).map((value) => (
                          <SelectItem key={value} value={value}>
                            {ACTION_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contaminant">Contaminant</Label>
                  <Input
                    id="contaminant"
                    maxLength={80}
                    placeholder="Trichoderma"
                    value={contamForm.type}
                    onChange={(event) =>
                      setContamForm((prev) => ({ ...prev, type: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contam-notes">Notes</Label>
                  <Textarea
                    id="contam-notes"
                    maxLength={500}
                    value={contamForm.notes}
                    onChange={(event) =>
                      setContamForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <Button type="submit" variant="destructive" disabled={contamMutation.isPending}>
                  {contamMutation.isPending ? "Saving…" : "Record contamination"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Stage history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {history.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <StageBadge stage={row.stage as BagStage} size="sm" />
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(row.changed_at)}
                  </span>
                </li>
              ))}
              {history.length === 0 ? (
                <li className="px-4 py-5 text-sm text-muted-foreground">No stage changes yet.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Harvests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {harvests.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">Flush {row.flush_number}</span>
                    <span className="stat-value">{num(row.wet_weight_g, 0)} g</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(row.harvest_date)}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </p>
                </li>
              ))}
              {harvests.length === 0 ? (
                <li className="px-4 py-5 text-sm text-muted-foreground">No harvests logged.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Contamination</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {contamination.map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {SEVERITY_LABEL[row.severity as ContaminationSeverity]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ACTION_LABEL[row.action_taken as ContaminationAction]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(row.detected_at)}
                    {row.contaminant_type ? ` · ${row.contaminant_type}` : ""}
                  </p>
                </li>
              ))}
              {contamination.length === 0 ? (
                <li className="px-4 py-5 text-sm text-muted-foreground">Clean bag.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
