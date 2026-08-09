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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtDate, todayISO } from "@/lib/format";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/stages";


export const Route = createFileRoute("/_authenticated/batches/")({
  head: () => ({
    meta: [
      { title: "Batches — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Substrate batches with bag counts, species and inoculation dates.",
      },
      { property: "og:title", content: "Batches — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Substrate batches with bag counts, species and inoculation dates.",
      },
    ],
  }),
  component: BatchesPage,
});

function useBatches() {
  return useQuery({
    queryKey: ["batches"],
    staleTime: 60_000,
    queryFn: async () => {
      const [batches, bags] = await Promise.all([
        supabase
          .from("batches")
          .select("*, farms(name), species(common_name)")
          .order("inoculation_date", { ascending: false }),
        supabase.from("bags").select("batch_id, current_stage"),
      ]);
      const error = batches.error ?? bags.error;
      if (error) throw error;
      const allBags = bags.data ?? [];
      const funnel = STAGE_ORDER.map((stage) => ({
        stage,
        label: STAGE_LABEL[stage],
        count: allBags.filter((bag) => bag.current_stage === stage).length,
      }));
      return {
        rows: (batches.data ?? []).map((batch) => {
          const batchBags = allBags.filter((bag) => bag.batch_id === batch.id);
          return {
            batch,
            bagCount: batchBags.length,
            discarded: batchBags.filter((bag) => bag.current_stage === "discarded").length,
          };
        }),
        funnel,
        totalBags: allBags.length,
      };
    },
  });
}

