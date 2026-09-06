import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Flame, Sprout } from "lucide-react";

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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { num, todayISO, toNumber } from "@/lib/format";
import { titleCase } from "@/lib/money";
import {
  DRYING_NOTE,
  PRODUCE_CATEGORY,
  PRODUCE_LOSS_REASONS,
  deriveProduceStock,
  produceItemName,
  type ProduceItemRow,
} from "@/lib/produce";

export const Route = createFileRoute("/_authenticated/finance/produce")({
  head: () => ({
    meta: [
      { title: "Produce inventory — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Fresh and dried mushroom stock built from fruiting harvests, with wastage and drying logs.",
      },
      { property: "og:title", content: "Produce inventory — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content:
          "Fresh and dried mushroom stock built from fruiting harvests, with wastage and drying logs.",
      },
    ],
  }),
  component: ProducePage,
});

function ProducePage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();
  const ensured = useRef(false);

  const [lossFor, setLossFor] = useState<string | null>(null);
  const [dryFor, setDryFor] = useState<string | null>(null);
  const [lossForm, setLossForm] = useState({ qty: "", reason: "wastage", notes: "" });
  const [dryForm, setDryForm] = useState({ freshKg: "", driedKg: "", notes: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["produce", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [species, items, harvests, additions, usage, sales] = await Promise.all([
        supabase.from("species").select("id, common_name").order("common_name"),
        supabase
          .from("inventory_items")
          .select("id, name, category, subcategory, species_id, unit")
          .eq("org_id", orgId)
          .eq("category", PRODUCE_CATEGORY),
        supabase
          .from("harvests")
          .select("wet_weight_g, bags!inner(species_id)")
          .eq("org_id", orgId),
        supabase
          .from("costs")
          .select("inventory_item_id, quantity_purchased, status")
          .eq("org_id", orgId)
          .eq("category", PRODUCE_CATEGORY),
        supabase
          .from("inventory_usage")
          .select("inventory_item_id, quantity_used, used_date, notes")
          .eq("org_id", orgId),
        supabase
          .from("revenue")
          .select("inventory_item_id, quantity_kg")
          .eq("org_id", orgId)
          .not("inventory_item_id", "is", null),
      ]);
      const error =
        species.error ??
        items.error ??
        harvests.error ??
        additions.error ??
        usage.error ??
        sales.error;
      if (error) throw error;
      return {
        species: species.data ?? [],
        items: (items.data ?? []) as ProduceItemRow[],
        harvests: harvests.data ?? [],
        additions: additions.data ?? [],
        usage: usage.data ?? [],
        sales: sales.data ?? [],
      };
    },
  });

  const speciesNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of data?.species ?? []) map[row.id] = row.common_name;
    return map;
  }, [data?.species]);

  const harvestKgBySpecies = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of data?.harvests ?? []) {
      const speciesId = (row as { bags?: { species_id?: string | null } }).bags?.species_id;
      if (!speciesId) continue;
      map[speciesId] = (map[speciesId] ?? 0) + (toNumber(row.wet_weight_g) ?? 0) / 1000;
    }
    return map;
  }, [data?.harvests]);

  const stock = useMemo(() => {
    if (!data) return [];
    const itemIds = new Set(data.items.map((item) => item.id));
    const addedKgByItem: Record<string, number> = {};
    for (const row of data.additions) {
      if (!row.inventory_item_id || row.status !== "received") continue;
      addedKgByItem[row.inventory_item_id] =
        (addedKgByItem[row.inventory_item_id] ?? 0) + (toNumber(row.quantity_purchased) ?? 0);
    }
    const lostKgByItem: Record<string, number> = {};
    for (const row of data.usage) {
      if (!row.inventory_item_id || !itemIds.has(row.inventory_item_id)) continue;
      lostKgByItem[row.inventory_item_id] =
        (lostKgByItem[row.inventory_item_id] ?? 0) + (toNumber(row.quantity_used) ?? 0);
    }
    const soldKgByItem: Record<string, number> = {};
    for (const row of data.sales) {
      if (!row.inventory_item_id) continue;
      soldKgByItem[row.inventory_item_id] =
        (soldKgByItem[row.inventory_item_id] ?? 0) + (toNumber(row.quantity_kg) ?? 0);
    }
    return deriveProduceStock({
      items: data.items,
      speciesNames,
      harvestKgBySpecies,
      addedKgByItem,
      soldKgByItem,
      lostKgByItem,
    });
  }, [data, speciesNames, harvestKgBySpecies]);

  const ensureItems = useMutation({
    mutationFn: async (missing: { speciesId: string; form: "fresh" | "dried" }[]) => {
      const rows = missing.map((entry) => ({
        org_id: orgId,
        name: produceItemName(speciesNames[entry.speciesId] ?? "Mushroom", entry.form),
        category: PRODUCE_CATEGORY,
        subcategory: entry.form,
        species_id: entry.speciesId,
        unit: "kg",
        status: "active",
      }));
      const { error } = await supabase.from("inventory_items").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["produce", orgId] }),
  });

  // Any species with harvests gets a fresh + dried produce item, created once.
  useEffect(() => {
    if (!data || !canEdit || ensured.current || ensureItems.isPending) return;
    const existing = new Set(
      data.items.map((item) => `${item.species_id}:${item.subcategory ?? "fresh"}`),
    );
    const missing: { speciesId: string; form: "fresh" | "dried" }[] = [];
    for (const speciesId of Object.keys(harvestKgBySpecies)) {
      if (harvestKgBySpecies[speciesId] <= 0) continue;
      for (const form of ["fresh", "dried"] as const) {
        if (!existing.has(`${speciesId}:${form}`)) missing.push({ speciesId, form });
      }
    }
    if (missing.length === 0) return;
    ensured.current = true;
    ensureItems.mutate(missing);
  }, [data, canEdit, harvestKgBySpecies, ensureItems]);

  const logLoss = useMutation({
    mutationFn: async () => {
      const qty = Number(lossForm.qty);
      if (!lossFor || !Number.isFinite(qty) || qty <= 0) throw new Error("Enter a valid quantity");
      const { error } = await supabase.from("inventory_usage").insert({
        org_id: orgId,
        inventory_item_id: lossFor,
        quantity_used: qty,
        used_date: todayISO(),
        notes: [titleCase(lossForm.reason), lossForm.notes.trim()].filter(Boolean).join(" — "),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produce loss logged");
      setLossFor(null);
      setLossForm({ qty: "", reason: "wastage", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["produce", orgId] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logDrying = useMutation({
    mutationFn: async () => {
      const fresh = Number(dryForm.freshKg);
      const dried = Number(dryForm.driedKg);
      const source = stock.find((entry) => entry.item.id === dryFor);
      if (!source) throw new Error("Pick a fresh produce item");
      if (!Number.isFinite(fresh) || fresh <= 0) throw new Error("Enter the fresh weight used");
      if (!Number.isFinite(dried) || dried <= 0) throw new Error("Enter the dried weight");
      const target = stock.find(
        (entry) => entry.form === "dried" && entry.item.species_id === source.item.species_id,
      );
      if (!target) throw new Error("No dried item for this species yet");
      const usage = await supabase.from("inventory_usage").insert({
        org_id: orgId,
        inventory_item_id: source.item.id,
        quantity_used: fresh,
        used_date: todayISO(),
        notes: [DRYING_NOTE, dryForm.notes.trim()].filter(Boolean).join(" — "),
      });
      if (usage.error) throw usage.error;
      const addition = await supabase.from("costs").insert({
        org_id: orgId,
        category: PRODUCE_CATEGORY,
        inventory_item_id: target.item.id,
        quantity_purchased: dried,
        amount: 0,
        cost_type: "one_time",
        status: "received",
        incurred_date: todayISO(),
        description: `Dried ${num(fresh, 2)} kg fresh ${source.speciesName}`,
        notes: dryForm.notes.trim() || DRYING_NOTE,
      });
      if (addition.error) throw addition.error;
    },
    onSuccess: () => {
      toast.success("Drying logged");
      setDryFor(null);
      setDryForm({ freshKg: "", driedKg: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["produce", orgId] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = useMemo(
    () => ({
      fresh: stock
        .filter((entry) => entry.form === "fresh")
        .reduce((sum, entry) => sum + entry.availableKg, 0),
      dried: stock
        .filter((entry) => entry.form === "dried")
        .reduce((sum, entry) => sum + entry.availableKg, 0),
      lost: stock.reduce((sum, entry) => sum + entry.lostKg, 0),
    }),
    [stock],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Produce inventory"
        subtitle="Fresh and dried mushroom stock built from fruiting harvests"
      />

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={<Sprout className="h-4 w-4" />} label="Fresh available" value={`${num(totals.fresh, 2)} kg`} />
        <SummaryTile icon={<Flame className="h-4 w-4" />} label="Dried available" value={`${num(totals.dried, 2)} kg`} />
        <SummaryTile
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Wastage logged"
          value={`${num(totals.lost, 2)} kg`}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : stock.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No produce yet. Log a harvest on a fruiting bag and it will show up here.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {stock.map((entry) => (
            <Card key={entry.item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{entry.speciesName}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                    {entry.form}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-display text-2xl">{num(entry.availableKg, 2)} kg</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {entry.form === "fresh" ? (
                    <Row label="Harvested" value={`${num(entry.harvestedKg, 2)} kg`} />
                  ) : (
                    <Row label="Dried in" value={`${num(entry.addedKg, 2)} kg`} />
                  )}
                  <Row label="Sold" value={`${num(entry.soldKg, 2)} kg`} />
                  <Row label="Wastage" value={`${num(entry.lostKg, 2)} kg`} />
                </dl>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLossFor(entry.item.id)}>
                      Log wastage
                    </Button>
                    {entry.form === "fresh" ? (
                      <Button size="sm" variant="outline" onClick={() => setDryFor(entry.item.id)}>
                        Log drying
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(lossFor)} onOpenChange={(open) => !open && setLossFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log produce loss</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="loss-qty">Quantity (kg)</Label>
              <Input
                id="loss-qty"
                inputMode="decimal"
                value={lossForm.qty}
                onChange={(event) => setLossForm((prev) => ({ ...prev, qty: event.target.value }))}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Select
                value={lossForm.reason}
                onValueChange={(value) => setLossForm((prev) => ({ ...prev, reason: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCE_LOSS_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {titleCase(reason)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="loss-notes">Notes</Label>
              <Textarea
                id="loss-notes"
                value={lossForm.notes}
                onChange={(event) => setLossForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => logLoss.mutate()} disabled={logLoss.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dryFor)} onOpenChange={(open) => !open && setDryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log drying</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dry-fresh">Fresh weight used (kg)</Label>
              <Input
                id="dry-fresh"
                inputMode="decimal"
                value={dryForm.freshKg}
                onChange={(event) => setDryForm((prev) => ({ ...prev, freshKg: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dry-dried">Dried weight produced (kg)</Label>
              <Input
                id="dry-dried"
                inputMode="decimal"
                value={dryForm.driedKg}
                onChange={(event) => setDryForm((prev) => ({ ...prev, driedKg: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dry-notes">Notes</Label>
              <Textarea
                id="dry-notes"
                value={dryForm.notes}
                onChange={(event) => setDryForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => logDrying.mutate()} disabled={logDrying.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-lg">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </>
  );
}
