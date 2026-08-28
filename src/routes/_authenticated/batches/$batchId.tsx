import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { BagFormDialog } from "@/components/BagFormDialog";
import { BatchFormDialog } from "@/components/BatchFormDialog";
import { BatchClimateCard } from "@/components/BatchClimateCard";
import { PageHeader } from "@/components/AppShell";
import { StageBadge } from "@/components/StageBadge";
import { StatTile } from "@/components/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STAGE_ORDER, type BagStage } from "@/lib/stages";
import { fmtDate, num, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/batches/$batchId")({
  head: () => ({
    meta: [
      { title: "Batch detail — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Bag grid, contamination rate and biological efficiency for one substrate batch.",
      },
      { property: "og:title", content: "Batch detail — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Bag grid, contamination rate and biological efficiency for one substrate batch.",
      },
    ],
  }),
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Batch not found.</p>,
  component: BatchDetailPage,
});

function useBatchDetail(batchId: string) {
  return useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const batch = await supabase
        .from("batches")
        .select("*, farms(id, name), species(common_name, scientific_name)")
        .eq("id", batchId)
        .maybeSingle();
      if (batch.error) throw batch.error;
      if (!batch.data) throw notFound();

      const bags = await supabase
        .from("bags")
        .select(
          "id, bag_code, bag_number, current_stage, net_weight_kg, dry_weight_kg, spawn_weight_kg, notes, is_discarded",
        )
        .eq("batch_id", batchId)
        .order("bag_number");
      if (bags.error) throw bags.error;

      const bagIds = (bags.data ?? []).map((bag) => bag.id);
      const [harvests, contamination] = await Promise.all([
        bagIds.length
          ? supabase.from("harvests").select("bag_id, wet_weight_g, flush_number").in("bag_id", bagIds)
          : Promise.resolve({ data: [], error: null } as const),
        bagIds.length
          ? supabase
              .from("contamination_events")
              .select("bag_id, severity")
              .in("bag_id", bagIds)
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      const error = harvests.error ?? contamination.error;
      if (error) throw error;

      return {
        batch: batch.data,
        bags: bags.data ?? [],
        harvests: harvests.data ?? [],
        contamination: contamination.data ?? [],
      };
    },
  });
}

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const { data, isPending, error } = useBatchDetail(batchId);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  const { batch, bags, harvests, contamination } = data;

  const totalWetG = harvests.reduce((sum, row) => sum + (toNumber(row.wet_weight_g) ?? 0), 0);
  const dryKg = toNumber(batch.dry_substrate_weight_kg);
  const biologicalEfficiency = dryKg && dryKg > 0 ? (totalWetG / (dryKg * 1000)) * 100 : null;
  const contaminatedBags = new Set(contamination.map((row) => row.bag_id)).size;
  const contaminationRate = bags.length ? (contaminatedBags / bags.length) * 100 : null;
  const harvestedBags = bags.filter((bag) => bag.current_stage === "harvested").length;

  const harvestByBag = new Map<string, number>();
  for (const row of harvests) {
    harvestByBag.set(row.bag_id, (harvestByBag.get(row.bag_id) ?? 0) + (toNumber(row.wet_weight_g) ?? 0));
  }
  const contaminatedBagIds = new Set(contamination.map((row) => row.bag_id));

  return (
    <div>
      <PageHeader
        title={batch.batch_code}
        subtitle={
          <>
            {batch.species?.common_name ?? "Species"} ·{" "}
            {batch.farms ? (
              <Link
                to="/rooms/$farmId"
                params={{ farmId: batch.farms.id }}
                className="underline-offset-2 hover:underline"
              >
                {batch.farms.name}
              </Link>
            ) : (
              "Room"
            )}{" "}
            · inoculated {fmtDate(batch.inoculation_date)}
          </>
        }
        action={
          canEdit ? (
            <div className="flex gap-2">
              <BatchFormDialog
                orgId={orgId}
                batch={{
                  id: batch.id,
                  batch_code: batch.batch_code,
                  species_id: batch.species_id,
                  farm_id: batch.farm_id,
                  target_avg_temp_c: batch.target_avg_temp_c,
                  target_avg_humidity_pct: batch.target_avg_humidity_pct,
                }}
              />
              <BagFormDialog
                orgId={orgId}
                batchId={batch.id}
                batchCode={batch.batch_code}
                farmId={batch.farm_id}
                speciesId={batch.species_id}
                nextBagNumber={bags.reduce((max, bag) => Math.max(max, bag.bag_number), 0) + 1}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Bags" value={bags.length} hint={`${harvestedBags} harvested`} />
        <StatTile
          label="Contamination rate"
          value={contaminationRate === null ? "—" : `${contaminationRate.toFixed(1)}%`}
          hint={`${contaminatedBags} bags affected`}
          tone={contaminationRate && contaminationRate > 10 ? "destructive" : "default"}
        />
        <StatTile
          label="Total harvest"
          value={`${(totalWetG / 1000).toFixed(2)} kg`}
          hint={`${harvests.length} flushes logged`}
        />
        <StatTile
          label="Biological efficiency"
          value={biologicalEfficiency === null ? "—" : `${biologicalEfficiency.toFixed(1)}%`}
          hint={dryKg ? `${num(dryKg, 2)} kg dry substrate` : "Set dry substrate weight"}
          tone={biologicalEfficiency && biologicalEfficiency >= 75 ? "success" : "default"}
        />
      </div>

      <BatchClimateCard
        farmId={batch.farm_id}
        farmName={batch.farms?.name}
        startDate={batch.inoculation_date}
        targetTemp={toNumber(batch.target_avg_temp_c)}
        targetHumidity={toNumber(batch.target_avg_humidity_pct)}
      />

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base">Stage spread</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {STAGE_ORDER.map((stage) => {
            const count = bags.filter((bag) => bag.current_stage === stage).length;
            if (!count) return null;
            return (
              <span key={stage} className="inline-flex items-center gap-2">
                <StageBadge stage={stage as BagStage} size="sm" />
                <span className="stat-value text-sm">{count}</span>
              </span>
            );
          })}
          {bags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bags in this batch.</p>
          ) : null}
        </CardContent>
      </Card>

      {batch.notes ? (
        <Card className="mt-4">
          <CardContent className="p-4 text-sm text-muted-foreground">{batch.notes}</CardContent>
        </Card>
      ) : null}

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Bags</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {bags.map((bag) => {
          const wet = harvestByBag.get(bag.id) ?? 0;
          return (
            <div
              key={bag.id}
              className="relative rounded-lg border border-border bg-card transition-colors hover:border-primary"
            >
              <Link to="/bags/$bagId" params={{ bagId: bag.id }} className="block p-3">
                <div className="flex items-start justify-between gap-2 pr-7">
                  <p className="truncate text-sm font-medium">{bag.bag_code}</p>
                  {contaminatedBagIds.has(bag.id) ? (
                    <span className="size-2 shrink-0 rounded-full bg-destructive" />
                  ) : null}
                </div>
                <div className="mt-2">
                  <StageBadge stage={bag.current_stage as BagStage} size="sm" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {wet > 0 ? `${(wet / 1000).toFixed(2)} kg harvested` : "No harvest yet"}
                </p>
              </Link>
              {canEdit ? (
                <div className="absolute right-1.5 top-1.5">
                  <BagFormDialog
                    orgId={orgId}
                    batchId={batch.id}
                    batchCode={batch.batch_code}
                    farmId={batch.farm_id}
                    speciesId={batch.species_id}
                    nextBagNumber={bag.bag_number}
                    bag={{
                      id: bag.id,
                      bag_number: bag.bag_number,
                      net_weight_kg: bag.net_weight_kg,
                      dry_weight_kg: bag.dry_weight_kg,
                      spawn_weight_kg: bag.spawn_weight_kg,
                      notes: bag.notes,
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
