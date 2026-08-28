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

export type BatchFormValues = {
  id: string;
  batch_code: string;
  species_id: string;
  farm_id: string;
};

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
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      farmId: batch?.farm_id ?? "",
      speciesId: batch?.species_id ?? "",
      newSpecies: "",
      batchCode: batch?.batch_code ?? "",
    });
  }, [open, batch]);

  // Default the room when there is only one to choose from.
  useEffect(() => {
    const farms = options.data?.farms ?? [];
    if (!form.farmId && farms.length === 1) {
      setForm((prev) => ({ ...prev, farmId: farms[0].id }));
    }
  }, [options.data, form.farmId]);

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
      const code = form.batchCode.trim();
      if (code.length < 2) throw new Error("Enter a batch name");

      if (isEdit && batch) {
        const { error } = await supabase
          .from("batches")
          .update({ batch_code: code, species_id: speciesId, farm_id: form.farmId })
          .eq("id", batch.id);
        if (error) throw error;
        return batch.id;
      }

      const { data, error } = await supabase
        .from("batches")
        .insert({
          org_id: orgId,
          farm_id: form.farmId,
          species_id: speciesId,
          batch_code: code,
          inoculation_date: todayISO(),
        })
        .select("id")
        .single();
      if (error) throw error;
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{isEdit ? "Edit batch" : "Start a batch"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename the batch or correct its species and room."
              : "Name the batch and pick its species. Bag weights are captured when you add bags."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="batch-code">Batch name</Label>
            <Input
              id="batch-code"
              value={form.batchCode}
              maxLength={40}
              placeholder="B-2026-04"
              onChange={(event) => setForm((prev) => ({ ...prev, batchCode: event.target.value }))}
              required
            />
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
