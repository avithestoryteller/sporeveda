import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BatchFormDialog } from "@/components/BatchFormDialog";
import { fmtDate } from "@/lib/format";
import { STAGE_COLOR, STAGE_LABEL, STAGE_ORDER, type BagStage } from "@/lib/stages";


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
            stages: STAGE_ORDER.map((stage) => ({
              stage,
              count: batchBags.filter((bag) => bag.current_stage === stage).length,
            })).filter((entry) => entry.count > 0),
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
                    background: STAGE_COLOR[step.stage as BagStage],
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

function BatchStageBar({
  stages,
  bagCount,
}: {
  stages: { stage: string; count: number }[];
  bagCount: number;
}) {
  if (bagCount === 0) return null;
  return (
    <div
      className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`Bags by stage: ${stages
        .map((s) => `${STAGE_LABEL[s.stage as BagStage] ?? s.stage} ${s.count}`)
        .join(", ")}`}
    >
      {stages.map(({ stage, count }) => (
        <div
          key={stage}
          className="h-full transition-all"
          title={`${STAGE_LABEL[stage as BagStage] ?? stage}: ${count} bag${count === 1 ? "" : "s"}`}
          style={{
            width: `${(count / bagCount) * 100}%`,
            background: STAGE_COLOR[stage as BagStage] ?? "var(--muted-foreground)",
          }}
        />
      ))}
    </div>
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
        action={canEdit ? <BatchFormDialog orgId={orgId} /> : null}
      />

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : data.rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No batches yet. Start one to generate its bags.
          </CardContent>
        </Card>
      ) : (
        <>
        <StageFunnel funnel={data.funnel} totalBags={data.totalBags} />
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {data.rows.map(({ batch, bagCount, discarded, stages }) => (

                <li key={batch.id}>
                  <Link
                    to="/batches/$batchId"
                    params={{ batchId: batch.id }}
                    className="block px-4 py-3.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{batch.batch_code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {batch.species?.common_name ?? "Species"} · {batch.farms?.name ?? "Room"} ·{" "}
                        {batch.substrate_type ?? "substrate n/a"}
                        {batch.spawn_vendor ? ` · spawn ${batch.spawn_vendor}` : null}
                        {batch.substrate_vendor ? ` · substrate ${batch.substrate_vendor}` : null}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="stat-value text-sm">{bagCount} bags</p>
                      <p className="text-xs text-muted-foreground">
                        {discarded > 0 ? `${discarded} discarded · ` : ""}
                        {fmtDate(batch.inoculation_date)}
                      </p>
                    </div>
                    </div>
                    <BatchStageBar stages={stages} bagCount={bagCount} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        </>
      )}

    </div>
  );
}
