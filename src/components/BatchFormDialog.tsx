import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { todayISO } from "@/lib/format";
import { BagRowsEditor, makeBagRow, type BagRow } from "@/components/BagRowsEditor";
import {
  DEFAULT_SPAWN_PER_BAG_KG,
  DEFAULT_SUBSTRATE_PER_BAG_KG,
  SPAWN_PER_BAG_STORAGE_KEY,
  SUBSTRATE_PER_BAG_STORAGE_KEY,
} from "@/lib/materials";
import { bagCode, buildBatchCode, nextBatchNumber } from "@/lib/batch-code";

function storedRate(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function defaultBagRow() {
  return makeBagRow({
    dryWeight: String(storedRate(SUBSTRATE_PER_BAG_STORAGE_KEY, DEFAULT_SUBSTRATE_PER_BAG_KG)),
    spawnWeight: String(storedRate(SPAWN_PER_BAG_STORAGE_KEY, DEFAULT_SPAWN_PER_BAG_KG)),
    inoculationDate: todayISO(),
  });
}

export type BatchFormValues = {
  id: string;
  batch_code: string;
  species_id: string;
  farm_id: string;
  target_avg_temp_c?: number | null;
  target_avg_humidity_pct?: number | null;
};

function useFormOptions() {
  return useQuery({
    queryKey: ["batch-form-options"],
    queryFn: async () => {
      const [farms, species, batches] = await Promise.all([
        supabase.from("farms").select("id, name").eq("is_active", true).order("name"),
        supabase.from("species").select("id, common_name").order("common_name"),
        supabase.from("batches").select("batch_code"),
      ]);
      const error = farms.error ?? species.error ?? batches.error;
      if (error) throw error;
      return {
        farms: farms.data ?? [],
        species: species.data ?? [],
        codes: (batches.data ?? []).map((row) => row.batch_code),
      };
    },
  });
}

export function BatchFormDialog({ orgId, batch }: { orgId: string; batch?: BatchFormValues }) {
  const isEdit = Boolean(batch);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const options = useFormOptions();
  const [form, setForm] = useState({
    farmId: batch?.farm_id ?? "",
    speciesId: batch?.species_id ?? "",
    newSpecies: "",
    batchCode: batch?.batch_code ?? "",
    startDate: todayISO(),
    targetTemp: batch?.target_avg_temp_c != null ? String(batch.target_avg_temp_c) : "",
    targetHumidity:
      batch?.target_avg_humidity_pct != null ? String(batch.target_avg_humidity_pct) : "",
  });
  const [bagRows, setBagRows] = useState<BagRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      farmId: batch?.farm_id ?? "",
      speciesId: batch?.species_id ?? "",
      newSpecies: "",
      batchCode: batch?.batch_code ?? "",
      startDate: todayISO(),
      targetTemp: batch?.target_avg_temp_c != null ? String(batch.target_avg_temp_c) : "",
      targetHumidity:
        batch?.target_avg_humidity_pct != null ? String(batch.target_avg_humidity_pct) : "",
    });
    setBagRows(batch ? [] : [defaultBagRow()]);
  }, [open, batch]);

  // Default the room when there is only one to choose from.
  useEffect(() => {
    const farms = options.data?.farms ?? [];
    const only = farms.length === 1 ? farms[0] : null;
    if (!form.farmId && only) {
      setForm((prev) => ({ ...prev, farmId: only.id }));
    }
  }, [options.data, form.farmId]);

  const selectedSpeciesName =
    form.speciesId === "__new__"
      ? form.newSpecies.trim()
      : ((options.data?.species ?? []).find((item) => item.id === form.speciesId)?.common_name ?? "");

  const generatedCode =
    !isEdit && selectedSpeciesName && form.startDate
      ? buildBatchCode(
          selectedSpeciesName,
          nextBatchNumber(options.data?.codes ?? [], selectedSpeciesName),
          form.startDate,
        )
      : "";

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
      if (!speciesId) throw new Error("Pick a species");
      if (!form.farmId) throw new Error("Pick a room");
      const code = isEdit ? form.batchCode.trim() : generatedCode;
      if (code.length < 2) throw new Error("Pick a species and start date to generate the batch code");

      const num = (value: string) => (value.trim() ? Number(value) : null);
      const targets = {
        target_avg_temp_c: num(form.targetTemp),
        target_avg_humidity_pct: num(form.targetHumidity),
      };

      if (isEdit && batch) {
        const { error } = await supabase
          .from("batches")
          .update({ batch_code: code, species_id: speciesId, farm_id: form.farmId, ...targets })
          .eq("id", batch.id);
        if (error) throw error;
        return batch.id;
      }

      const numeric = (value: string) => (value.trim() ? Number(value) : null);
      const rows = bagRows;
      const firstDate = form.startDate || rows.find((row) => row.inoculationDate)?.inoculationDate;
      const totalDry = rows.reduce((sum, row) => sum + (numeric(row.dryWeight) ?? 0), 0);

      const { data, error } = await supabase
        .from("batches")
        .insert({
          org_id: orgId,
          farm_id: form.farmId,
          species_id: speciesId,
          batch_code: code,
          inoculation_date: firstDate || todayISO(),
          dry_substrate_weight_kg: totalDry > 0 ? totalDry : null,
          ...targets,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (rows.length) {
        const bags = rows.map((row, index) => ({
          org_id: orgId,
          batch_id: data.id,
          farm_id: form.farmId,
          species_id: speciesId,
          bag_number: index + 1,
          bag_code: bagCode(code, index + 1),
          net_weight_kg: numeric(row.netWeight),
          dry_weight_kg: numeric(row.dryWeight),
          spawn_weight_kg: numeric(row.spawnWeight),
          inoculation_date: row.inoculationDate || form.startDate || null,
        }));
        const inserted = await supabase.from("bags").insert(bags);
        if (inserted.error) throw inserted.error;

        const last = rows[rows.length - 1];
        const dry = numeric(last?.dryWeight ?? "");
        const spawn = numeric(last?.spawnWeight ?? "");
        if (dry && dry > 0) window.localStorage.setItem(SUBSTRATE_PER_BAG_STORAGE_KEY, String(dry));
        if (spawn && spawn > 0) window.localStorage.setItem(SPAWN_PER_BAG_STORAGE_KEY, String(spawn));
      }
      return data.id;
    },
    onSuccess: async () => {
      toast.success(isEdit ? "Batch updated" : "Batch created — add bags next");
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batches"] }),
        queryClient.invalidateQueries({ queryKey: ["batch"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["batch-form-options"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button size="sm" variant="outline">
            <Pencil className="size-4" /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> New batch
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit batch" : "Start a batch"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename the batch or correct its species and room."
              : "Pick the species and start date — the batch code is generated automatically."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="batch-code">Batch code</Label>
              <Input
                id="batch-code"
                value={form.batchCode}
                maxLength={40}
                onChange={(event) => setForm((prev) => ({ ...prev, batchCode: event.target.value }))}
                required
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="batch-start">Start date</Label>
                <Input
                  id="batch-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-code">Batch code</Label>
                <Input id="batch-code" value={generatedCode} readOnly placeholder="BO1P-280826" />
                <p className="text-xs text-muted-foreground">
                  Generated from species, sequence and start date.
                </p>
              </div>
            </div>
          )}

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

          {form.speciesId === "__new__" ? (
            <div className="space-y-1.5">
              <Label htmlFor="new-species">New species name</Label>
              <Input
                id="new-species"
                value={form.newSpecies}
                maxLength={80}
                placeholder="Blue Oyster"
                onChange={(event) => setForm((prev) => ({ ...prev, newSpecies: event.target.value }))}
              />
            </div>
          ) : null}

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

          {!isEdit ? (
            <div className="space-y-2">
              <Label>Bags</Label>
              <p className="text-xs text-muted-foreground">
                Bag numbers are assigned automatically in order.
              </p>
              <BagRowsEditor rows={bagRows} onChange={setBagRows} startNumber={1} />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create batch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
