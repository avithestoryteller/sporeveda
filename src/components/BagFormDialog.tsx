import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DEFAULT_SPAWN_PER_BAG_KG,
  DEFAULT_SUBSTRATE_PER_BAG_KG,
  SPAWN_PER_BAG_STORAGE_KEY,
  SUBSTRATE_PER_BAG_STORAGE_KEY,
} from "@/lib/materials";
import { MAX_BAG_NUMBER, bagCode } from "@/lib/batch-code";
import { todayISO } from "@/lib/format";

export type BagFormValues = {
  id: string;
  bag_number: number;
  net_weight_kg: number | string | null;
  dry_weight_kg: number | string | null;
  spawn_weight_kg: number | string | null;
  prep_date: string | null;
  notes: string | null;
};

function storedRate(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function str(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

/** Create a single bag in a batch, or edit an existing one. */
export function BagFormDialog({
  orgId,
  batchId,
  batchCode,
  farmId,
  speciesId,
  nextBagNumber,
  bag,
}: {
  orgId: string;
  batchId: string;
  batchCode: string;
  farmId: string;
  speciesId: string;
  nextBagNumber: number;
  bag?: BagFormValues;
}) {
  const isEdit = Boolean(bag);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const initial = () => ({
    bagNumber: String(bag?.bag_number ?? nextBagNumber),
    dryWeight: bag
      ? str(bag.dry_weight_kg)
      : String(storedRate(SUBSTRATE_PER_BAG_STORAGE_KEY, DEFAULT_SUBSTRATE_PER_BAG_KG)),
    netWeight: bag ? str(bag.net_weight_kg) : "",
    spawnWeight: bag
      ? str(bag.spawn_weight_kg)
      : String(storedRate(SPAWN_PER_BAG_STORAGE_KEY, DEFAULT_SPAWN_PER_BAG_KG)),
    prepDate: bag ? str(bag.prep_date) : todayISO(),
    notes: bag?.notes ?? "",
  });

  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bag, nextBagNumber]);

  const mutation = useMutation({
    mutationFn: async () => {
      const bagNumber = Number(form.bagNumber);
      if (!Number.isInteger(bagNumber) || bagNumber < 1 || bagNumber > MAX_BAG_NUMBER)
        throw new Error(`Enter a bag number between 1 and ${MAX_BAG_NUMBER}`);
      const numeric = (value: string) => (value.trim() ? Number(value) : null);

      const payload = {
        bag_number: bagNumber,
        bag_code: bagCode(batchCode, bagNumber),
        net_weight_kg: numeric(form.netWeight),
        dry_weight_kg: numeric(form.dryWeight),
        spawn_weight_kg: numeric(form.spawnWeight),
        prep_date: form.prepDate || null,
        notes: form.notes.trim() || null,
      };

      if (isEdit && bag) {
        const { error } = await supabase.from("bags").update(payload).eq("id", bag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bags").insert({
          ...payload,
          org_id: orgId,
          batch_id: batchId,
          farm_id: farmId,
          species_id: speciesId,
        });
        if (error) throw error;
        if (payload.dry_weight_kg && payload.dry_weight_kg > 0) {
          window.localStorage.setItem(SUBSTRATE_PER_BAG_STORAGE_KEY, String(payload.dry_weight_kg));
        }
        if (payload.spawn_weight_kg && payload.spawn_weight_kg > 0) {
          window.localStorage.setItem(SPAWN_PER_BAG_STORAGE_KEY, String(payload.spawn_weight_kg));
        }
      }
    },
    onSuccess: async () => {
      toast.success(isEdit ? "Bag updated" : "Bag added");
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batch", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["bag"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Edit bag ${bag?.bag_number}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add bag
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit bag" : "Add bag"}</DialogTitle>
          <DialogDescription>
            Bag code is generated from the batch name and bag number.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bag-number">Bag number</Label>
              <Input
                id="bag-number"
                type="number"
                min="1"
                max={MAX_BAG_NUMBER}
                value={form.bagNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, bagNumber: event.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                {bagCode(batchCode, Number(form.bagNumber) || 0)}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-dry">Dry substrate weight (kg)</Label>
              <Input
                id="bag-dry"
                type="number"
                step="0.01"
                min="0"
                value={form.dryWeight}
                onChange={(event) => setForm((prev) => ({ ...prev, dryWeight: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-net">Net weight (kg)</Label>
              <Input
                id="bag-net"
                type="number"
                step="0.01"
                min="0"
                value={form.netWeight}
                onChange={(event) => setForm((prev) => ({ ...prev, netWeight: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-spawn">Spawn weight (kg)</Label>
              <Input
                id="bag-spawn"
                type="number"
                step="0.01"
                min="0"
                value={form.spawnWeight}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, spawnWeight: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bag-prep-date">Prep date</Label>
            <Input
              id="bag-prep-date"
              type="date"
              value={form.prepDate}
              onChange={(event) => setForm((prev) => ({ ...prev, prepDate: event.target.value }))}
              required
            />
            <p className="text-xs text-muted-foreground">Date the bag was prepared / started.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bag-notes">Notes</Label>
            <Textarea
              id="bag-notes"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add bag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
