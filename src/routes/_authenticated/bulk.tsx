import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  STAGE_ORDER,
  type BagStage,
  type ContaminationAction,
  type ContaminationSeverity,
} from "@/lib/stages";
import { fmtDate } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type BagUpdate = Database["public"]["Tables"]["bags"]["Update"];
type BatchUpdate = Database["public"]["Tables"]["batches"]["Update"];

export const Route = createFileRoute("/_authenticated/bulk")({
  head: () => ({
    meta: [
      { title: "Bulk update — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Select many bags or batches at once and change stage, room, weights, notes or log contamination in one go.",
      },
      { property: "og:title", content: "Bulk update — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Update multiple bags and batches at once in Sporeveda Farm Manager.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : "Something went wrong"}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Not found.</p>,
  component: BulkUpdatePage,
});

const KEEP = "__keep__";

function useBulkData() {
  return useQuery({
    queryKey: ["bulk"],
    queryFn: async () => {
      const [bags, batches, farms] = await Promise.all([
        supabase
          .from("bags")
          .select("id, bag_code, bag_number, current_stage, net_weight_kg, farm_id, batch_id")
          .order("bag_number", { ascending: true }),
        supabase
          .from("batches")
          .select("id, batch_code, substrate_type, inoculation_date, dry_substrate_weight_kg, notes, farm_id")
          .order("inoculation_date", { ascending: false }),
        supabase.from("farms").select("id, name").order("name"),
      ]);
      const error = bags.error ?? batches.error ?? farms.error;
      if (error) throw error;
      return {
        bags: bags.data ?? [],
        batches: batches.data ?? [],
        farms: farms.data ?? [],
      };
    },
  });
}

function BulkUpdatePage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useBulkData();

  const [bagFilter, setBagFilter] = useState({ farm: "all", batch: "all", stage: "all", q: "" });
  const [selectedBags, setSelectedBags] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);

  const [bagEdit, setBagEdit] = useState({ stage: KEEP, farm: KEEP, netWeight: "" });
  const [contam, setContam] = useState({
    enabled: false,
    severity: "severe" as ContaminationSeverity,
    action: "discarded" as ContaminationAction,
    type: "",
    notes: "",
  });
  const [batchEdit, setBatchEdit] = useState({
    farm: KEEP,
    substrate: "",
    inoculation: "",
    dryWeight: "",
    notes: "",
  });

  const bags = data?.bags ?? [];
  const batches = data?.batches ?? [];
  const farms = data?.farms ?? [];

  const filteredBags = useMemo(
    () =>
      bags.filter((bag) => {
        if (bagFilter.farm !== "all" && bag.farm_id !== bagFilter.farm) return false;
        if (bagFilter.batch !== "all" && bag.batch_id !== bagFilter.batch) return false;
        if (bagFilter.stage !== "all" && bag.current_stage !== bagFilter.stage) return false;
        if (bagFilter.q.trim()) {
          const q = bagFilter.q.trim().toLowerCase();
          const matches =
            bag.bag_code.toLowerCase().includes(q) || String(bag.bag_number).includes(q);
          if (!matches) return false;
        }
        return true;
      }),
    [bags, bagFilter],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bulk"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["bag"] }),
      queryClient.invalidateQueries({ queryKey: ["batch"] }),
      queryClient.invalidateQueries({ queryKey: ["batches"] }),
      queryClient.invalidateQueries({ queryKey: ["farms"] }),
    ]);
  };

  const bagMutation = useMutation({
    mutationFn: async () => {
      if (selectedBags.length === 0) throw new Error("Select at least one bag");

      const patch: BagUpdate = {};
      if (bagEdit.stage !== KEEP) {
        patch['current_stage'] = bagEdit.stage as BagStage;
        patch['is_discarded'] = bagEdit.stage === "discarded";
      }
      if (bagEdit.farm !== KEEP) patch['farm_id'] = bagEdit.farm;
      if (bagEdit.netWeight.trim()) {
        const weight = Number(bagEdit.netWeight);
        if (!Number.isFinite(weight) || weight <= 0) throw new Error("Enter a valid net weight");
        patch['net_weight_kg'] = weight;
      }

      if (contam.enabled) {
        const { error: insertError } = await supabase.from("contamination_events").insert(
          selectedBags.map((bagId) => ({
            org_id: orgId,
            bag_id: bagId,
            severity: contam.severity,
            action_taken: contam.action,
            contaminant_type: contam.type.trim() || null,
            notes: contam.notes.trim() || null,
          })),
        );
        if (insertError) throw insertError;
        if (contam.action === "discarded") {
          patch['current_stage'] = "discarded";
          patch['is_discarded'] = true;
        }
      }

      if (Object.keys(patch).length === 0) {
        if (!contam.enabled) throw new Error("Choose at least one value to change");
        return;
      }
      patch['updated_at'] = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("bags")
        .update(patch)
        .in("id", selectedBags);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      toast.success(`Updated ${selectedBags.length} bag(s)`);
      setSelectedBags([]);
      setBagEdit({ stage: KEEP, farm: KEEP, netWeight: "" });
      setContam((prev) => ({ ...prev, enabled: false, type: "", notes: "" }));
      await refresh();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      if (selectedBatches.length === 0) throw new Error("Select at least one batch");
      const patch: BatchUpdate = {};
      if (batchEdit.farm !== KEEP) patch['farm_id'] = batchEdit.farm;
      if (batchEdit.substrate.trim()) patch['substrate_type'] = batchEdit.substrate.trim();
      if (batchEdit.inoculation) patch['inoculation_date'] = batchEdit.inoculation;
      if (batchEdit.dryWeight.trim()) {
        const weight = Number(batchEdit.dryWeight);
        if (!Number.isFinite(weight) || weight <= 0) throw new Error("Enter a valid dry weight");
        patch['dry_substrate_weight_kg'] = weight;
      }
      if (batchEdit.notes.trim()) patch['notes'] = batchEdit.notes.trim();
      if (Object.keys(patch).length === 0) throw new Error("Choose at least one value to change");

      const { error: updateError } = await supabase
        .from("batches")
        .update(patch)
        .in("id", selectedBatches);
      if (updateError) throw updateError;
    },
    onSuccess: async () => {
      toast.success(`Updated ${selectedBatches.length} batch(es)`);
      setSelectedBatches([]);
      setBatchEdit({ farm: KEEP, substrate: "", inoculation: "", dryWeight: "", notes: "" });
      await refresh();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  if (!canEdit) {
    return (
      <div>
        <PageHeader title="Bulk update" subtitle="Change many records at once" />
        <p className="text-sm text-muted-foreground">
          Your role is read-only, so bulk editing is disabled.
        </p>
      </div>
    );
  }

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

  return (
    <div>
      <PageHeader
        title="Bulk update"
        subtitle="Select multiple records and apply the same changes in one go"
      />

      <Tabs defaultValue="bags">
        <TabsList>
          <TabsTrigger value="bags">Bags</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="bags" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Filter bags</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Room</Label>
                <Select
                  value={bagFilter.farm}
                  onValueChange={(value) => setBagFilter((prev) => ({ ...prev, farm: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooms</SelectItem>
                    {farms.map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Batch</Label>
                <Select
                  value={bagFilter.batch}
                  onValueChange={(value) => setBagFilter((prev) => ({ ...prev, batch: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All batches</SelectItem>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select
                  value={bagFilter.stage}
                  onValueChange={(value) => setBagFilter((prev) => ({ ...prev, stage: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {STAGE_ORDER.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {STAGE_LABEL[stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bag-search">Search</Label>
                <Input
                  id="bag-search"
                  placeholder="Bag code or number"
                  value={bagFilter.q}
                  onChange={(event) =>
                    setBagFilter((prev) => ({ ...prev, q: event.target.value }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="font-display text-base">
                Bags ({selectedBags.length} selected)
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedBags(filteredBags.map((bag) => bag.id))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedBags([])}
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {filteredBags.map((bag) => (
                  <li key={bag.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                      <Checkbox
                        checked={selectedBags.includes(bag.id)}
                        onCheckedChange={() => setSelectedBags((prev) => toggle(prev, bag.id))}
                        aria-label={`Select ${bag.bag_code}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {bag.bag_code}
                      </span>
                      <StageBadge stage={bag.current_stage as BagStage} size="sm" />
                    </label>
                  </li>
                ))}
                {filteredBags.length === 0 ? (
                  <li className="px-4 py-5 text-sm text-muted-foreground">No bags match.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Apply changes</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  bagMutation.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Stage</Label>
                    <Select
                      value={bagEdit.stage}
                      onValueChange={(value) => setBagEdit((prev) => ({ ...prev, stage: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Keep current</SelectItem>
                        {STAGE_ORDER.map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {STAGE_LABEL[stage]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Room</Label>
                    <Select
                      value={bagEdit.farm}
                      onValueChange={(value) => setBagEdit((prev) => ({ ...prev, farm: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Keep current</SelectItem>
                        {farms.map((farm) => (
                          <SelectItem key={farm.id} value={farm.id}>
                            {farm.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-net-weight">Net weight (kg)</Label>
                    <Input
                      id="bulk-net-weight"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unchanged"
                      value={bagEdit.netWeight}
                      onChange={(event) =>
                        setBagEdit((prev) => ({ ...prev, netWeight: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={contam.enabled}
                      onCheckedChange={(value) =>
                        setContam((prev) => ({ ...prev, enabled: value === true }))
                      }
                    />
                    Mark selected bags as contaminated
                  </label>
                  {contam.enabled ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Severity</Label>
                        <Select
                          value={contam.severity}
                          onValueChange={(value) =>
                            setContam((prev) => ({
                              ...prev,
                              severity: value as ContaminationSeverity,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(SEVERITY_LABEL) as ContaminationSeverity[]).map(
                              (value) => (
                                <SelectItem key={value} value={value}>
                                  {SEVERITY_LABEL[value]}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Action taken</Label>
                        <Select
                          value={contam.action}
                          onValueChange={(value) =>
                            setContam((prev) => ({ ...prev, action: value as ContaminationAction }))
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
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-contaminant">Contaminant</Label>
                        <Input
                          id="bulk-contaminant"
                          maxLength={80}
                          placeholder="Trichoderma"
                          value={contam.type}
                          onChange={(event) =>
                            setContam((prev) => ({ ...prev, type: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="bulk-contam-notes">Notes</Label>
                        <Textarea
                          id="bulk-contam-notes"
                          maxLength={500}
                          value={contam.notes}
                          onChange={(event) =>
                            setContam((prev) => ({ ...prev, notes: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <Button type="submit" disabled={bagMutation.isPending || selectedBags.length === 0}>
                  {bagMutation.isPending
                    ? "Applying…"
                    : `Apply to ${selectedBags.length} bag(s)`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="font-display text-base">
                Batches ({selectedBatches.length} selected)
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedBatches(batches.map((batch) => batch.id))}
                >
                  Select all
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedBatches([])}>
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {batches.map((batch) => (
                  <li key={batch.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                      <Checkbox
                        checked={selectedBatches.includes(batch.id)}
                        onCheckedChange={() =>
                          setSelectedBatches((prev) => toggle(prev, batch.id))
                        }
                        aria-label={`Select ${batch.batch_code}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {batch.batch_code}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(batch.inoculation_date)}
                      </span>
                    </label>
                  </li>
                ))}
                {batches.length === 0 ? (
                  <li className="px-4 py-5 text-sm text-muted-foreground">No batches yet.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">Apply changes</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  batchMutation.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Room</Label>
                    <Select
                      value={batchEdit.farm}
                      onValueChange={(value) => setBatchEdit((prev) => ({ ...prev, farm: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KEEP}>Keep current</SelectItem>
                        {farms.map((farm) => (
                          <SelectItem key={farm.id} value={farm.id}>
                            {farm.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-substrate">Substrate</Label>
                    <Input
                      id="bulk-substrate"
                      placeholder="Unchanged"
                      value={batchEdit.substrate}
                      onChange={(event) =>
                        setBatchEdit((prev) => ({ ...prev, substrate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-inoculation">Inoculation date</Label>
                    <Input
                      id="bulk-inoculation"
                      type="date"
                      value={batchEdit.inoculation}
                      onChange={(event) =>
                        setBatchEdit((prev) => ({ ...prev, inoculation: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-dry-weight">Dry substrate (kg)</Label>
                    <Input
                      id="bulk-dry-weight"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unchanged"
                      value={batchEdit.dryWeight}
                      onChange={(event) =>
                        setBatchEdit((prev) => ({ ...prev, dryWeight: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-batch-notes">Notes</Label>
                  <Textarea
                    id="bulk-batch-notes"
                    maxLength={500}
                    placeholder="Unchanged"
                    value={batchEdit.notes}
                    onChange={(event) =>
                      setBatchEdit((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>
                <Button
                  type="submit"
                  disabled={batchMutation.isPending || selectedBatches.length === 0}
                >
                  {batchMutation.isPending
                    ? "Applying…"
                    : `Apply to ${selectedBatches.length} batch(es)`}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
