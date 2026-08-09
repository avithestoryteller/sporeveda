import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type Farm = Database["public"]["Tables"]["farms"]["Row"];

type FormState = {
  name: string;
  location_notes: string;
  is_active: boolean;
  colTempMin: string;
  colTempMax: string;
  colHumMin: string;
  colHumMax: string;
  fruitTempMin: string;
  fruitTempMax: string;
  fruitHumMin: string;
  fruitHumMax: string;
  humMin: string;
  humMax: string;
};

const str = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

function initialState(farm?: Farm): FormState {
  return {
    name: farm?.name ?? "",
    location_notes: farm?.location_notes ?? "",
    is_active: farm?.is_active ?? true,
    colTempMin: str(farm?.target_colonization_temp_min),
    colTempMax: str(farm?.target_colonization_temp_max),
    colHumMin: str(farm?.target_colonization_humidity_min_pct),
    colHumMax: str(farm?.target_colonization_humidity_max_pct),
    fruitTempMin: str(farm?.target_fruiting_temp_min),
    fruitTempMax: str(farm?.target_fruiting_temp_max),
    fruitHumMin: str(farm?.target_fruiting_humidity_min_pct),
    fruitHumMax: str(farm?.target_fruiting_humidity_max_pct),
    humMin: str(farm?.target_humidity_min_pct),
    humMax: str(farm?.target_humidity_max_pct),
  };
}

const numeric = (value: string) => (value.trim() === "" ? null : Number(value));

export function RoomFormDialog({
  orgId,
  farm,
  trigger,
}: {
  orgId: string;
  farm?: Farm;
  trigger: ReactNode;
}) {
  const editing = Boolean(farm);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialState(farm));
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        location_notes: form.location_notes.trim() || null,
        is_active: form.is_active,
        target_colonization_temp_min: numeric(form.colTempMin),
        target_colonization_temp_max: numeric(form.colTempMax),
        target_colonization_humidity_min_pct: numeric(form.colHumMin),
        target_colonization_humidity_max_pct: numeric(form.colHumMax),
        target_fruiting_temp_min: numeric(form.fruitTempMin),
        target_fruiting_temp_max: numeric(form.fruitTempMax),
        target_fruiting_humidity_min_pct: numeric(form.fruitHumMin),
        target_fruiting_humidity_max_pct: numeric(form.fruitHumMax),
        target_humidity_min_pct: numeric(form.humMin),
        target_humidity_max_pct: numeric(form.humMax),
      };

      if (farm) {
        const { error } = await supabase
          .from("farms")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", farm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("farms").insert({ org_id: orgId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editing ? "Room updated" : "Room added");
      setOpen(false);
      if (!editing) setForm(initialState());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["farms"] }),
        queryClient.invalidateQueries({ queryKey: ["farm"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pair = (label: string, minKey: keyof FormState, maxKey: keyof FormState, unit: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          placeholder={`Min ${unit}`}
          value={form[minKey] as string}
          onChange={(event) => setForm((prev) => ({ ...prev, [minKey]: event.target.value }))}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          step="0.1"
          placeholder={`Max ${unit}`}
          value={form[maxKey] as string}
          onChange={(event) => setForm((prev) => ({ ...prev, [maxKey]: event.target.value }))}
        />
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm(initialState(farm));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing ? `Edit ${farm?.name}` : "Add a grow room"}
          </DialogTitle>
          <DialogDescription>
            Target ranges are optional — they drive the in-range checks on environment logs.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.name.trim().length < 2) {
              toast.error("Give the room a name");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="farm-name">Room name</Label>
            <Input
              id="farm-name"
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Fruiting room A"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-notes">Location notes</Label>
            <Textarea
              id="farm-notes"
              value={form.location_notes}
              maxLength={500}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, location_notes: event.target.value }))
              }
              placeholder="North shed, shelf racks 1–4"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Colonization targets
            </p>
            {pair("Temperature", "colTempMin", "colTempMax", "°C")}
            {pair("Humidity", "colHumMin", "colHumMax", "%")}
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fruiting targets
            </p>
            {pair("Temperature", "fruitTempMin", "fruitTempMax", "°C")}
            {pair("Humidity", "fruitHumMin", "fruitHumMax", "%")}
          </div>

          {pair("Overall humidity (room default)", "humMin", "humMax", "%")}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="farm-active">Room is active</Label>
              <p className="text-xs text-muted-foreground">Inactive rooms are flagged in lists.</p>
            </div>
            <Switch
              id="farm-active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : editing ? "Save changes" : "Add room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
