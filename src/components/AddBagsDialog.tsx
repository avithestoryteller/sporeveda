import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function storedRate(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function AddBagsDialog({
  orgId,
  batchId,
  batchCode,
  farmId,
  speciesId,
  existingBags,
  existingDryKg,
}: {
  orgId: string;
  batchId: string;
  batchCode: string;
  farmId: string;
  speciesId: string;
  existingBags: number;
  existingDryKg: number | null;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    count: "10",
    netWeight: "",
    dryWeight: String(storedRate(SUBSTRATE_PER_BAG_STORAGE_KEY, DEFAULT_SUBSTRATE_PER_BAG_KG)),
    spawnWeight: String(storedRate(SPAWN_PER_BAG_STORAGE_KEY, DEFAULT_SPAWN_PER_BAG_KG)),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const count = Math.max(1, Math.min(500, Number(form.count) || 0));
      const netWeight = form.netWeight.trim() ? Number(form.netWeight) : null;
      const dryPerBag = form.dryWeight.trim() ? Number(form.dryWeight) : null;
      const spawnPerBag = form.spawnWeight.trim() ? Number(form.spawnWeight) : null;

      const rows = Array.from({ length: count }, (_, index) => {
        const bagNumber = existingBags + index + 1;
        return {
          org_id: orgId,
          batch_id: batchId,
          farm_id: farmId,
          species_id: speciesId,
          bag_number: bagNumber,
          bag_code: `${batchCode}-${String(bagNumber).padStart(3, "0")}`,
          net_weight_kg: netWeight,
        };
      });
      const { error } = await supabase.from("bags").insert(rows);
      if (error) throw error;

      if (dryPerBag && dryPerBag > 0) {
        const total = (existingDryKg ?? 0) + dryPerBag * count;
        const update = await supabase
          .from("batches")
          .update({ dry_substrate_weight_kg: total })
          .eq("id", batchId);
        if (update.error) throw update.error;
        window.localStorage.setItem(SUBSTRATE_PER_BAG_STORAGE_KEY, String(dryPerBag));
      }
      if (spawnPerBag && spawnPerBag > 0) {
        window.localStorage.setItem(SPAWN_PER_BAG_STORAGE_KEY, String(spawnPerBag));
      }
      return count;
    },
    onSuccess: async (count) => {
      toast.success(`${count} bags added`);
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batch", batchId] }),
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add bags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Add bags</DialogTitle>
          <DialogDescription>
            Bags are numbered from the batch name. Weights apply to every bag added now.
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
              <Label htmlFor="bag-count">Number of bags</Label>
              <Input
                id="bag-count"
                type="number"
                min="1"
                max="500"
                value={form.count}
                onChange={(event) => setForm((prev) => ({ ...prev, count: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bag-net">Net weight per bag (kg)</Label>
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
              <Label htmlFor="bag-dry">Dry substrate per bag (kg)</Label>
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
              <Label htmlFor="bag-spawn">Spawn per bag (kg)</Label>
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
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding…" : "Add bags"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