function StageFunnel({
  funnel,
  totalBags,
}: {
  funnel: { stage: string; label: string; count: number }[];
  totalBags: number;
}) {
  const max = Math.max(1, ...funnel.map((step) => step.count));
  return (
    <Card className="mb-4">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold">Bags by stage</h2>
          <p className="text-xs text-muted-foreground">{totalBags} bags total</p>
        </div>
        {funnel.map((step) => {
          const width = (step.count / max) * 100;
          return (
            <div key={step.stage} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{step.label}</span>
              <div className="relative h-7 flex-1">
                <div
                  className="h-full rounded-md transition-all"
                  style={{
                    width: `${Math.max(width, step.count > 0 ? 4 : 1)}%`,
                    marginLeft: `${(100 - Math.max(width, step.count > 0 ? 4 : 1)) / 2}%`,
                    background: `var(--color-stage-${step.stage})`,
                    opacity: step.count === 0 ? 0.25 : 1,
                  }}
                />
              </div>
              <span className="stat-value w-16 shrink-0 text-right text-sm">
                {step.count}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {totalBags ? `${Math.round((step.count / totalBags) * 100)}%` : "—"}
                </span>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}


function useFormOptions() {
  return useQuery({
    queryKey: ["batch-form-options"],
    queryFn: async () => {
      const [farms, species] = await Promise.all([
        supabase.from("farms").select("id, name").eq("is_active", true).order("name"),
        supabase.from("species").select("id, common_name").order("common_name"),
      ]);
      const error = farms.error ?? species.error;
      if (error) throw error;
      return { farms: farms.data ?? [], species: species.data ?? [] };
    },
  });
}

function NewBatchDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const options = useFormOptions();
  const [form, setForm] = useState({
    farmId: "",
    speciesId: "",
    newSpecies: "",
    batchCode: "",
    substrate: "",
    inoculationDate: todayISO(),
    dryWeight: "",
    bagCount: "10",
    bagWeight: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let speciesId = form.speciesId;
      if (speciesId === "__new__") {
        const name = form.newSpecies.trim();
        if (name.length < 2) throw new Error("Enter the species name");
        const { data, error } = await supabase
          .from("species")
          .insert({ org_id: orgId, common_name: name })
          .select("id")
          .single();
        if (error) throw error;
        speciesId = data.id;
      }
      if (!form.farmId) throw new Error("Pick a room");
      if (!speciesId) throw new Error("Pick a species");

      const code = form.batchCode.trim();
      const { data: batch, error: batchError } = await supabase
        .from("batches")
        .insert({
          org_id: orgId,
          farm_id: form.farmId,
          species_id: speciesId,
          batch_code: code,
          substrate_type: form.substrate.trim() || null,
          inoculation_date: form.inoculationDate,
          dry_substrate_weight_kg: form.dryWeight.trim() ? Number(form.dryWeight) : null,
          notes: form.notes.trim() || null,
        })
        .select("id")
        .single();
      if (batchError) throw batchError;

      const count = Math.max(0, Math.min(500, Number(form.bagCount) || 0));
      if (count > 0) {
        const netWeight = form.bagWeight.trim() ? Number(form.bagWeight) : null;
        const rows = Array.from({ length: count }, (_, index) => ({
          org_id: orgId,
          batch_id: batch.id,
          farm_id: form.farmId,
          species_id: speciesId,
          bag_number: index + 1,
          bag_code: `${code}-${String(index + 1).padStart(3, "0")}`,
          net_weight_kg: netWeight,
        }));
        const { error: bagsError } = await supabase.from("bags").insert(rows);
        if (bagsError) throw bagsError;
      }
      return batch.id;
    },
    onSuccess: async () => {
      toast.success("Batch created with its bags");
      setOpen(false);
      setForm((prev) => ({ ...prev, batchCode: "", notes: "", newSpecies: "" }));
      await queryClient.invalidateQueries({ queryKey: ["batches"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New batch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Start a batch</DialogTitle>
          <DialogDescription>
            Bags are generated automatically and numbered from the batch code.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.batchCode.trim().length < 2) {
              toast.error("Enter a batch code");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select
                value={form.farmId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, farmId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.farms ?? []).map((farm) => (
                    <SelectItem key={farm.id} value={farm.id}>
                      {farm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Species</Label>
              <Select
                value={form.speciesId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, speciesId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select species" />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.species ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.common_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Add new species…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.speciesId === "__new__" ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-species">New species name</Label>
              <Input
                id="new-species"
                value={form.newSpecies}
                maxLength={80}
                placeholder="Blue Oyster"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, newSpecies: event.target.value }))
                }
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="batch-code">Batch code</Label>
              <Input
                id="batch-code"
                value={form.batchCode}
                maxLength={40}
                placeholder="B-2026-04"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, batchCode: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inoc-date">Inoculation date</Label>
              <Input
                id="inoc-date"
                type="date"
                value={form.inoculationDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, inoculationDate: event.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="substrate">Substrate</Label>
              <Input
                id="substrate"
                value={form.substrate}
                maxLength={80}
                placeholder="Masters mix"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, substrate: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dry-weight">Dry substrate (kg)</Label>
              <Input
                id="dry-weight"
                type="number"
                step="0.01"
                min="0"
                value={form.dryWeight}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, dryWeight: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-count">Number of bags</Label>
              <Input
                id="bag-count"
                type="number"
                min="0"
                max="500"
                value={form.bagCount}
                onChange={(event) => setForm((prev) => ({ ...prev, bagCount: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-weight">Net weight per bag (kg)</Label>
              <Input
                id="bag-weight"
                type="number"
                step="0.01"
                min="0"
                value={form.bagWeight}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bagWeight: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batch-notes">Notes</Label>
            <Textarea
              id="batch-notes"
              value={form.notes}
              maxLength={1000}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchesPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const { data, isPending, error } = useBatches();

  return (
    <div>
      <PageHeader
        title="Batches"
        subtitle="Each batch is one substrate run, split into numbered bags."
        action={canEdit ? <NewBatchDialog orgId={orgId} /> : null}
      />

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No batches yet. Start one to generate its bags.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {data.map(({ batch, bagCount, discarded }) => (
                <li key={batch.id}>
                  <Link
                    to="/batches/$batchId"
                    params={{ batchId: batch.id }}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{batch.batch_code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {batch.species?.common_name ?? "Species"} · {batch.farms?.name ?? "Room"} ·{" "}
                        {batch.substrate_type ?? "substrate n/a"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="stat-value text-sm">{bagCount} bags</p>
                      <p className="text-xs text-muted-foreground">
                        {discarded > 0 ? `${discarded} discarded · ` : ""}
                        {fmtDate(batch.inoculation_date)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
